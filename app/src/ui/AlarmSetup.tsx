import { useCallback, useEffect, useMemo, useState } from 'react';
import { PermissionsAndroid, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  alarmAvailable,
  cancelAlarm,
  nextAlarm,
  nextOccurrence,
  scheduleAlarm,
} from '../../modules/alarm';
import type { Station } from '../model/station';
import { FONT_BODY, FONT_DISPLAY, useTheme, type Palette } from './theme';

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

function label(at: Date): string {
  const hh = String(at.getHours()).padStart(2, '0');
  const mm = String(at.getMinutes()).padStart(2, '0');
  const today = new Date();
  const sameDay = at.toDateString() === today.toDateString();
  return hh + ':' + mm + (sameDay ? " aujourd'hui" : ' ' + DAYS[at.getDay()]);
}

/**
 * Le réglage du réveil, jalon 1 : une alarme, la station en cours, pas de
 * récurrence. Il vit dans les réglages en attendant l'horloge de chevet du
 * jalon 4, qui lui donnera sa vraie place — et une liste.
 */
export function AlarmSetup({ station }: { station: Station | null }) {
  const { p, t } = useTheme();
  const s = useMemo(() => makeStyles(p), [p]);
  const [hh, setHh] = useState('07');
  const [mm, setMm] = useState('00');
  const [armed, setArmed] = useState<Date | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Le natif fait foi : l'alarme survit à la fermeture de l'application, pas
  // l'état de ce composant.
  const refresh = useCallback(() => setArmed(nextAlarm()), []);
  useEffect(refresh, [refresh]);

  const arm = useCallback(
    async (at: Date) => {
      if (!station) {
        setMessage('Choisis d’abord une station.');
        return;
      }
      // Sans cette permission (Android 13+), le service sonne mais sa
      // notification — donc le bouton ARRÊTER — reste invisible.
      if (Platform.OS === 'android' && Platform.Version >= 33) {
        try {
          await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        } catch {}
      }
      scheduleAlarm(at, station.url, station.name);
      refresh();
      setMessage(null);
    },
    [refresh, station],
  );

  const onArm = useCallback(() => {
    const h = Number.parseInt(hh, 10);
    const m = Number.parseInt(mm, 10);
    if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
      setMessage('Heure invalide.');
      return;
    }
    void arm(nextOccurrence(h, m));
  }, [arm, hh, mm]);

  // Une alarme dans une minute : sans elle, vérifier que le réveil part
  // vraiment demande d'attendre le lendemain matin.
  const onTest = useCallback(() => {
    void arm(new Date(Date.now() + 60 * 1000));
  }, [arm]);

  const onCancel = useCallback(() => {
    cancelAlarm();
    refresh();
    setMessage(null);
  }, [refresh]);

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

      <Text style={s.state}>
        {armed
          ? '⏰ ' + label(armed) + (station ? ' · ' + station.name : '')
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
          disabled={!armed}
          accessibilityRole="button"
          accessibilityState={{ disabled: !armed }}
          style={t.btn}>
          <Text style={[t.btnText, !armed && t.btnOff]}>ANNULER</Text>
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
    state: { color: p.dim, fontFamily: FONT_BODY, fontSize: 12, marginBottom: 6 },
  });
