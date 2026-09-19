// Le pendant applicatif de `net/updates` : quand vérifier, quoi retenir, et
// quand se taire.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { CURRENT_VERSION, fetchLatestRelease, isNewer, type Release } from '../net/updates';
import { KEY_UPDATE, readJson, writeJson } from '../store/storage';

/** Une journée : la fréquence d'un projet dont les releases se comptent par mois. */
const INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Il n'y a d'APK à mettre à jour que sur Android. Sur la cible web, la page
 * servie est toujours la dernière, et un bandeau y serait un mensonge.
 */
const SUPPORTED = Platform.OS === 'android';

type Stored = {
  /** Date de la dernière vérification *réussie*. */
  at: number;
  version: string;
  url: string;
  /** Version que l'utilisateur a explicitement écartée. */
  dismissed?: string;
};

export type UpdateCheck = {
  /** Non nul seulement s'il y a mieux que la version installée, et non écarté. */
  update: Release | null;
  checking: boolean;
  /** Vérification demandée à la main, qui ignore l'intervalle et l'écartement. */
  check: () => void;
  dismiss: () => void;
};

export function useUpdateCheck(): UpdateCheck {
  const [update, setUpdate] = useState<Release | null>(null);
  const [checking, setChecking] = useState(false);
  const stored = useRef<Stored | null>(null);

  const publish = useCallback((s: Stored | null) => {
    if (!s?.version || s.dismissed === s.version || !isNewer(s.version, CURRENT_VERSION)) {
      setUpdate(null);
      return;
    }
    setUpdate({ version: s.version, url: s.url });
  }, []);

  const run = useCallback(
    async (force: boolean) => {
      if (!SUPPORTED) return;
      const prev = stored.current ?? (await readJson<Stored | null>(KEY_UPDATE, null));
      stored.current = prev;
      // Ce qu'on savait déjà s'affiche immédiatement : le réseau peut manquer,
      // la release trouvée hier reste vraie aujourd'hui.
      publish(prev);
      if (!force && prev && Date.now() - prev.at < INTERVAL_MS) return;

      setChecking(true);
      const found = await fetchLatestRelease();
      setChecking(false);
      // Un échec n'est pas daté : la prochaine ouverture réessaiera, plutôt
      // que de laisser un téléphone hors ligne au démarrage muet un jour entier.
      if (!found) return;

      const next: Stored = {
        at: Date.now(),
        version: found.version,
        url: found.url,
        // Une vérification demandée à la main annule l'écartement : on ne
        // demande pas explicitement à voir pour ne rien recevoir.
        dismissed: force ? undefined : prev?.dismissed,
      };
      stored.current = next;
      await writeJson(KEY_UPDATE, next);
      publish(next);
    },
    [publish],
  );

  useEffect(() => {
    void run(false);
  }, [run]);

  const dismiss = useCallback(() => {
    const prev = stored.current;
    if (!prev?.version) return;
    const next: Stored = { ...prev, dismissed: prev.version };
    stored.current = next;
    void writeJson(KEY_UPDATE, next);
    publish(next);
  }, [publish]);

  const check = useCallback(() => {
    void run(true);
  }, [run]);

  return { update, checking, check, dismiss };
}
