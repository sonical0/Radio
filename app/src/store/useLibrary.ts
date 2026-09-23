// L'état de la bibliothèque et les gestes qu'on lui applique. Tout ce qui
// touche au stockage passe par ici ; l'interface ne connaît que ces actions.

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fallbackStationName,
  groupFromFileName,
  isHlsManifest,
  isNestedPlaylist,
  parsePlaylist,
  playlistKind,
  PLAYLIST_MAX_ENTRIES,
  PLAYLIST_NAME_MAX,
  type PlaylistKind,
} from '../io/playlist';
import { exportJson, pickFile } from '../io/transfer';
import {
  isHlsUrl,
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
  // L'import de playlist résout des flux un par un : sa boucle est longue, et
  // `stations` y serait figé à la valeur du rendu qui l'a lancée.
  const stationsRef = useRef(stations);
  stationsRef.current = stations;

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
    async (raw: {
      name: string;
      group: string;
      url: string;
      metaUrl?: string;
      uuid?: string | null;
      favicon?: string | null;
    }): Promise<Outcome> => {
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
        // Revalidés par normalizeStation() : ce qui arrive ici vient de
        // l'annuaire, jamais d'une saisie de confiance.
        uuid: raw.uuid ?? undefined,
        favicon: raw.favicon ?? undefined,
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
  /**
   * Exporte les stations ajoutées **et les réveils**.
   *
   * Le format v1 était un simple tableau de stations, et changer de téléphone
   * perdait donc les alarmes en silence. La v2 est un objet ; l'import relit
   * les deux formats, parce que les fichiers déjà exportsés existent.
   */
  const exportStations = useCallback(
    async (alarms: unknown[] = []): Promise<Outcome> => {
      const custom = stations.filter((s) => s.isCustom && !s.hidden);
      if (!custom.length && !alarms.length) {
        return { ok: false, message: '⚠ Rien à exporter : aucune station custom, aucun réveil.' };
      }
      const backup = { version: 2, stations: custom.map(serializeStation), alarms };
      try {
        const where = await exportJson(JSON.stringify(backup, null, 2));
        const quoi = [
          custom.length ? `${custom.length} station(s)` : null,
          alarms.length ? `${alarms.length} réveil(s)` : null,
        ]
          .filter(Boolean)
          .join(' et ');
        return { ok: true, message: `✓ ${quoi} — ${where}.` };
      } catch {
        return { ok: false, message: "⚠ L'export a échoué." };
      }
    },
    [stations],
  );

  /**
   * Import d'une playlist M3U ou PLS d'un autre lecteur. Chaque adresse passe
   * par la même garde d'hôte que le formulaire ; une entrée qui est elle-même
   * une playlist est résolue comme lui, et comptée à part si elle ne l'a pas pu.
   */
  const importPlaylist = useCallback(
    async (fileName: string, text: string, kind: PlaylistKind, onProgress?: (m: string) => void): Promise<Outcome> => {
      if (isHlsManifest(kind, text)) {
        return {
          ok: false,
          message: "⚠ Ce fichier est un flux HLS, pas une liste de stations : ajoute son adresse avec le formulaire.",
        };
      }
      const all = parsePlaylist(kind, text);
      if (!all.length) return { ok: false, message: '⚠ Aucune station reconnue dans ce fichier.' };
      const truncated = all.length > PLAYLIST_MAX_ENTRIES ? all.length : 0;
      const entries = all.slice(0, PLAYLIST_MAX_ENTRIES);

      const fileGroup = groupFromFileName(fileName);
      // La résolution est asynchrone : on travaille sur une copie de la liste
      // telle qu'elle est au départ, et on n'écrit qu'à la fin, en une passe.
      const existing = new Set(stationsRef.current.map((x) => x.url));
      const fresh: RawStation[] = [];
      let dup = 0;
      let refused = 0;
      let unverified = 0;

      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (!isSafeHttpUrl(e.url)) { refused++; continue; }
        let url = e.url;
        let hls = isHlsUrl(url);
        if (isNestedPlaylist(url)) {
          onProgress?.(`⟳ Résolution des flux… ${i + 1}/${entries.length}`);
          const r = await resolveStreamUrl(url);
          if (r.blocked) { refused++; continue; }
          // Non résolue (réseau, hôte muet) : gardée telle quelle comme le fait
          // le formulaire, mais dite — elle risque d'être muette.
          if (!r.verified) unverified++;
          url = r.url;
          hls = !!r.hls || isHlsUrl(url);
        }
        if (existing.has(url)) { dup++; continue; }
        existing.add(url);
        fresh.push({
          group: e.group || fileGroup,
          name: (e.name || fallbackStationName(url)).slice(0, PLAYLIST_NAME_MAX),
          url,
          hls,
          favicon: e.favicon || undefined,
        });
      }

      const added = fresh.length;
      if (added) {
        setStations((prev) => {
          const next = [...prev, ...fresh.map((x: RawStation) => normalizeStation(x, true))];
          void saveCustomStations(next);
          return next;
        });
      }
      const bits: string[] = [];
      if (dup) bits.push(`${dup} déjà présente(s)`);
      if (refused) bits.push(`${refused} refusée(s) — adresse locale ou invalide`);
      if (unverified) bits.push(`${unverified} playlist(s) imbriquée(s) non vérifiée(s), à tester`);
      if (truncated) bits.push(`seules les ${PLAYLIST_MAX_ENTRIES} premières sur ${truncated} ont été lues`);
      const head = added
        ? `✓ ${added} station(s) importée(s) de « ${fileName} »`
        : '⚠ Aucune nouvelle station';
      return { ok: added > 0, message: head + (bits.length ? ' · ' + bits.join(' · ') : '') + '.' };
    },
    [],
  );

  const importStations = useCallback(
    async (onAlarms?: (alarms: unknown[]) => number, onProgress?: (m: string) => void): Promise<Outcome> => {
    let picked: { name: string; text: string } | null;
    try {
      picked = await pickFile();
    } catch {
      return { ok: false, message: "⚠ Lecture du fichier impossible." };
    }
    if (picked == null) return { ok: true, message: '' };
    const text = picked.text;

    // Une playlist d'un autre lecteur passe par le même bouton : c'est le
    // contenu qui décide, l'extension ne sert qu'à départager.
    const kind = playlistKind(picked.name, text);
    if (kind) return importPlaylist(picked.name, text, kind, onProgress);

    let list: RawStation[];
    let importedAlarms = 0;
    try {
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        // Format v1 : un tableau de stations, rien d'autre.
        list = data;
      } else if (data && Array.isArray((data as { stations?: unknown }).stations)) {
        list = (data as { stations: RawStation[] }).stations;
        const rawAlarms = (data as { alarms?: unknown }).alarms;
        if (onAlarms && Array.isArray(rawAlarms)) importedAlarms = onAlarms(rawAlarms);
      } else {
        list = [data as RawStation];
      }
    } catch {
      return { ok: false, message: '⚠ Fichier invalide.' };
    }
    const valid = list.filter(isValidStation);
    if (!valid.length) {
      return importedAlarms
        ? { ok: true, message: `✓ ${importedAlarms} réveil(s) importé(s), aucune station.` }
        : { ok: false, message: '⚠ Aucune station lisible dans ce fichier.' };
    }

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
    const suffixe = importedAlarms ? ` et ${importedAlarms} réveil(s)` : '';
    return added
      ? { ok: true, message: `✓ ${added} station(s)${suffixe} importée(s).` }
      : importedAlarms
        ? { ok: true, message: `✓ ${importedAlarms} réveil(s) importé(s), stations déjà présentes.` }
        : { ok: false, message: '⚠ Aucune nouvelle station (déjà présentes).' };
  }, [importPlaylist]);

  /**
   * Pose sur une station la fiche que l'annuaire vient de rendre. Passe par
   * `update`, donc la liste est persistée dans le bon des deux stockages.
   */
  const attachCard = useCallback(
    (url: string, card: { uuid: string | null; favicon: string | null }) => {
      update(url, card);
    },
    [update],
  );

  return {
    stations,
    loading,
    attachCard,
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
