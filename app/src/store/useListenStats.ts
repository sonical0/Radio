// Le temps d'écoute, station par station, jour par jour, sur un mois glissant.
//
// Repris de l'écran STATS de kleeamp, porté du site le 23/09/2026 avec ses
// règles. Tout reste sur ce téléphone, comme l'historique des titres : rien
// n'est exporté ni envoyé — c'est l'histoire de l'appareil, pas une partie de
// la bibliothèque.

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type { Station } from '../model/station';
import { KEY_LISTEN_STATS, readJson, writeJson } from './storage';

const STATS_DAYS = 31;
/**
 * Un pas toutes les cinq secondes. Le temps compté est celui mesuré à
 * l'horloge entre deux pas, jamais cinq secondes forfaitaires : une appli en
 * arrière-plan voit ses minuteries ralenties, l'horloge, elle, ne ment pas.
 */
const TICK_MS = 5000;
/**
 * Au-delà, l'écart vient d'un téléphone endormi ou d'un processus suspendu,
 * pendant quoi rien n'a joué : on n'en compte que ce plafond.
 */
const MAX_STEP_S = 65;
const WRITE_DEBOUNCE_MS = 30000;
export const STATS_TOP_SHOWN = 8;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `days` : le temps par jour et par URL. `names` : le nom **au moment de
 * l'écoute**, pour qu'une station renommée ou supprimée garde un passé lisible.
 */
export type ListenStats = {
  days: Record<string, Record<string, number>>;
  names: Record<string, string>;
};

const empty = (): ListenStats => ({ days: {}, names: {} });

export function dayKey(d: Date): string {
  const p2 = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
}

function cutoffKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - (STATS_DAYS - 1));
  return dayKey(d);
}

/** Hors de la fenêtre : oublié — et les noms que plus aucun jour ne référence. */
function prune(st: ListenStats): ListenStats {
  const cutoff = cutoffKey();
  const days: ListenStats['days'] = {};
  const used = new Set<string>();
  for (const [day, byUrl] of Object.entries(st.days)) {
    // Les clés AAAA-MM-JJ se comparent comme des chaînes.
    if (day < cutoff) continue;
    days[day] = byUrl;
    for (const url of Object.keys(byUrl)) used.add(url);
  }
  const names: ListenStats['names'] = {};
  for (const [url, name] of Object.entries(st.names)) if (used.has(url)) names[url] = name;
  return { days, names };
}

/** Ce qui sort du stockage vient d'une version précédente : tout est revalidé. */
function sanitize(raw: unknown): ListenStats {
  const out = empty();
  const r = raw as Partial<ListenStats> | null;
  if (r && r.days && typeof r.days === 'object') {
    for (const [day, byUrl] of Object.entries(r.days)) {
      if (!DAY_RE.test(day) || !byUrl || typeof byUrl !== 'object') continue;
      const clean: Record<string, number> = {};
      for (const [url, sec] of Object.entries(byUrl as Record<string, unknown>)) {
        if (url.startsWith('http') && typeof sec === 'number' && isFinite(sec) && sec > 0) {
          clean[url] = sec;
        }
      }
      if (Object.keys(clean).length) out.days[day] = clean;
    }
  }
  if (r && r.names && typeof r.names === 'object') {
    for (const [url, name] of Object.entries(r.names as Record<string, unknown>)) {
      if (url.startsWith('http') && typeof name === 'string') out.names[url] = name;
    }
  }
  return prune(out);
}

/** « 45 s », « 12 min », « 3 h 05 ». */
export function fmtListen(sec: number): string {
  if (sec < 60) return Math.round(sec) + ' s';
  const min = Math.round(sec / 60);
  if (min < 60) return min + ' min';
  return Math.floor(min / 60) + ' h ' + String(min % 60).padStart(2, '0');
}

export function dayTotal(st: ListenStats, day: string): number {
  const byUrl = st.days[day];
  if (!byUrl) return 0;
  let t = 0;
  for (const sec of Object.values(byUrl)) t += sec;
  return t;
}

/** Le total des `n` derniers jours, aujourd'hui compris. */
export function rangeTotal(st: ListenStats, n: number): number {
  let t = 0;
  const d = new Date();
  for (let i = 0; i < n; i++) {
    t += dayTotal(st, dayKey(d));
    d.setDate(d.getDate() - 1);
  }
  return t;
}

/** Les 31 derniers jours, du plus ancien au plus récent : l'ordre d'un histogramme. */
export function dayBars(st: ListenStats): { day: string; total: number }[] {
  const out: { day: string; total: number }[] = [];
  const d = new Date();
  d.setDate(d.getDate() - (STATS_DAYS - 1));
  for (let i = 0; i < STATS_DAYS; i++) {
    const key = dayKey(d);
    out.push({ day: key, total: dayTotal(st, key) });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** Les stations les plus écoutées de la fenêtre, la plus longue en tête. */
export function topStations(
  st: ListenStats,
  stations: Station[],
): { url: string; name: string; total: number }[] {
  const byUrl: Record<string, number> = {};
  for (const day of Object.values(st.days)) {
    for (const [url, sec] of Object.entries(day)) byUrl[url] = (byUrl[url] ?? 0) + sec;
  }
  return Object.entries(byUrl)
    .map(([url, total]) => ({
      url,
      // Le nom d'aujourd'hui si la station est encore là, sinon celui de l'écoute.
      name: stations.find((s) => s.url === url)?.name ?? st.names[url] ?? url,
      total,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, STATS_TOP_SHOWN);
}

export type ListenStatsApi = {
  stats: ListenStats;
  loading: boolean;
  clear: () => void;
};

/**
 * `audible` doit dire que le son **sort** : ni pause, ni tampon vide, ni
 * reconnexion en attente. C'est l'appelant qui le sait.
 */
export function useListenStats(station: Station | null, audible: boolean): ListenStatsApi {
  const [stats, setStats] = useState<ListenStats>(empty);
  const [loading, setLoading] = useState(true);
  // L'instant du dernier point compté. 0 = le chronomètre est à l'arrêt.
  const lastTick = useRef(0);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<ListenStats | null>(null);

  useEffect(() => {
    void (async () => {
      setStats(sanitize(await readJson<unknown>(KEY_LISTEN_STATS, {})));
      setLoading(false);
    })();
  }, []);

  const flush = useCallback(() => {
    if (writeTimer.current) {
      clearTimeout(writeTimer.current);
      writeTimer.current = null;
    }
    if (pending.current) void writeJson(KEY_LISTEN_STATS, pending.current);
    pending.current = null;
  }, []);

  const persistSoon = useCallback((next: ListenStats) => {
    pending.current = next;
    if (writeTimer.current) return;
    writeTimer.current = setTimeout(() => {
      writeTimer.current = null;
      if (pending.current) void writeJson(KEY_LISTEN_STATS, pending.current);
      pending.current = null;
    }, WRITE_DEBOUNCE_MS);
  }, []);

  /** Ajoute le temps écoulé depuis le dernier point à la station en cours. */
  const account = useCallback(
    (url: string, name: string, now: number) => {
      const step = Math.min((now - lastTick.current) / 1000, MAX_STEP_S);
      if (!lastTick.current || step <= 0) return;
      setStats((prev) => {
        const day = dayKey(new Date(now));
        const next: ListenStats = {
          days: { ...prev.days, [day]: { ...(prev.days[day] ?? {}) } },
          names: { ...prev.names, [url]: name },
        };
        next.days[day][url] = (next.days[day][url] ?? 0) + step;
        const pruned = prune(next);
        persistSoon(pruned);
        return pruned;
      });
    },
    [persistSoon],
  );

  /**
   * Le pas régulier compte pendant la lecture ; le nettoyage de l'effet solde
   * jusqu'à l'instant de l'arrêt. Sans ce solde, jusqu'à cinq secondes se
   * perdaient au début et à la fin de chaque écoute — mesuré sur le site, où
   * 16 s comptées au seul pas n'en faisaient que 10.
   */
  useEffect(() => {
    if (loading || !audible || !station) {
      lastTick.current = 0;
      return;
    }
    const { url, name } = station;
    lastTick.current = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      account(url, name, now);
      lastTick.current = now;
    }, TICK_MS);
    return () => {
      clearInterval(id);
      account(url, name, Date.now());
      lastTick.current = 0;
    };
  }, [loading, audible, station, account]);

  // Partir en arrière-plan, c'est le moment où le processus peut être tué :
  // ce qui attendait son écriture différée ne doit pas partir avec lui.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') flush();
    });
    return () => sub.remove();
  }, [flush]);

  useEffect(() => () => flush(), [flush]);

  const clear = useCallback(() => {
    lastTick.current = 0;
    pending.current = null;
    setStats(empty());
    void writeJson(KEY_LISTEN_STATS, empty());
  }, []);

  return { stats, loading, clear };
}
