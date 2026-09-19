import { useCallback, useMemo, useState } from 'react';
import {
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  DAY_INITIALS,
  WEEK_ORDER,
  alarmAvailable,
  describeDays,
  type Alarm,
} from '../../modules/alarm';
import type { Station } from '../model/station';
import { newAlarm, type AlarmLibrary } from '../store/useAlarms';
import { FONT_BODY, FONT_DISPLAY, useTheme, type Palette } from './theme';

const DAY_NAMES = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

function whenLabel(at: Date): string {
  const hh = String(at.getHours()).padStart(2, '0');
  const mm = String(at.getMinutes()).padStart(2, '0');
  const sameDay = at.toDateString() === new Date().toDateString();
  return hh + ':' + mm + (sameDay ? " aujourd'hui" : ' ' + DAY_NAMES[at.getDay()]);
}

function two(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Le réglage du réveil, jalons 1 et 2 : une alarme, la station en cours, des
 * jours de récurrence. Il vit dans les réglages en attendant l'horloge de
 * chevet du jalon 4, qui lui donnera sa vraie place et son bouton « + ».
 */
export function AlarmSetup({ station, lib }: { station: Station | null; lib: AlarmLibrary }) {
  const { p, t } = useTheme();
  const s = useMemo(() => makeStyles(p), [p]);
  const alarm: Alarm | null = lib.alarms[0] ?? null;
  const [hh, setHh] = useState(() => two(alarm?.hour ?? 7));
  const [mm, setMm] = useState(() => two(alarm?.minute ?? 0));
  const [days, setDays] = useState<number[]>(() => alarm?.days ?? [1, 2, 3, 4, 5]);
  const [message, setMessage] = useState<string | null>(null);

  const askNotifications = useCallback(async () => {
    // Sans cette permission (Android 13+), le service sonne mais sa
    // notification — donc le bouton ARRÊTER — reste invisible.
    if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
      try {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      } catch {}
    }
  }, []);

  const arm = useCallback(
    (over: Partial<Alarm>) => {
      if (!station) {
        setMessage('Choisis d’abord une station.');
        return;
      }
      const base = alarm ?? newAlarm(station.url, station.name);
      lib.save({ ...base, stationUrl: station.url, title: station.name, enabled: true, ...over });
      setMessage(null);
      void askNotifications();
    },
    [alarm, askNotifications, lib, station],
  );

  const onArm = useCallback(() => {
    const h = Number.parseInt(hh, 10);
    const m = Number.parseInt(mm, 10);
    if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
      setMessage('Heure invalide.');
      return;
    }
    arm({ hour: h, minute: m, days });
  }, [arm, days, hh, mm]);

  // Une alarme dans une minute : sans elle, vérifier que le réveil part
  // vraiment demande d'attendre le lendemain matin. Sans récurrence, donc
  // consommée après avoir sonné.
  const onTest = useCallback(() => {
    const at = new Date(Date.now() + 60 * 1000);
    setHh(two(at.getHours()));
    setMm(two(at.getMinutes()));
    setDays([]);
    arm({ hour: at.getHours(), minute: at.getMinutes(), days: [] });
  }, [arm]);

  const onCancel = useCallback(() => {
    if (alarm) lib.remove(alarm.id);
    setMessage(null);
  }, [alarm, lib]);

  const toggleDay = useCallback((d: number) => {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }, []);

  if (!alarmAvailable()) return null;

  return (
    <View>
      <Text style={s.label}>RÉVEIL</Text>

      <View style={s.row}>
        <TextInput
          style={[t.input, s.field]}
          value={hh}
          onChangeText={setHh}
          keyboardType="number-pad"
          maxLength={2}
          accessibilityLabel="Heure du réveil"
        />
        <Text style={s.colon}>:</Text>
        <TextInput
          style={[t.input, s.field]}
          value={mm}
          onChangeText={setMm}
          keyboardType="number-pad"
          maxLength={2}
          accessibilityLabel="Minutes du réveil"
        />
        <Pressable onPress={onArm} accessibilityRole="button" style={[t.btn, s.grow]}>
          <Text style={t.btnText}>ARMER</Text>
        </Pressable>
      </View>

      {/* Sept cases, la semaine commençant le lundi. Le libellé sous la ligne
          dit ce qu'elles forment — « LUN-VEN » se lit plus vite que cinq
          pastilles allumées. */}
      <View style={s.row}>
        {WEEK_ORDER.map((d) => {
          const on = days.includes(d);
          return (
            <Pressable
              key={d}
              onPress={() => toggleDay(d)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={DAY_NAMES[d]}
              style={[s.day, { borderColor: on ? p.base : p.border, backgroundColor: on ? p.bg2 : p.bg3 }]}>
              <Text style={[s.dayText, { color: on ? p.base : p.dim }]}>{DAY_INITIALS[d]}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={s.state}>
        {lib.next
          ? '⏰ ' + whenLabel(lib.next.at) + ' · ' + describeDays(days) + (alarm ? ' · ' + alarm.title : '')
          : station
            ? 'Aucun réveil armé · ' + station.name
            : 'Aucun réveil armé · aucune station choisie'}
      </Text>

      {message ? <Text style={t.msgErr}>{message}</Text> : null}

      <View style={s.row}>
        <Pressable onPress={onTest} accessibilityRole="button" style={t.btn}>
          <Text style={t.btnText}>TEST DANS 1 MIN</Text>
        </Pressable>
        <Pressable
          onPress={onCancel}
          disabled={!alarm}
          accessibilityRole="button"
          accessibilityState={{ disabled: !alarm }}
          style={t.btn}>
          <Text style={[t.btnText, !alarm && t.btnOff]}>ANNULER</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    label: {
      color: p.dim,
      fontFamily: FONT_DISPLAY,
      fontSize: 15,
      letterSpacing: 3,
      marginTop: 12,
      marginBottom: 6,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    field: { width: 52, textAlign: 'center', marginBottom: 0 },
    colon: { color: p.base, fontFamily: FONT_DISPLAY, fontSize: 20, lineHeight: 24 },
    grow: { flex: 1, alignItems: 'center' },
    day: {
      flex: 1,
      borderWidth: 1,
      paddingVertical: 6,
      alignItems: 'center',
    },
    dayText: { fontFamily: FONT_DISPLAY, fontSize: 16, lineHeight: 19 },
    state: { color: p.dim, fontFamily: FONT_BODY, fontSize: 12, marginVertical: 6 },
  });
