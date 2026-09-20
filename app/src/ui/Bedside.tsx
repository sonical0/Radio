import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import {
  DAY_INITIALS,
  RAMP_STEPS,
  WEEK_ORDER,
  describeDays,
  setKeepAwake,
  type Alarm,
} from '../../modules/alarm';
import type { Station } from '../model/station';
import { newAlarm, withStation, type AlarmLibrary } from '../store/useAlarms';
import { FONT_BODY, FONT_DISPLAY, useTheme, type Palette } from './theme';

const DAY_NAMES = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

/** Au bout d'une minute sans contact, l'écran s'assombrit : c'est une table de nuit. */
const DIM_AFTER_MS = 60 * 1000;

/** Le temps laissé pour rattraper une suppression. */
const UNDO_MS = 8000;

function two(n: number): string {
  return String(n).padStart(2, '0');
}

function dateLabel(d: Date): string {
  return DAY_NAMES[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
}

function whenLabel(at: Date): string {
  const sameDay = at.toDateString() === new Date().toDateString();
  return two(at.getHours()) + ':' + two(at.getMinutes()) + (sameDay ? " aujourd'hui" : ' ' + DAY_NAMES[at.getDay()]);
}

/**
 * L'horloge de chevet — ce que devient l'application quand le téléphone est
 * posé à l'horizontale.
 *
 * Le paysage n'existe que pour cet écran : la liste des stations, les réglages
 * et l'annuaire restent en portrait, et ne sont tout simplement pas rendus
 * ici. Aucun écran existant n'a donc à gérer une largeur qu'il n'a jamais vue.
 */
export function Bedside({
  station,
  lib,
  playing,
  streamState,
  onToggle,
}: {
  station: Station | null;
  lib: AlarmLibrary;
  playing: boolean;
  streamState: string;
  onToggle: () => void;
}) {
  const { p, t } = useTheme();
  const s = useMemo(() => makeStyles(p), [p]);
  const { width, height } = useWindowDimensions();
  // L'horloge remplit sa colonne au lieu d'une taille fixe : c'est le seul
  // contenu de l'écran qu'on doit pouvoir lire d'un lit, à deux mètres et
  // sans lunettes. « 07:00 » fait cinq caractères d'une police à chasse fixe,
  // soit environ 2,6 largeurs de cadratin ; la hauteur borne le reste.
  const clockSize = useMemo(
    () => Math.floor(Math.min((width * 0.52 - 40) / 2.6, height * 0.66)),
    [height, width],
  );
  const [now, setNow] = useState(() => new Date());
  const [dimmed, setDimmed] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [undo, setUndo] = useState<Alarm | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dimTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // L'horloge ne bat que quand elle est à l'écran : une minuterie qui tourne
  // en arrière-plan ne fait que consommer.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(new Date());
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, []);

  useEffect(() => {
    setKeepAwake(true);
    return () => setKeepAwake(false);
  }, []);

  const wake = useCallback(() => {
    setDimmed(false);
    if (dimTimer.current) clearTimeout(dimTimer.current);
    dimTimer.current = setTimeout(() => setDimmed(true), DIM_AFTER_MS);
  }, []);

  useEffect(() => {
    wake();
    return () => {
      if (dimTimer.current) clearTimeout(dimTimer.current);
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, [wake]);

  const add = useCallback(() => {
    if (!station) return;
    const created = newAlarm(station);
    lib.save(created);
    setEditing(created.id);
    if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
      void PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(
        () => {},
      );
    }
  }, [lib, station]);

  // Supprimer sans fenêtre de confirmation, mais jamais sans retour possible :
  // même logique que la corbeille des stations.
  const remove = useCallback(
    (alarm: Alarm) => {
      lib.remove(alarm.id);
      setUndo(alarm);
      if (undoTimer.current) clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
    },
    [lib],
  );

  const restore = useCallback(() => {
    if (undo) lib.save(undo);
    setUndo(null);
  }, [lib, undo]);

  return (
    <Pressable style={s.screen} onPress={wake} accessibilityLabel="Horloge de chevet">
      <View style={s.left}>
        <Text
          style={[s.clock, { fontSize: clockSize, lineHeight: Math.round(clockSize * 1.04) }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          accessibilityLabel={'Il est ' + two(now.getHours()) + ' heures ' + two(now.getMinutes())}>
          {two(now.getHours())}:{two(now.getMinutes())}
        </Text>
        <Text style={s.date}>{dateLabel(now).toUpperCase()}</Text>
        <Text style={s.next}>
          {lib.next ? '⏰ ' + whenLabel(lib.next.at) : 'AUCUN RÉVEIL ARMÉ'}
        </Text>
        {station ? <Text style={s.station}>{station.name}</Text> : null}

        {/* Écouter sans se relever ni retourner le téléphone : la station
            déjà choisie, rien de plus. Changer de station reste l'affaire du
            portrait, où vit la liste. */}
        <Pressable
          onPress={onToggle}
          disabled={!station}
          accessibilityRole="button"
          accessibilityState={{ disabled: !station, busy: streamState === 'loading' }}
          accessibilityLabel={playing ? 'Mettre en pause' : 'Lancer la radio'}
          style={[t.btn, s.play, { borderColor: station ? p.base : p.border }]}>
          <Text style={[t.btnText, s.playText, !station && t.btnOff]}>
            {/* Les mêmes glyphes que l'écran portrait : ⏸ sortait en emoji
                de couleur, seul élément non Pip-Boy de l'écran. */}
            {!station
              ? '▶ AUCUNE STATION'
              : streamState === 'loading'
                ? '… CONNEXION'
                : playing
                  ? '❚❚ PAUSE'
                  : '▶ ÉCOUTER'}
          </Text>
        </Pressable>
      </View>

      <View style={s.right}>
        <ScrollView keyboardShouldPersistTaps="handled">
          {lib.alarms.map((alarm) => (
            <AlarmRow
              key={alarm.id}
              alarm={alarm}
              open={editing === alarm.id}
              station={station}
              onOpen={() => setEditing(editing === alarm.id ? null : alarm.id)}
              onSave={lib.save}
              onToggle={() => lib.toggle(alarm.id)}
              onRemove={() => remove(alarm)}
            />
          ))}

          <View style={s.actions}>
            <Pressable
              onPress={add}
              disabled={!station}
              accessibilityRole="button"
              accessibilityLabel="Ajouter un réveil"
              style={[t.btn, s.add]}>
              <Text style={[t.btnText, !station && t.btnOff]}>+</Text>
            </Pressable>
            {undo ? (
              <Pressable onPress={restore} accessibilityRole="button" style={t.btn}>
                <Text style={t.btnText}>ANNULER LA SUPPRESSION</Text>
              </Pressable>
            ) : null}
          </View>

          {!station ? (
            <Text style={s.hint}>Choisis une station en portrait pour pouvoir armer un réveil.</Text>
          ) : null}
        </ScrollView>
      </View>

      {/* Un voile plutôt qu'une baisse de luminosité système : réversible au
          moindre contact, et sans rien changer aux réglages du téléphone. */}
      {dimmed ? <View style={s.veil} pointerEvents="none" /> : null}
    </Pressable>
  );
}

function AlarmRow({
  alarm,
  open,
  station,
  onOpen,
  onSave,
  onToggle,
  onRemove,
}: {
  alarm: Alarm;
  open: boolean;
  station: Station | null;
  onOpen: () => void;
  onSave: (a: Alarm) => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const { p, t } = useTheme();
  const s = useMemo(() => makeStyles(p), [p]);
  const [hh, setHh] = useState(two(alarm.hour));
  const [mm, setMm] = useState(two(alarm.minute));

  const commitTime = useCallback(() => {
    const h = Number.parseInt(hh, 10);
    const m = Number.parseInt(mm, 10);
    if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
      setHh(two(alarm.hour));
      setMm(two(alarm.minute));
      return;
    }
    onSave({ ...alarm, hour: h, minute: m });
  }, [alarm, hh, mm, onSave]);

  const toggleDay = useCallback(
    (d: number) => {
      const days = alarm.days.includes(d)
        ? alarm.days.filter((x) => x !== d)
        : [...alarm.days, d];
      onSave({ ...alarm, days });
    },
    [alarm, onSave],
  );

  return (
    <View style={[s.row, { borderColor: alarm.enabled ? p.base : p.border }]}>
      <Pressable onPress={onOpen} style={s.rowHead} accessibilityRole="button">
        <Text style={[s.rowTime, { color: alarm.enabled ? p.base : p.dim }]}>
          {two(alarm.hour)}:{two(alarm.minute)}
        </Text>
        <View style={s.rowText}>
          <Text style={s.rowDays}>{describeDays(alarm.days)}</Text>
          <Text style={s.rowStation} numberOfLines={1}>{alarm.title}</Text>
        </View>
      </Pressable>

      <Pressable
        onPress={onToggle}
        accessibilityRole="switch"
        accessibilityState={{ checked: alarm.enabled }}
        accessibilityLabel={alarm.enabled ? 'Désactiver ce réveil' : 'Activer ce réveil'}
        style={t.btn}>
        <Text style={[t.btnText, !alarm.enabled && t.btnOff]}>{alarm.enabled ? 'ON' : 'OFF'}</Text>
      </Pressable>

      {open ? (
        <View style={s.editor}>
          <View style={s.editRow}>
            <TextInput
              style={[t.input, s.field]}
              value={hh}
              onChangeText={setHh}
              onBlur={commitTime}
              keyboardType="number-pad"
              maxLength={2}
              accessibilityLabel="Heure"
            />
            <Text style={s.colon}>:</Text>
            <TextInput
              style={[t.input, s.field]}
              value={mm}
              onChangeText={setMm}
              onBlur={commitTime}
              keyboardType="number-pad"
              maxLength={2}
              accessibilityLabel="Minutes"
            />
            <Pressable onPress={commitTime} accessibilityRole="button" style={t.btn}>
              <Text style={t.btnText}>OK</Text>
            </Pressable>
            <Pressable onPress={onRemove} accessibilityRole="button" style={t.btn}>
              <Text style={t.btnText}>✕</Text>
            </Pressable>
          </View>

          <View style={s.editRow}>
            {WEEK_ORDER.map((d) => {
              const on = alarm.days.includes(d);
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

          {/* La montée de volume : quatre paliers plutôt qu'un champ libre —
              personne ne règle un réveil à 37 secondes. */}
          <Pressable
            onPress={() => {
              const i = RAMP_STEPS.indexOf(alarm.rampSeconds);
              const next = RAMP_STEPS[(i + 1) % RAMP_STEPS.length];
              onSave({ ...alarm, rampSeconds: next });
            }}
            accessibilityRole="button"
            accessibilityLabel="Durée de la montée de volume"
            style={t.btn}>
            <Text style={t.btnText}>
              {alarm.rampSeconds === 0 ? 'SANS MONTÉE' : 'MONTÉE ' + alarm.rampSeconds + ' S'}
            </Text>
          </Pressable>

          {station && station.url !== alarm.stationUrl ? (
            <Pressable
              onPress={() => onSave(withStation(alarm, station))}
              accessibilityRole="button"
              style={t.btn}>
              <Text style={t.btnText}>RÉVEILLER AVEC {station.name.toUpperCase()}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, flexDirection: 'row', backgroundColor: p.bg, padding: 16, gap: 16 },
    // La colonne de l'horloge prend un peu plus de la moitié : la liste des
    // alarmes se contente d'une largeur de lecture, l'heure non.
    left: { flex: 1.15, justifyContent: 'center' },
    // La taille vient du composant, calculée sur l'écran ; ce qui reste ici
    // ne dépend pas de la largeur.
    clock: { color: p.base, fontFamily: FONT_DISPLAY },
    date: { color: p.dim, fontFamily: FONT_DISPLAY, fontSize: 24, letterSpacing: 3 },
    next: { color: p.base, fontFamily: FONT_DISPLAY, fontSize: 26, letterSpacing: 2, marginTop: 16 },
    station: { color: p.dim, fontFamily: FONT_BODY, fontSize: 13, marginTop: 4 },
    // Large : c'est un bouton qu'on vise à moitié réveillé, de travers, dans
    // le noir.
    play: { alignSelf: 'flex-start', marginTop: 18, paddingVertical: 12, paddingHorizontal: 22 },
    playText: { fontSize: 26, letterSpacing: 2, lineHeight: 30 },

    right: { flex: 1 },
    row: { borderWidth: 1, backgroundColor: p.bg2, padding: 8, marginBottom: 8 },
    rowHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    rowTime: { fontFamily: FONT_DISPLAY, fontSize: 34, lineHeight: 38 },
    rowText: { flex: 1 },
    rowDays: { color: p.dim, fontFamily: FONT_DISPLAY, fontSize: 15, letterSpacing: 2 },
    rowStation: { color: p.dim, fontFamily: FONT_BODY, fontSize: 11 },

    editor: { marginTop: 8, gap: 6 },
    editRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    field: { width: 48, textAlign: 'center', marginBottom: 0 },
    colon: { color: p.base, fontFamily: FONT_DISPLAY, fontSize: 18, lineHeight: 22 },
    day: { flex: 1, borderWidth: 1, paddingVertical: 5, alignItems: 'center' },
    dayText: { fontFamily: FONT_DISPLAY, fontSize: 15, lineHeight: 18 },

    actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    add: { paddingHorizontal: 22 },
    hint: { color: p.dim, fontFamily: FONT_BODY, fontSize: 11, marginTop: 8 },

    veil: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: '#000',
      opacity: 0.72,
    },
  });
