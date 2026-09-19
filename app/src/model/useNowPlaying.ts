// Sondage des titres en cours, porté du site.
//
// Indexé par URL de flux et non par position : ajouter, masquer ou supprimer une
// station ne décale donc jamais les entrées. Le plafond existe parce que
// l'annuaire permet d'accumuler des dizaines de stations — sans lui, chaque tour
// partirait en autant de requêtes.

import TrackPlayer, { Event } from '@rntp/player';
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

  // ─── Métadonnées ICY, lues dans le flux par le lecteur natif ───
  //
  // C est le seul chemin qui marche pour une station venue de l annuaire : elle
  // n a ni endpoint AzuraCast ni Icecast déclaré, mais presque tous les flux
  // Shoutcast/Icecast intercalent leur titre dans l audio. Le navigateur ne peut
  // pas y accéder — il faudrait lire le flux octet par octet avec l en-tête
  // Icy-MetaData, ce que fetch ne permet pas ici — le natif, si.
  //
  // Le sondage HTTP garde la priorité quand la station a un endpoint déclaré :
  // il renvoie le même titre en mieux formé, et deux sources qui écrivent tour à
  // tour feraient clignoter la ligne.
  useEffect(() => {
    const onMeta = (e: { title?: string; artist?: string }) => {
      const url = currentRef.current;
      if (!url) return;
      const station = stationsRef.current.find((s) => s.url === url);
      if (!station || station.meta) return;
      const txt = [e.title, e.artist].filter(Boolean).join(' — ').trim();
      if (txt) apply(url, txt);
    };
    const subs = [
      TrackPlayer.addEventListener(Event.MetadataReceived, onMeta),
      TrackPlayer.addEventListener(Event.MediaMetadataChanged, onMeta),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [apply]);

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
