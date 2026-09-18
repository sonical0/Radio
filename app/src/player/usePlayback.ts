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
        togglePlayNative(playing);
        return;
      }
      setCurrentUrl(s.url);
      setStreamState('buffering');
      playNative(s, muted ? 0 : master);
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
      playNative(s, muted ? 0 : master);
      loadedUrl.current = url;
      return;
    }
    togglePlayNative(playing);
  }, [master, muted, playing]);

  /**
   * Parcourt la liste en sautant les masquées : elles restent dans le tableau
   * (la corbeille en vit), mais ← et → ne doivent pas y tomber.
   */
  const step = useCallback(
    (dir: 1 | -1) => {
      const visible = stationsRef.current.filter((s) => !s.hidden);
      if (!visible.length) return;
      const at = visible.findIndex((s) => s.url === currentRef.current);
      const next = visible[(((at + dir) % visible.length) + visible.length) % visible.length];
      if (next) select(next);
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
      // Les boutons suivant/précédent de la notification et du casque : le natif
      // ne sait pas ce qu'est « la station d'après », c'est à nous de le dire.
      TrackPlayer.addEventListener(Event.RemoteNext, () => step(1)),
      TrackPlayer.addEventListener(Event.RemotePrevious, () => step(-1)),
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
