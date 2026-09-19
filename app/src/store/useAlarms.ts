// Les alarmes côté JavaScript : la liste qu'on affiche et qu'on modifie.
//
// Le natif en tient sa propre copie (il doit savoir réarmer au redémarrage,
// quand personne n'a monté le runtime). Cette copie se pousse entière à chaque
// modification — jamais d'écriture dans l'autre sens, sauf l'extinction d'une
// alarme sans récurrence, que le natif fait après l'avoir fait sonner et qu'on
// relit au retour au premier plan.

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  RAMP_SECONDS_DEFAULT,
  nextAlarm,
  pushAlarms,
  type Alarm,
} from '../../modules/alarm';
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
  refresh: () => void;
};

export function newAlarm(stationUrl: string, title: string): Alarm {
  return {
    id: String(Date.now()),
    hour: 7,
    minute: 0,
    days: [1, 2, 3, 4, 5],
    stationUrl,
    title,
    enabled: true,
    rampSeconds: RAMP_SECONDS_DEFAULT,
  };
}

export function useAlarms(): AlarmLibrary {
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [loading, setLoading] = useState(true);
  const [next, setNext] = useState<NextAlarm>(null);
  const alive = useRef(true);

  const refresh = useCallback(() => setNext(nextAlarm()), []);

  useEffect(() => {
    alive.current = true;
    void (async () => {
      const stored = await readJson<Alarm[]>(KEY_ALARMS, []);
      if (!alive.current) return;
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

  // Une alarme qui a sonné pendant que l'appli était en arrière-plan a pu être
  // éteinte côté natif : relire en revenant.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

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
      commit(alarms.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a))),
    [alarms, commit],
  );

  return { alarms, loading, next, save, remove, toggle, refresh };
}
