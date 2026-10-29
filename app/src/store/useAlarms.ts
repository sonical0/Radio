// Les alarmes côté JavaScript : la liste qu'on affiche et qu'on modifie.
//
// Le natif en tient sa propre copie (il doit savoir réarmer au redémarrage,
// quand personne n'a monté le runtime). Cette copie se pousse entière à chaque
// modification. Le natif n'écrit que deux choses lui-même, toujours vers le
// bas : l'extinction d'une alarme sans récurrence après sa sonnerie, et la
// consommation d'un saut. On les relit au chargement et au retour au premier
// plan, avant toute nouvelle poussée qui les annulerait.

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  RAMP_SECONDS_DEFAULT,
  nativeAlarms,
  nextAlarm,
  pushAlarms,
  type Alarm,
} from '../../modules/alarm';
import type { Station } from '../model/station';
import { KEY_ALARMS, readJson, writeJson } from './storage';

export type NextAlarm = { at: Date; id: string } | null;

export type AlarmLibrary = {
  alarms: Alarm[];
  loading: boolean;
  /** La prochaine sonnerie telle que le natif l'a armée. */
  next: NextAlarm;
  save: (alarm: Alarm) => void;
  remove: (id: string) => void;
  toggle: (id: string) => void;
  /** Saute la prochaine sonnerie (ou annule le saut). Sur un réveil unique, l'éteint. */
  toggleSkip: (id: string) => void;
  refresh: () => void;
};

export function newAlarm(station: Station): Alarm {
  return {
    id: String(Date.now()),
    hour: 7,
    minute: 0,
    days: [1, 2, 3, 4, 5],
    stationUrl: station.url,
    title: station.name,
    enabled: true,
    rampSeconds: RAMP_SECONDS_DEFAULT,
    // Recopié plutôt que relu : le natif n'a pas accès à la bibliothèque,
    // et une station réétalonnée depuis se répercute à la prochaine
    // réaffectation, ce qui est un comportement prévisible.
    gain: station.gain,
  };
}

/** Rattache une alarme à une station : l'URL, le nom et le gain vont ensemble. */
export function withStation(alarm: Alarm, station: Station): Alarm {
  return { ...alarm, stationUrl: station.url, title: station.name, gain: station.gain };
}

/**
 * Reprend de la copie native ce qu'elle a éteint seule. Un champ ne fait que
 * descendre : vrai côté JS et faux côté natif donne faux, jamais l'inverse.
 * Rend la même liste quand rien ne change, pour éviter une écriture inutile.
 */
function reconcile(list: Alarm[], native: Alarm[] | null): Alarm[] {
  if (!native || native.length === 0) return list;
  const byId = new Map(native.map((a) => [a.id, a]));
  let changed = false;
  const out = list.map((a) => {
    const n = byId.get(a.id);
    if (!n) return a;
    const enabled = a.enabled && n.enabled !== false;
    const skipNext = !!a.skipNext && !!n.skipNext;
    if (enabled === a.enabled && skipNext === !!a.skipNext) return a;
    changed = true;
    return { ...a, enabled, skipNext };
  });
  return changed ? out : list;
}

/** Ce qu'on laisse au natif pour réarmer la suivante une fois l'échéance passée. */
const RESYNC_GRACE_MS = 2_000;
/**
 * Pas maximal du minuteur d'échéance : un minuteur JS de plusieurs heures
 * dérive pendant la veille du téléphone, un pas d'une minute se recale.
 */
const CHECK_MS = 60_000;

export function useAlarms(): AlarmLibrary {
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [loading, setLoading] = useState(true);
  const [next, setNext] = useState<NextAlarm>(null);
  const alive = useRef(true);

  const refresh = useCallback(() => setNext(nextAlarm()), []);

  useEffect(() => {
    alive.current = true;
    void (async () => {
      const read = await readJson<Alarm[]>(KEY_ALARMS, []);
      if (!alive.current) return;
      const stored = reconcile(read, nativeAlarms());
      if (stored !== read) void writeJson(KEY_ALARMS, stored);
      setAlarms(stored);
      setLoading(false);
      // Repousser au démarrage : une réinstallation efface les
      // SharedPreferences du natif alors qu'AsyncStorage survit, et sans ce
      // rappel le réveil serait affiché sans être armé.
      pushAlarms(stored);
      refresh();
    })();
    return () => {
      alive.current = false;
    };
  }, [refresh]);

  // Une alarme qui a sonné a pu être éteinte côté natif, un saut a pu être
  // consommé, et la prochaine échéance a changé : tout relire d'un coup.
  const resync = useCallback(() => {
    setAlarms((prev) => {
      const next = reconcile(prev, nativeAlarms());
      if (next !== prev) void writeJson(KEY_ALARMS, next);
      return next;
    });
    refresh();
  }, [refresh]);

  // Au retour au premier plan : ce qui a sonné pendant l'absence.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') resync();
    });
    return () => sub.remove();
  }, [resync]);

  // Pendant que l'appli est affichée — l'horloge de chevet, typiquement — la
  // sonnerie passe sans changer d'état d'appli : on relit une fois l'échéance
  // dépassée, plutôt qu'à chaque rendu. Une échéance déjà passée au montage
  // (natif pas encore réarmé) attend un pas complet, sans quoi chaque relecture
  // identique relancerait aussitôt la suivante.
  useEffect(() => {
    if (!next) return;
    const due = next.at.getTime() + RESYNC_GRACE_MS;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const left = due - Date.now();
      if (left <= 0) resync();
      else timer = setTimeout(tick, Math.min(left, CHECK_MS));
    };
    const first = due - Date.now();
    timer = setTimeout(tick, first > 0 ? Math.min(first, CHECK_MS) : CHECK_MS);
    return () => clearTimeout(timer);
  }, [next, resync]);

  const commit = useCallback(
    (list: Alarm[]) => {
      setAlarms(list);
      void writeJson(KEY_ALARMS, list);
      pushAlarms(list);
      refresh();
    },
    [refresh],
  );

  const save = useCallback(
    (alarm: Alarm) => {
      const known = alarms.some((a) => a.id === alarm.id);
      commit(known ? alarms.map((a) => (a.id === alarm.id ? alarm : a)) : [...alarms, alarm]);
    },
    [alarms, commit],
  );

  const remove = useCallback(
    (id: string) => commit(alarms.filter((a) => a.id !== id)),
    [alarms, commit],
  );

  const toggle = useCallback(
    (id: string) =>
      // Rallumer un réveil ne doit pas ressusciter un saut d'avant.
      commit(alarms.map((a) => (a.id === id ? { ...a, enabled: !a.enabled, skipNext: false } : a))),
    [alarms, commit],
  );

  const toggleSkip = useCallback(
    (id: string) =>
      commit(
        alarms.map((a) => {
          if (a.id !== id) return a;
          // Un réveil unique n'a pas de « suivante » : le sauter, c'est l'éteindre.
          if (a.days.length === 0) return { ...a, enabled: false, skipNext: false };
          return { ...a, skipNext: !a.skipNext };
        }),
      ),
    [alarms, commit],
  );

  return { alarms, loading, next, save, remove, toggle, toggleSkip, refresh };
}
