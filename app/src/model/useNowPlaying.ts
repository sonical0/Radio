// Sondage des titres en cours, porté du site.
//
// Indexé par URL de flux et non par position : ajouter, masquer ou supprimer une
// station ne décale donc jamais les entrées. Le plafond existe parce que
// l'annuaire permet d'accumuler des dizaines de stations — sans lui, chaque tour
// partirait en autant de requêtes.

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { fetchMeta } from './meta';
import type { Station } from './station';

const POLL_INTERVAL_MS = 30000;
const MAX_META_POLL = 40;

export function useNowPlaying(stations: Station[], currentUrl: string | null) {
  const [titles, setTitles] = useState<Record<string, string>>({});
  // Les stations changent à chaque geste sur la bibliothèque ; les garder dans
  // une ref évite de relancer l'intervalle à chaque re-rendu.
  const stationsRef = useRef(stations);
  stationsRef.current = stations;
  const currentRef = useRef(currentUrl);
  currentRef.current = currentUrl;
  const inFlight = useRef(false);

  const apply = useCallback((url: string, txt: string | null) => {
    if (!txt) return;
    setTitles((prev) => (prev[url] === txt ? prev : { ...prev, [url]: txt }));
  }, []);

  /** Sonde une station à la demande, quand elle sort du lot des 40. */
  const refreshOne = useCallback(
    async (url: string) => {
      const s = stationsRef.current.find((x) => x.url === url);
      if (!s?.meta) return;
      apply(url, await fetchMeta(s.meta, s.url));
    },
    [apply],
  );

  useEffect(() => {
    const poll = async () => {
      // Rien à afficher quand l'appli n'est pas à l'écran, et un tour déjà en
      // vol ne doit pas en déclencher un second.
      if (AppState.currentState !== 'active' || inFlight.current) return;
      inFlight.current = true;
      try {
        const targets = stationsRef.current.filter((s) => s.meta && !s.hidden);
        const batch = targets.slice(0, MAX_META_POLL);
        // La station écoutée est prioritaire : elle doit être sondée même si
        // elle se trouve au-delà du plafond.
        const cur = currentRef.current;
        if (cur && !batch.some((s) => s.url === cur)) {
          const s = targets.find((x) => x.url === cur);
          if (s) batch.push(s);
        }
        const results = await Promise.allSettled(
          batch.map((s) => fetchMeta(s.meta!, s.url).then((txt) => ({ url: s.url, txt }))),
        );
        for (const r of results) {
          if (r.status === 'fulfilled') apply(r.value.url, r.value.txt);
        }
      } finally {
        inFlight.current = false;
      }
    };

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    // Au retour au premier plan, on ne fait pas attendre le prochain tour.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') poll();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [apply]);

  return { titles, refreshOne };
}
