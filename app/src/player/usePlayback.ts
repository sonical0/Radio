// L'état de lecture : station courante, volume maître, sourdine, état du flux,
// minuterie de veille. L'interface ne connaît que ce qui sort d'ici.

import TrackPlayer, { Event, PlaybackState, type PlaybackErrorCode, useIsPlaying } from '@rntp/player';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import type { Station } from '../model/station';
import { loadArtwork, stationArtwork } from '../net/artwork';
import { backfillFromDirectory, reportListen, type DirectoryCard } from '../net/rbStation';
import {
  KEY_LAST_STATION,
  KEY_VOLUME,
  readString,
  writeString,
} from '../store/storage';
import {
  SLEEP_STEPS_MIN,
  playStation as playNative,
  setSleepTimer,
  setVolume,
  skipNext,
  setStationArtwork,
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
// Une radio coupée par le réseau finit presque toujours par revenir : dans un
// train, trois essais à deux secondes d'écart s'épuisaient bien avant la sortie
// du tunnel. On espace donc les tentatives puis on continue toutes les 30 s,
// sans renoncer, tant que l'utilisateur n'a pas arrêté.
const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000];
const STEADY_MS = 30000;
// `source` couvre un 404 mais aussi un 502 passager : quelques essais, pas plus.
const MAX_SOURCE_RETRIES = 3;
// La panne que rien ne signale : la connexion reste ouverte, les données
// n'arrivent plus, le lecteur reste en tampon sans lever d'erreur.
const STALL_MS = 20000;

/** Combien d'essais mérite une erreur de cette nature (Infinity = sans fin). */
function retryBudget(code: PlaybackErrorCode): number {
  switch (code) {
    case 'network':
    case 'unknown':
      return Infinity;
    case 'source':
      return MAX_SOURCE_RETRIES;
    default:
      // Décodeur ou sortie audio en panne, lecture refusée par le navigateur :
      // réessayer ne changera rien.
      return 0;
  }
}

function backoffDelay(attempt: number): number {
  return BACKOFF_MS[attempt - 1] ?? STEADY_MS;
}

/**
 * `onCard` reçoit la fiche d'annuaire retrouvée pour une station qui n'en avait
 * pas : c'est la bibliothèque qui la pose et la persiste, pas la lecture.
 */
export function usePlayback(stations: Station[], onCard?: (url: string, card: DirectoryCard) => void) {
  const playing = useIsPlaying();
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [master, setMaster] = useState(DEFAULT_VOLUME);
  const [muted, setMuted] = useState(false);
  const [streamState, setStreamState] = useState<StreamState>('idle');
  const [sleepStep, setSleepStep] = useState(0);
  const [sleepLeft, setSleepLeft] = useState<number | null>(null);
  // La pochette validée de la station écoutée, pour la plaque de la page. Null
  // tant qu'aucune n'est validée : l'écran n'affiche rien plutôt qu'un cadre vide.
  const [artwork, setArtwork] = useState<string | null>(null);

  const stationsRef = useRef(stations);
  stationsRef.current = stations;
  // La liste telle que la file du lecteur la voit : masquées exclues, ordre
  // d'affichage conservé.
  const visibleRef = useRef<Station[]>([]);
  visibleRef.current = stations.filter((s) => !s.hidden);
  const currentRef = useRef<string | null>(null);
  currentRef.current = currentUrl;
  const attempts = useRef(0);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stallTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Nombre d'essais accordés à la coupure en cours, selon la nature de l'erreur.
  const budgetRef = useRef(Infinity);
  // Posé au renoncement, levé par la prochaine action de l'utilisateur : une
  // erreur en double arrivant après coup ne doit pas relancer les essais.
  const gaveUp = useRef(false);
  // Ce que l'utilisateur a demandé, pas ce que le lecteur fait : en tampon,
  // `playing` est faux alors qu'on attend bien du son.
  const wantPlay = useRef(false);
  const volRef = useRef(DEFAULT_VOLUME);
  // L'URL réellement chargée dans le lecteur. Elle diffère de currentUrl juste
  // après une restauration : la dernière station est re-sélectionnée sans être
  // jouée, donc rien n'est attaché tant qu'on n'a pas appuyé sur lecture.
  const loadedUrl = useRef<string | null>(null);
  // Le volume d'avant la sourdine, pour le rendre tel quel au démuet.
  const beforeMute = useRef(DEFAULT_VOLUME);

  const current = stations.find((s) => s.url === currentUrl) ?? null;
  const effectiveMaster = muted ? 0 : master;
  volRef.current = effectiveMaster;

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
  const clearStall = useCallback(() => {
    if (stallTimer.current) clearTimeout(stallTimer.current);
    stallTimer.current = null;
  }, []);

  const clearReconnect = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    reconnectTimer.current = null;
    clearStall();
    attempts.current = 0;
    gaveUp.current = false;
    setReconnectAttempt(0);
  }, [clearStall]);

  /**
   * Recharge la station chargée. `retry()` ne suffit pas : c'est un
   * `prepare()`, sans effet sur un lecteur resté en tampon — précisément le
   * cas du blocage silencieux. Reconstruire la file marche dans les deux cas.
   */
  const reload = useCallback(() => {
    reconnectTimer.current = null;
    const url = loadedUrl.current;
    const s = url ? stationsRef.current.find((x) => x.url === url) : undefined;
    if (!s || !wantPlay.current) return;
    playNative(s, volRef.current, visibleRef.current);
  }, []);

  /** Programme la tentative suivante, ou renonce si `budget` est épuisé. */
  const scheduleReconnect = useCallback(
    (budget: number) => {
      const giveUp = () => {
        gaveUp.current = true;
        setStreamState('dropped');
      };
      if (gaveUp.current) return;
      if (reconnectTimer.current) {
        // Une même coupure peut remonter deux fois : sur le web, le rejet de
        // play() arrive classé 'unknown', puis l'erreur de l'élément, plus
        // précise. On garde le verdict le plus sévère des deux.
        budgetRef.current = Math.min(budgetRef.current, budget);
        if (attempts.current > budgetRef.current) {
          clearTimeout(reconnectTimer.current);
          reconnectTimer.current = null;
          giveUp();
        }
        return;
      }
      budgetRef.current = budget;
      clearStall();
      if (attempts.current >= budget) {
        giveUp();
        return;
      }
      attempts.current += 1;
      setReconnectAttempt(attempts.current);
      setStreamState('reconnecting');
      reconnectTimer.current = setTimeout(reload, backoffDelay(attempts.current));
    },
    [clearStall, reload],
  );

  /** Le réseau revient, ou l'utilisateur rouvre l'appli : inutile d'attendre. */
  const reconnectNow = useCallback(() => {
    if (!reconnectTimer.current) return;
    clearTimeout(reconnectTimer.current);
    reload();
  }, [reload]);

  const cardRef = useRef(onCard);
  cardRef.current = onCard;

  /**
   * Ce qui accompagne le démarrage d'une station, sans jamais le retarder : on
   * signale l'écoute à l'annuaire, on sonde la pochette, et on rattrape la
   * fiche des stations ajoutées avant qu'on en garde une. Les trois sont
   * silencieux en cas d'échec — aucun n'est nécessaire à la lecture.
   */
  const onStationStarted = useCallback((s: Station) => {
    reportListen(s);
    // Un sondage peut aboutir après un changement de station : la pochette
    // n'est posée que si celle qu'on écoute est toujours la sienne.
    const show = (src: string) => {
      setStationArtwork(s.url, src);
      if (currentRef.current === s.url) setArtwork(src);
    };
    setArtwork(stationArtwork(s)?.src ?? null);
    loadArtwork(s, (art) => show(art.src));
    void backfillFromDirectory(s).then((card) => {
      if (!card?.uuid) return;
      cardRef.current?.(s.url, card);
      // La station de l'état a changé, mais celle qu'on tient est l'ancienne :
      // on sonde la pochette avec la fiche qui vient d'arriver.
      if (card.favicon) loadArtwork({ ...s, ...card }, (art) => show(art.src));
    });
  }, []);

  const select = useCallback(
    (s: Station) => {
      clearReconnect();
      if (currentRef.current === s.url && loadedUrl.current === s.url) {
        wantPlay.current = !playing;
        togglePlayNative(playing, stationsRef.current.find((x) => x.url === currentRef.current)?.boost ?? 0);
        return;
      }
      setCurrentUrl(s.url);
      setStreamState('buffering');
      wantPlay.current = true;
      // La file est reconstruite à chaque choix explicite : c'est le seul
      // moment où l'on sait que l'utilisateur accepte une coupure. Une station
      // ajoutée en cours d'écoute n'entre donc dans la file qu'au prochain
      // choix — la reconstruire à chaud relancerait le flux en cours.
      playNative(s, muted ? 0 : master, visibleRef.current);
      loadedUrl.current = s.url;
      onStationStarted(s);
      void writeString(KEY_LAST_STATION, s.url);
    },
    [clearReconnect, master, muted, onStationStarted, playing],
  );

  const stop = useCallback(() => {
    clearReconnect();
    wantPlay.current = false;
    loadedUrl.current = null;
    stopNative();
    setCurrentUrl(null);
    setArtwork(null);
    setStreamState('idle');
  }, [clearReconnect]);

  const toggle = useCallback(() => {
    const url = currentRef.current;
    if (!url) return;
    // Appuyer pendant une reconnexion, c'est la réclamer tout de suite : le
    // natif prépare un lecteur à l'arrêt avant de jouer.
    clearReconnect();
    // Après une restauration, la station est sélectionnée mais pas chargée :
    // appuyer sur lecture doit l'attacher, pas démarrer un lecteur vide.
    if (loadedUrl.current !== url) {
      const s = stationsRef.current.find((x) => x.url === url);
      if (!s) return;
      setStreamState('buffering');
      wantPlay.current = true;
      playNative(s, muted ? 0 : master, visibleRef.current);
      loadedUrl.current = url;
      onStationStarted(s);
      return;
    }
    wantPlay.current = !playing;
    togglePlayNative(playing, stationsRef.current.find((x) => x.url === currentRef.current)?.boost ?? 0);
  }, [clearReconnect, master, muted, onStationStarted, playing]);

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
        if (state === PlaybackState.Buffering) {
          // Pendant une reconnexion, le tampon est la tentative elle-même : le
          // libellé reste « reconnexion », sinon le compteur clignoterait.
          setStreamState(attempts.current ? 'reconnecting' : 'buffering');
          clearStall();
          if (loadedUrl.current && wantPlay.current) {
            stallTimer.current = setTimeout(() => {
              stallTimer.current = null;
              if (!wantPlay.current) return;
              if (TrackPlayer.getPlaybackState() !== PlaybackState.Buffering) return;
              scheduleReconnect(Infinity);
            }, STALL_MS);
          }
        } else if (state === PlaybackState.Ready) {
          // Le flux est reparti : on remet le compteur de tentatives à zéro,
          // sinon des coupures espacées dans la journée allongeraient les délais
          // de la suivante, et épuiseraient le budget des erreurs `source`.
          clearReconnect();
          setStreamState(currentRef.current ? 'playing' : 'idle');
        } else if (state === PlaybackState.Idle) {
          clearStall();
          // Une tentative est prévue, ou en cours (reload() repasse par l'arrêt
          // en reconstruisant la file) : on n'a pas renoncé. Le renoncement,
          // lui, est posé par scheduleReconnect().
          if (reconnectTimer.current || (attempts.current && wantPlay.current)) return;
          setStreamState(loadedUrl.current ? 'dropped' : 'idle');
        }
      }),
      TrackPlayer.addEventListener(Event.PlaybackError, ({ code }) => {
        if (!loadedUrl.current || !wantPlay.current) return;
        scheduleReconnect(retryBudget(code));
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
        // Zapper pendant une reconnexion, c'est changer de flux : le compteur
        // repart de zéro. Mais reload() reconstruit la file sur la même
        // station, et cette transition-là ne doit rien remettre à zéro.
        if (url !== loadedUrl.current) clearReconnect();
        currentRef.current = url;
        loadedUrl.current = url;
        setCurrentUrl(url);
        // Le gain de la station suit le changement de piste — tant que ce code
        // tourne. Application tuée, le zapping natif garde le gain de la
        // station précédente : ExoPlayer n'a qu'un volume, pas un par piste.
        setVolume(s, muted ? 0 : master);
        // Le zapping natif n'est pas passé par select() : c'est ici que la
        // station commence, y compris quand l'ordre vient de la notification,
        // du casque ou du widget.
        onStationStarted(s);
        void writeString(KEY_LAST_STATION, url);
      }),
      TrackPlayer.addEventListener(Event.SleepTimerTriggered, () => {
        setSleepStep(0);
        setSleepLeft(null);
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [clearReconnect, clearStall, onStationStarted, scheduleReconnect, step]);

  // Sans module réseau natif, le téléphone n'annonce pas le retour du signal ;
  // rouvrir l'appli en est le meilleur indice. Le navigateur, lui, le dit.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') reconnectNow();
    });
    if (Platform.OS !== 'web' || typeof window === 'undefined') return () => sub.remove();
    window.addEventListener('online', reconnectNow);
    return () => {
      sub.remove();
      window.removeEventListener('online', reconnectNow);
    };
  }, [reconnectNow]);

  useEffect(() => () => clearReconnect(), [clearReconnect]);

  return {
    current,
    currentUrl,
    artwork,
    playing,
    streamState,
    reconnectAttempt,
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
