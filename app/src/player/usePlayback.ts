// L'état de lecture : station courante, volume maître, sourdine, état du flux,
// minuterie de veille. L'interface ne connaît que ce qui sort d'ici.

import TrackPlayer, { Event, PlaybackState, useIsPlaying } from '@rntp/player';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import type { Station } from '../model/station';
import {
  KEY_LAST_STATION,
  KEY_VOLUME,
  readString,
  writeString,
} from '../store/storage';
import {
  SLEEP_STEPS_MIN,
  playStation as playNative,
  retry,
  setSleepTimer,
  setVolume,
  skipNext,
  skipPrevious,
  stop as stopNative,
  togglePlay as togglePlayNative,
} from './player';

/** Ce que la ligne « now playing » affiche en plus du titre. */
export type StreamState = 'idle' | 'buffering' | 'playing' | 'reconnecting' | 'dropped';

// Sur téléphone, le volume général est celui du système : l'appli sort à plein
// niveau et laisse les touches physiques faire leur travail. Sur le web, où la
// page n'a pas de bouton de volume, le réglage existe et vaut 0,7 par défaut.
const DEFAULT_VOLUME = Platform.OS === 'web' ? 0.7 : 1;
// Mêmes valeurs que sur le site : trois tentatives espacées de deux secondes
// avant de renoncer et de le dire.
const MAX_RECONNECT = 3;
const RECONNECT_DELAY_MS = 2000;

export function usePlayback(stations: Station[]) {
  const playing = useIsPlaying();
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [master, setMaster] = useState(DEFAULT_VOLUME);
  const [muted, setMuted] = useState(false);
  const [streamState, setStreamState] = useState<StreamState>('idle');
  const [sleepStep, setSleepStep] = useState(0);
  const [sleepLeft, setSleepLeft] = useState<number | null>(null);

  const stationsRef = useRef(stations);
  stationsRef.current = stations;
  // La liste telle que la file du lecteur la voit : masquées exclues, ordre
  // d'affichage conservé.
  const visibleRef = useRef<Station[]>([]);
  visibleRef.current = stations.filter((s) => !s.hidden);
  const currentRef = useRef<string | null>(null);
  currentRef.current = currentUrl;
  const attempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // L'URL réellement chargée dans le lecteur. Elle diffère de currentUrl juste
  // après une restauration : la dernière station est re-sélectionnée sans être
  // jouée, donc rien n'est attaché tant qu'on n'a pas appuyé sur lecture.
  const loadedUrl = useRef<string | null>(null);
  // Le volume d'avant la sourdine, pour le rendre tel quel au démuet.
  const beforeMute = useRef(DEFAULT_VOLUME);

  const current = stations.find((s) => s.url === currentUrl) ?? null;
  const effectiveMaster = muted ? 0 : master;

  // ─── Reprise de l'état ───
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    (async () => {
      const v = parseFloat((await readString(KEY_VOLUME)) ?? '');
      if (isFinite(v) && v >= 0 && v <= 1) {
        setMaster(v);
        beforeMute.current = v;
      }
    })();
  }, []);

  // La dernière station écoutée est re-sélectionnée, jamais relancée : démarrer
  // du son à l'ouverture est intrusif, et les navigateurs le bloquent de toute
  // façon. On attend que la bibliothèque soit chargée pour savoir si elle existe
  // encore, et qu'elle n'ait pas été masquée entre-temps.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !stations.length) return;
    restored.current = true;
    (async () => {
      const url = await readString(KEY_LAST_STATION);
      if (!url) return;
      const s = stations.find((x) => x.url === url && !x.hidden);
      if (s) setCurrentUrl(s.url);
    })();
  }, [stations]);

  // ─── Volume ───
  useEffect(() => {
    setVolume(current, effectiveMaster);
  }, [current, effectiveMaster]);

  const changeMaster = useCallback((v: number) => {
    setMaster(v);
    if (v > 0) {
      setMuted(false);
      beforeMute.current = v;
    }
  }, []);

  const commitMaster = useCallback((v: number) => {
    void writeString(KEY_VOLUME, String(v));
  }, []);

  /** Pas de volume au clavier : ±5 %, borné, et persisté comme un glissement. */
  const nudgeVolume = useCallback(
    (delta: number) => {
      setMaster((v) => {
        const next = Math.max(0, Math.min(1, v + delta));
        if (next > 0) {
          setMuted(false);
          beforeMute.current = next;
        }
        void writeString(KEY_VOLUME, String(next));
        return next;
      });
    },
    [],
  );

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      if (!m) beforeMute.current = master;
      return !m;
    });
  }, [master]);

  // ─── Sélection et transport ───
  const clearReconnect = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    reconnectTimer.current = null;
    attempts.current = 0;
  }, []);

  const select = useCallback(
    (s: Station) => {
      clearReconnect();
      if (currentRef.current === s.url && loadedUrl.current === s.url) {
        togglePlayNative(playing, stationsRef.current.find((x) => x.url === currentRef.current)?.boost ?? 0);
        return;
      }
      setCurrentUrl(s.url);
      setStreamState('buffering');
      // La file est reconstruite à chaque choix explicite : c'est le seul
      // moment où l'on sait que l'utilisateur accepte une coupure. Une station
      // ajoutée en cours d'écoute n'entre donc dans la file qu'au prochain
      // choix — la reconstruire à chaud relancerait le flux en cours.
      playNative(s, muted ? 0 : master, visibleRef.current);
      loadedUrl.current = s.url;
      void writeString(KEY_LAST_STATION, s.url);
    },
    [clearReconnect, master, muted, playing],
  );

  const stop = useCallback(() => {
    clearReconnect();
    loadedUrl.current = null;
    stopNative();
    setCurrentUrl(null);
    setStreamState('idle');
  }, [clearReconnect]);

  const toggle = useCallback(() => {
    const url = currentRef.current;
    if (!url) return;
    // Après une restauration, la station est sélectionnée mais pas chargée :
    // appuyer sur lecture doit l'attacher, pas démarrer un lecteur vide.
    if (loadedUrl.current !== url) {
      const s = stationsRef.current.find((x) => x.url === url);
      if (!s) return;
      setStreamState('buffering');
      playNative(s, muted ? 0 : master, visibleRef.current);
      loadedUrl.current = url;
      return;
    }
    togglePlayNative(playing, stationsRef.current.find((x) => x.url === currentRef.current)?.boost ?? 0);
  }, [master, muted, playing]);

  /**
   * Zapper, c'est déplacer l'index dans la file du lecteur — pas recharger une
   * station. Le même geste sert au bouton de l'écran, à la notification, au
   * casque et au widget ; l'état suit par `MediaItemTransition`.
   *
   * Tant que rien n'est chargé (juste après une restauration), il n'y a pas de
   * file : on retombe sur une sélection, qui en construit une.
   */
  const step = useCallback(
    (dir: 1 | -1) => {
      const visible = visibleRef.current;
      if (!visible.length) return;
      if (!loadedUrl.current) {
        const at = visible.findIndex((s) => s.url === currentRef.current);
        const next = visible[(((at + dir) % visible.length) + visible.length) % visible.length];
        if (next) select(next);
        return;
      }
      if (dir === 1) skipNext();
      else skipPrevious();
    },
    [select],
  );

  // ─── Minuterie de veille ───
  const cycleSleep = useCallback(() => {
    setSleepStep((i) => {
      const next = (i + 1) % SLEEP_STEPS_MIN.length;
      setSleepTimer(SLEEP_STEPS_MIN[next]);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!SLEEP_STEPS_MIN[sleepStep]) {
      setSleepLeft(null);
      return;
    }
    const tick = () => {
      const t = TrackPlayer.getSleepTimer();
      setSleepLeft(t && t.type === 'time' ? Math.max(0, Math.round(t.remainingSeconds)) : null);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sleepStep]);

  // ─── Évènements du lecteur ───
  useEffect(() => {
    const subs = [
      TrackPlayer.addEventListener(Event.PlaybackStateChanged, ({ state }) => {
        if (state === PlaybackState.Buffering) setStreamState('buffering');
        else if (state === PlaybackState.Ready) {
          // Le flux est reparti : on remet le compteur de tentatives à zéro,
          // sinon trois coupures espacées dans la journée finiraient par
          // épuiser le quota et faire renoncer sur la première suivante.
          clearReconnect();
          setStreamState(currentRef.current ? 'playing' : 'idle');
        } else if (state === PlaybackState.Idle) {
          setStreamState(loadedUrl.current ? 'dropped' : 'idle');
        }
      }),
      TrackPlayer.addEventListener(Event.PlaybackError, () => {
        if (!loadedUrl.current) return;
        if (attempts.current >= MAX_RECONNECT) {
          setStreamState('dropped');
          return;
        }
        attempts.current += 1;
        setStreamState('reconnecting');
        reconnectTimer.current = setTimeout(retry, RECONNECT_DELAY_MS);
      }),
      // **Le changement de station se constate, il ne se commande plus.** Le
      // natif zappe seul dans la file ; ce qui remonte ici est le résultat,
      // d'où qu'il vienne — écran, notification, casque, widget. Les
      // écouteurs RemoteNext/RemotePrevious qui vivaient ici ne servaient plus :
      // en `handling: 'native'` ils ne se déclenchent jamais.
      TrackPlayer.addEventListener(Event.MediaItemTransition, ({ item }) => {
        // `mediaId` plutôt que `url` : le type d'`url` couvre aussi les
        // ressources locales numérotées, et c'est nous qui posons l'identifiant
        // à la construction de la file — l'URL de la station.
        const url = item?.mediaId ?? null;
        if (!url) return;
        const s = stationsRef.current.find((x) => x.url === url);
        if (!s) return;
        currentRef.current = url;
        loadedUrl.current = url;
        setCurrentUrl(url);
        // Le gain de la station suit le changement de piste — tant que ce code
        // tourne. Application tuée, le zapping natif garde le gain de la
        // station précédente : ExoPlayer n'a qu'un volume, pas un par piste.
        setVolume(s, muted ? 0 : master);
        void writeString(KEY_LAST_STATION, url);
      }),
      TrackPlayer.addEventListener(Event.SleepTimerTriggered, () => {
        setSleepStep(0);
        setSleepLeft(null);
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [clearReconnect, step]);

  useEffect(() => () => clearReconnect(), [clearReconnect]);

  return {
    current,
    currentUrl,
    playing,
    streamState,
    master,
    muted,
    sleepMinutes: SLEEP_STEPS_MIN[sleepStep],
    sleepLeft,
    select,
    stop,
    toggle,
    next: useCallback(() => step(1), [step]),
    previous: useCallback(() => step(-1), [step]),
    changeMaster,
    commitMaster,
    toggleMute,
    nudgeVolume,
    cycleSleep,
  };
}
