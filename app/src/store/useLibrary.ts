// L'état de la bibliothèque et les gestes qu'on lui applique. Tout ce qui
// touche au stockage passe par ici ; l'interface ne connaît que ces actions.

import { useCallback, useEffect, useState } from 'react';

import { exportJson, pickJson } from '../io/transfer';
import {
  isSafeHttpUrl,
  isValidStation,
  normalizeStation,
  type RawStation,
  type Station,
} from '../model/station';
import { probeMeta } from '../net/probeMeta';
import { resolveStreamUrl } from '../net/resolveStream';
import { loadLibrary, persist, saveBuiltinPrefs, saveCustomStations, serializeStation } from './library';

export type Outcome = { ok: boolean; message: string };

export function useLibrary() {
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLibrary().then((list) => {
      setStations(list);
      setLoading(false);
    });
  }, []);

  /**
   * Toutes les mutations passent par là : on remplace l'entrée par une copie
   * modifiée plutôt que de muter en place, sinon React ne re-rendrait pas, et on
   * persiste la liste résultante dans le bon des deux stockages.
   */
  const update = useCallback((url: string, patch: Partial<Station>) => {
    setStations((prev) => {
      const next = prev.map((s) => (s.url === url ? { ...s, ...patch } : s));
      const touched = next.find((s) => s.url === url);
      if (touched) void persist(next, touched);
      return next;
    });
  }, []);

  /**
   * Pendant le glissement, on met à jour sans écrire : une écriture par pixel
   * serait gâchée. `commitGain` est appelé à la fin du geste.
   */
  const previewGain = useCallback((url: string, gain: number) => {
    setStations((prev) => prev.map((s) => (s.url === url ? { ...s, gain } : s)));
  }, []);

  const commitGain = useCallback((url: string) => {
    setStations((prev) => {
      const touched = prev.find((s) => s.url === url);
      if (touched) void persist(prev, touched);
      return prev;
    });
  }, []);

  /**
   * Masquer, pas supprimer. La station reste dans la liste (la corbeille en vit)
   * et tout ce qui la parcourt doit sauter `hidden` — c'est ce qui évite de
   * décaler les index à chaque geste.
   */
  const hide = useCallback((url: string) => update(url, { hidden: true }), [update]);
  const restore = useCallback((url: string) => update(url, { hidden: false }), [update]);

  /** Définitif, et réservé aux stations custom : une station livrée revient de stations.json. */
  const purge = useCallback((url: string) => {
    setStations((prev) => {
      const target = prev.find((s) => s.url === url);
      if (!target?.isCustom) return prev;
      const next = prev.filter((s) => s.url !== url);
      void saveCustomStations(next);
      return next;
    });
  }, []);

  /**
   * Ajout manuel. L'URL passe par resolveStreamUrl() — playlists M3U/PLS
   * résolues, HLS détecté, entrées revalidées par la garde d'hôte — avant
   * d'entrer dans la bibliothèque.
   */
  const addStation = useCallback(
    async (raw: { name: string; group: string; url: string; metaUrl?: string }): Promise<Outcome> => {
      const name = raw.name.trim();
      const url = raw.url.trim();
      // Le groupe est facultatif : une station sans groupe atterrit dans DIVERS
      // plutôt que d'être refusée.
      if (!name || !url) return { ok: false, message: "⚠ Le nom et l'URL du flux sont requis." };
      if (!isSafeHttpUrl(url)) return { ok: false, message: '⚠ URL refusée (protocole ou hôte privé).' };

      const resolved = await resolveStreamUrl(url);
      if (resolved.blocked) {
        return { ok: false, message: '⚠ La playlist pointe vers un hôte privé.' };
      }

      // Rien de déclaré et rien à déduire de l URL : on demande à l hôte. Une
      // station d annuaire n a jamais de métadonnées autrement, et c est là que
      // le natif gagne — Shoutcast est inatteignable depuis un navigateur.
      const probed = raw.metaUrl?.trim() ? null : await probeMeta(resolved.url);

      const metaUrl = raw.metaUrl?.trim();
      const entry: RawStation = {
        name,
        group: raw.group.trim(),
        url: resolved.url,
        hls: resolved.hls === true,
        meta: metaUrl
          ? { type: /status-json\.xsl/i.test(metaUrl) ? 'icecast' : 'azuracast', url: metaUrl }
          : undefined,
      };
      if (!isValidStation(entry)) return { ok: false, message: '⚠ Station invalide.' };

      let outcome: Outcome = { ok: true, message: '✓ Station ajoutée.' };
      setStations((prev) => {
        const dup = prev.find((s) => s.url === entry.url);
        if (dup) {
          // Une station masquée occupe toujours son URL : la ré-ajouter doit la
          // faire réapparaître, sinon l'ajout échoue sur un doublon invisible.
          if (!dup.hidden) {
            outcome = { ok: false, message: '⚠ Cette URL est déjà dans la liste.' };
            return prev;
          }
          const next = prev.map((s) => (s.url === entry.url ? { ...s, hidden: false } : s));
          void persist(next, { ...dup, hidden: false });
          outcome = { ok: true, message: '✓ Station restaurée depuis la corbeille.' };
          return next;
        }
        const next = [...prev, normalizeStation(entry, true)];
        void saveCustomStations(next);
        return next;
      });
      return outcome;
    },
    [],
  );

  /** N'exporte que les stations custom visibles — le reste vient de stations.json. */
  const exportStations = useCallback(async (): Promise<Outcome> => {
    const custom = stations.filter((s) => s.isCustom && !s.hidden);
    if (!custom.length) return { ok: false, message: '⚠ Aucune station custom à exporter.' };
    try {
      const where = await exportJson(JSON.stringify(custom.map(serializeStation), null, 2));
      return { ok: true, message: `✓ ${custom.length} station(s) — ${where}.` };
    } catch {
      return { ok: false, message: "⚠ L'export a échoué." };
    }
  }, [stations]);

  const importStations = useCallback(async (): Promise<Outcome> => {
    let text: string | null;
    try {
      text = await pickJson();
    } catch {
      return { ok: false, message: "⚠ Lecture du fichier impossible." };
    }
    if (text == null) return { ok: true, message: '' };

    let list: RawStation[];
    try {
      const data = JSON.parse(text);
      list = Array.isArray(data) ? data : [data];
    } catch {
      return { ok: false, message: '⚠ Fichier invalide.' };
    }
    const valid = list.filter(isValidStation);
    if (!valid.length) return { ok: false, message: '⚠ Aucune station lisible dans ce fichier.' };

    let added = 0;
    setStations((prev) => {
      const byUrl = new Map(prev.map((s) => [s.url, s]));
      const next = [...prev];
      for (const s of valid) {
        const url = String(s.url).trim();
        if (!isSafeHttpUrl(url)) continue;
        const dup = byUrl.get(url);
        if (dup) {
          // Même raison que dans addStation : un doublon masqué est réaffiché.
          if (!dup.hidden) continue;
          const at = next.findIndex((x) => x.url === url);
          next[at] = { ...dup, hidden: false };
          added++;
          continue;
        }
        const station = normalizeStation(s, true);
        next.push(station);
        byUrl.set(url, station);
        added++;
      }
      if (added) {
        void saveCustomStations(next);
        void saveBuiltinPrefs(next);
      }
      return added ? next : prev;
    });
    return added
      ? { ok: true, message: `✓ ${added} station(s) importée(s).` }
      : { ok: false, message: '⚠ Aucune nouvelle station (déjà présentes).' };
  }, []);

  return {
    stations,
    loading,
    previewGain,
    commitGain,
    hide,
    restore,
    purge,
    addStation,
    exportStations,
    importStations,
  };
}
