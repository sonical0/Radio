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
  /** Titre gardé (étoile) : ni « effacer » ni les plafonds n'y touchent. Absent des anciens historiques. */
  kept?: boolean;
};

/**
 * Deux plafonds. Le global protège le stockage, le second empêche une station
 * bavarde — une qui change de titre toutes les deux minutes — d'évincer toutes
 * les autres de l'historique.
 */
const MAX_TOTAL = 600;
const MAX_PER_STATION = 200;
/**
 * Les titres gardés échappent aux deux plafonds ci-dessus, mais pas à celui-ci :
 * sans lui, des étoiles semées sans fin feraient grossir le stockage sans borne.
 * Au-delà, garder un titre de plus est refusé (on ne jette jamais un choix fait).
 */
const MAX_KEPT = 300;

/** L'écriture suit les titres, qui arrivent par vagues : on la laisse retomber. */
const WRITE_DEBOUNCE_MS = 3000;

export type History = {
  entries: HistoryEntry[];
  loading: boolean;
  clear: () => void;
  /** Garde ou lâche l'entrée (url + at) ; refusé sans effet au-delà de MAX_KEPT. */
  toggleKeep: (url: string, at: number) => void;
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
      const raw = await readJson<HistoryEntry[]>(KEY_HISTORY, []);
      // Un historique stocké avant les étoiles n'a pas `kept` : on le lit tel quel.
      const stored = Array.isArray(raw) ? raw.filter((e) => e && typeof e.url === 'string') : [];
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
      let total = 0;
      for (const e of merged) {
        // Un gardé passe toujours, et ne pèse sur aucun des deux plafonds.
        if (e.kept) {
          kept.push(e);
          continue;
        }
        // Pas de `break` : un gardé plus ancien, plus loin dans la liste, doit encore passer.
        if (total >= MAX_TOTAL) continue;
        const n = (perStation[e.url] ?? 0) + 1;
        if (n > MAX_PER_STATION) continue;
        perStation[e.url] = n;
        kept.push(e);
        total++;
      }
      persistSoon(kept);
      return kept;
    });
  }, [loading, persistSoon, stations, titles]);

  const clear = useCallback(() => {
    lastByUrl.current = {};
    // Une écriture différée en attente remettrait l'historique effacé 3 s plus tard.
    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = null;
    pending.current = null;
    // Les gardés survivent à l'effacement.
    setEntries((prev) => {
      const protectedOnes = prev.filter((e) => e.kept);
      void writeJson(KEY_HISTORY, protectedOnes);
      return protectedOnes;
    });
  }, []);

  const toggleKeep = useCallback(
    (url: string, at: number) => {
      setEntries((prev) => {
        const target = prev.find((e) => e.url === url && e.at === at);
        if (!target) return prev;
        if (!target.kept && prev.filter((e) => e.kept).length >= MAX_KEPT) return prev;
        const next = prev.map((e) => (e === target ? { ...e, kept: !e.kept } : e));
        persistSoon(next);
        return next;
      });
    },
    [persistSoon],
  );

  return { entries, loading, clear, toggleKeep };
}
