// L'historique des titres.
//
// « C'était quoi, ce morceau ? » est la question qu'une radio provoque, et
// l'application a déjà la réponse sous la main : elle sonde les métadonnées de
// toutes les stations visibles toutes les trente secondes, et lit l'ICY du flux
// en cours. Jusqu'ici elle jetait tout dès le titre suivant.

import { useCallback, useEffect, useRef, useState } from 'react';

import type { Station } from '../model/station';
import { KEY_HISTORY, readJson, writeJson } from './storage';

export type HistoryEntry = {
  /** L'URL du flux : la seule clé stable, ici comme partout ailleurs. */
  url: string;
  /** Le nom au moment de l'écoute — une station renommée depuis garde son passé. */
  station: string;
  title: string;
  /** Epoch ms. */
  at: number;
};

/**
 * Deux plafonds. Le global protège le stockage, le second empêche une station
 * bavarde — une qui change de titre toutes les deux minutes — d'évincer toutes
 * les autres de l'historique.
 */
const MAX_TOTAL = 600;
const MAX_PER_STATION = 200;

/** L'écriture suit les titres, qui arrivent par vagues : on la laisse retomber. */
const WRITE_DEBOUNCE_MS = 3000;

export type History = {
  entries: HistoryEntry[];
  loading: boolean;
  clear: () => void;
};

export function useHistory(stations: Station[], titles: Record<string, string>): History {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  // Le dernier titre retenu par station : sans lui, chaque tour de sondage
  // réécrirait le même morceau.
  const lastByUrl = useRef<Record<string, string>>({});
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<HistoryEntry[] | null>(null);

  useEffect(() => {
    void (async () => {
      const stored = await readJson<HistoryEntry[]>(KEY_HISTORY, []);
      setEntries(stored);
      for (const e of stored) {
        if (lastByUrl.current[e.url] === undefined) lastByUrl.current[e.url] = e.title;
      }
      setLoading(false);
    })();
  }, []);

  const persistSoon = useCallback((next: HistoryEntry[]) => {
    pending.current = next;
    if (writeTimer.current) return;
    writeTimer.current = setTimeout(() => {
      writeTimer.current = null;
      if (pending.current) void writeJson(KEY_HISTORY, pending.current);
      pending.current = null;
    }, WRITE_DEBOUNCE_MS);
  }, []);

  useEffect(
    () => () => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
      // Ce qui attendait d'être écrit ne doit pas disparaître avec l'écran.
      if (pending.current) void writeJson(KEY_HISTORY, pending.current);
    },
    [],
  );

  useEffect(() => {
    if (loading) return;
    const fresh: HistoryEntry[] = [];
    for (const [url, title] of Object.entries(titles)) {
      const clean = title.trim();
      if (!clean || lastByUrl.current[url] === clean) continue;
      lastByUrl.current[url] = clean;
      const station = stations.find((s) => s.url === url);
      fresh.push({ url, station: station?.name ?? url, title: clean, at: Date.now() });
    }
    if (!fresh.length) return;

    setEntries((prev) => {
      // Le plus récent en tête : c'est l'ordre dans lequel on cherche un
      // morceau qu'on vient d'entendre.
      const merged = [...fresh.reverse(), ...prev];
      const perStation: Record<string, number> = {};
      const kept: HistoryEntry[] = [];
      for (const e of merged) {
        const n = (perStation[e.url] ?? 0) + 1;
        if (n > MAX_PER_STATION) continue;
        perStation[e.url] = n;
        kept.push(e);
        if (kept.length >= MAX_TOTAL) break;
      }
      persistSoon(kept);
      return kept;
    });
  }, [loading, persistSoon, stations, titles]);

  const clear = useCallback(() => {
    lastByUrl.current = {};
    setEntries([]);
    void writeJson(KEY_HISTORY, []);
  }, []);

  return { entries, loading, clear };
}
