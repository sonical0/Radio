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
  setWindowBrightness,
  speak,
  type Alarm,
} from '../../modules/alarm';
import type { Station } from '../model/station';
import type { StreamState } from '../player/usePlayback';
import { KEY_BEDSIDE_DIM, readString } from '../store/storage';
import { newAlarm, withStation, type AlarmLibrary } from '../store/useAlarms';
import { useWeather } from '../store/useWeather';
import { FONT_BODY, FONT_DISPLAY, useTheme, type Palette } from './theme';

const DAY_NAMES = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];
const DAY_SHORT = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MONTHS_SHORT = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
];

/**
 * La hauteur de ligne de l'heure, en corps. Métriques de VT323 : ascendante
 * 0,8, descendante 0,2, et les chiffres vont de la ligne de base à 0,56. À
 * 1,04 plus la marge qu'Android ajoute par défaut (`includeFontPadding`),
 * plus de la moitié de la boîte était vide. 0,8 garde les chiffres entiers
 * qu'Android rogne la ligne par le haut (sommet à 0,6) ou des deux côtés
 * (sommet à 0,7, base à 0,1 sous la ligne).
 */
const CLOCK_LINE = 0.8;

/** Au bout d'une minute sans contact, l'écran s'assombrit : c'est une table de nuit. */
const DIM_AFTER_MS = 60 * 1000;

/**
 * La luminosité de la fenêtre une fois l'écran assombri. Pas 0 : pour Android,
 * 0 vaut `BRIGHTNESS_OVERRIDE_OFF`, et certains écrans coupent alors le
 * rétroéclairage — plus d'heure du tout. 0,05 tombe au bas de la plage qu'offre
 * le curseur du système, assez pour lire l'heure dans le noir sans éclairer la
 * chambre ; le voile ou les opacités de HEURE LISIBLE font le reste.
 */
const NIGHT_BRIGHTNESS = 0.05;

/** Le temps laissé pour rattraper une suppression. */
const UNDO_MS = 8000;

function two(n: number): string {
  return String(n).padStart(2, '0');
}

function dateLabel(d: Date): string {
  return DAY_NAMES[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
}

/** « jeu. 29 oct. » : quand la date longue et la météo ne tiennent pas ensemble. */
function shortDateLabel(d: Date): string {
  return DAY_SHORT[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()];
}

/** « 29/10 » : le dernier palier, quand même la date courte coupe la météo. */
function numericDateLabel(d: Date): string {
  return two(d.getDate()) + '/' + two(d.getMonth() + 1);
}

/**
 * Les paliers de la date à côté de la météo, du plus long au plus court. On
 * prend le premier qui tient sur la ligne ; si aucun ne tient, la météo reste
 * seule, plutôt que d'en perdre la fin.
 */
const DATE_FORMATS = [dateLabel, shortDateLabel, numericDateLabel];

/**
 * L'heure telle qu'on la dit : « Il est 7 heures 5. », « Il est minuit. »,
 * « Il est midi 30. ». Les minutes sans zéro devant : la synthèse vocale lit
 * « 05 » comme « zéro cinq » sur certains moteurs.
 */
function spokenTime(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const hour = h === 0 ? 'minuit' : h === 12 ? 'midi' : h + (h === 1 ? ' heure' : ' heures');
  return 'Il est ' + hour + (m ? ' ' + m : '') + '.';
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
  title,
  lib,
  playing,
  streamState,
  onToggle,
  onNext,
  onPrevious,
  onRide,
}: {
  station: Station | null;
  title: string | null;
  lib: AlarmLibrary;
  playing: boolean;
  streamState: string;
  onToggle: () => void;
  onNext: () => void;
  onPrevious: () => void;
  /** Fourni par App.tsx : un bouton VÉLO ouvre alors le mode vélo. */
  onRide?: () => void;
}) {
  const { p, t } = useTheme();
  const s = useMemo(() => makeStyles(p), [p]);
  // Le bouton comparait l'état à 'loading', qui n'existe pas : « connexion »
  // ne s'affichait jamais. Les deux états où l'on attend du son sont ceux-ci.
  const connecting = streamState === 'buffering' || streamState === 'reconnecting';
  const { width, height } = useWindowDimensions();
  // La date, le prochain réveil et les boutons sont déjà en 24 à 26 : la
  // police du système ne les agrandit pas, chaque point qu'ils prendraient en
  // hauteur serait retiré à l'heure (`maxFontSizeMultiplier={1}` ci-dessous).
  // La hauteur de la colonne, et celle de tout ce qui s'affiche sous l'heure.
  // Sur un téléphone où l'affichage est agrandi (taille d'affichage ou de
  // police), un forfait de 66 % de la hauteur poussait les boutons hors de
  // l'écran : l'horloge prend désormais ce qui reste une fois le reste posé.
  const [column, setColumn] = useState({ w: 0, h: 0 });
  const [restH, setRestH] = useState(0);
  // Hauteur de la ligne de date affichée, et de chaque palier de date mesuré
  // sans limite de lignes : plus haut, c'est qu'il passe à la ligne, donc
  // qu'il ne tient pas.
  const [dateLineH, setDateLineH] = useState(0);
  const [tierH, setTierH] = useState<number[]>(() => DATE_FORMATS.map(() => 0));
  // L'horloge remplit sa colonne au lieu d'une taille fixe : c'est le seul
  // contenu de l'écran qu'on doit pouvoir lire d'un lit, à deux mètres et
  // sans lunettes. La largeur de « 07:00 » en cadratins n'est pas devinée :
  // elle est mesurée sur le texte affiché (`emWidth`), parce que cette police
  // pixel a des glyphes bien plus petits que leur corps — une estimation de
  // 2,6 cadratins laissait l'heure à 60 % de la largeur disponible.
  const [emWidth, setEmWidth] = useState(1.8);
  const clockSize = useMemo(() => {
    const avail = column.w || width * 0.52 - 40;
    const byWidth = avail / (emWidth * 1.04);
    const byHeight = column.h && restH ? (column.h - restH) / CLOCK_LINE : height * 0.5;
    return Math.max(36, Math.floor(Math.min(byWidth, byHeight)));
  }, [column, emWidth, height, restH, width]);
  const [now, setNow] = useState(() => new Date());
  const [dimmed, setDimmed] = useState(false);
  // Réglé dans les paramètres. Relu à chaque passage en paysage : les
  // paramètres ne s'ouvrent qu'en portrait, l'horloge n'existe qu'en paysage.
  const [keepClock, setKeepClock] = useState(false);
  useEffect(() => {
    void readString(KEY_BEDSIDE_DIM).then((v) => setKeepClock(v === 'clock'));
  }, []);
  // Rien quand aucune ville n'est réglée ou que le réseau manque : voir useWeather.
  const weather = useWeather();
  const weatherText = weather ? ' · ' + weather.replace(' · ', ' ').toUpperCase() : '';
  // Tant qu'une mesure manque, la date longue : c'est l'affichage d'avant.
  // `DATE_FORMATS.length` : aucun palier ne tient, la météo reste seule.
  const firstFit = tierH.findIndex((h) => h < dateLineH * 1.5);
  const dateTier =
    !dateLineH || tierH.some((h) => !h) ? 0 : firstFit < 0 ? DATE_FORMATS.length : firstFit;
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

  // Le voile et les opacités assombrissent les pixels, pas l'écran : un écran
  // LCD reste rétroéclairé derrière et éclaire la chambre. On baisse donc aussi
  // la luminosité de la fenêtre — de la fenêtre seulement, le réglage du
  // système n'est pas touché. Le nettoyage rend la main au système quand
  // `dimmed` repasse à faux (`wake`, au moindre contact) comme au démontage
  // (retour au portrait) : sans lui, l'appli resterait sombre en portrait.
  useEffect(() => {
    if (!dimmed) return;
    setWindowBrightness(NIGHT_BRIGHTNESS);
    return () => setWindowBrightness(null);
  }, [dimmed]);

  // L'appui long dit l'heure : on la demande les yeux fermés, sans chercher
  // ses lunettes. Il réveille aussi l'écran, comme n'importe quel contact.
  const sayTime = useCallback(() => {
    wake();
    speak(spokenTime(new Date()));
  }, [wake]);

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
    // `onTouchStart` en plus de `onPress` : il remonte aussi des boutons de la
    // liste, qui gardent leur appui pour eux. Sans lui, régler un réveil sous le
    // voile le faisait dans le noir, la luminosité restant basse.
    <Pressable style={s.screen} onPress={wake} onTouchStart={wake} accessibilityLabel="Horloge de chevet">
      {/* Défilante en dernier recours : si même une horloge réduite au minimum
          ne laisse pas la place aux boutons, on doit pouvoir aller les chercher. */}
      <ScrollView
        style={s.left}
        contentContainerStyle={s.leftContent}
        onLayout={(e) => setColumn({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {/* La taille est déjà calculée sur l'écran : la multiplier encore par
            la taille de police du système la ferait déborder. */}
        <Text
          style={[
            s.clock,
            { fontSize: clockSize, lineHeight: Math.round(clockSize * CLOCK_LINE) },
            dimmed && keepClock && s.dimClock,
          ]}
          numberOfLines={1}
          allowFontScaling={false}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width / clockSize;
            if (w > 0.5 && Math.abs(w - emWidth) > 0.01) setEmWidth(w);
          }}
          // Les gestes sur le texte même, sans Pressable autour : une boîte de
          // plus fausserait la mesure de `emWidth`. Le texte devient la cible du
          // toucher, il doit donc relayer l'appui court que l'écran entier
          // recevait jusque-là.
          onPress={wake}
          onLongPress={sayTime}
          accessibilityLabel={spokenTime(now)}
          accessibilityHint="Appui long pour entendre l'heure"
          accessibilityActions={[{ name: 'longpress', label: "Dire l'heure" }]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'longpress') sayTime();
          }}>
          {two(now.getHours())}:{two(now.getMinutes())}
        </Text>
        <View
          style={dimmed && keepClock && s.dimRest}
          onLayout={(e) => setRestH(e.nativeEvent.layout.height)}>
          {/* La météo sur la ligne de la date, jamais sur une ligne à elle :
              l'heure est dimensionnée sur la hauteur de ce bloc, et une ligne de
              plus lui coûtait un cinquième de sa taille. Quand la date et la
              météo ne tiennent pas ensemble, c'est la date qui raccourcit
              (« JEU. 29 OCT. », puis « 29/10 ») : coupée par la fin, la ligne
              perdait le ciel. */}
          <Text
            style={s.date}
            maxFontSizeMultiplier={1}
            numberOfLines={1}
            onLayout={(e) => setDateLineH(e.nativeEvent.layout.height)}
            accessibilityLabel={
              dateLabel(now) + (weather ? ', ' + weather.replace('°', ' degrés').replace(' · ', ', ') : '')
            }>
            {dateTier < DATE_FORMATS.length
              ? DATE_FORMATS[dateTier](now).toUpperCase() + weatherText
              : weather
                ? weatherText.slice(' · '.length)
                : numericDateLabel(now)}
          </Text>
          {/* Chaque palier, invisible et hors du flux (il ne compte pas dans
              `restH`), sans limite de lignes : sa hauteur dit s'il tiendrait. */}
          {DATE_FORMATS.map((format, i) => (
            <Text
              key={i}
              style={[s.date, s.measure]}
              maxFontSizeMultiplier={1}
              onLayout={(e) => {
                const h = e.nativeEvent.layout.height;
                setTierH((prev) => (prev[i] === h ? prev : prev.map((v, j) => (j === i ? h : v))));
              }}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants">
              {format(now).toUpperCase()}
              {weatherText}
            </Text>
          ))}
          <Text style={s.next} maxFontSizeMultiplier={1}>
            {lib.next ? '⏰ ' + whenLabel(lib.next.at) : 'AUCUN RÉVEIL ARMÉ'}
          </Text>
          {station ? <Text style={s.station}>{station.name}</Text> : null}
          {/* Ce qui passe, pas seulement où ça passe : l'écran affichait la
              station sans jamais dire le morceau, alors que l'appli le connaît. */}
          {station && title ? (
            <Text style={s.track} numberOfLines={1}>
              {title}
            </Text>
          ) : null}

          {/* Écouter sans se relever ni retourner le téléphone. Zapper non plus :
              la liste des stations reste en portrait, mais la file du lecteur est
              la même des deux côtés, donc les deux flèches suffisent à en changer
              sans quitter l'horloge. */}
          <View style={s.transport}>
            <Pressable
              onPress={onPrevious}
              disabled={!station}
              accessibilityRole="button"
              accessibilityState={{ disabled: !station }}
              accessibilityLabel="Station précédente"
              style={[t.btn, s.skip, { borderColor: station ? p.base : p.border }]}>
              <Text style={[t.btnText, s.skipText, !station && t.btnOff]} maxFontSizeMultiplier={1}>◀◀</Text>
            </Pressable>

            <Pressable
              onPress={onToggle}
              disabled={!station}
              accessibilityRole="button"
              accessibilityState={{ disabled: !station, busy: connecting }}
              accessibilityLabel={playing ? 'Mettre en pause' : 'Lancer la radio'}
              style={[t.btn, s.play, { borderColor: station ? p.base : p.border }]}>
              <Text
                style={[t.btnText, s.playText, !station && t.btnOff]}
                maxFontSizeMultiplier={1}
                numberOfLines={1}
                adjustsFontSizeToFit>
                {/* Les mêmes glyphes que l'écran portrait : ⏸ sortait en emoji
                    de couleur, seul élément non Pip-Boy de l'écran. */}
                {!station
                  ? '▶ AUCUNE STATION'
                  : connecting
                    ? '… CONNEXION'
                    : playing
                      ? '❚❚ PAUSE'
                      : '▶ ÉCOUTER'}
              </Text>
            </Pressable>

            <Pressable
              onPress={onNext}
              disabled={!station}
              accessibilityRole="button"
              accessibilityState={{ disabled: !station }}
              accessibilityLabel="Station suivante"
              style={[t.btn, s.skip, { borderColor: station ? p.base : p.border }]}>
              <Text style={[t.btnText, s.skipText, !station && t.btnOff]} maxFontSizeMultiplier={1}>▶▶</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <View style={[s.right, dimmed && keepClock && s.dimRest]}>
        {/* Le mode vélo en tête de la colonne des réveils, hors de leur liste
            défilante : toujours visible, même avec dix réveils. Surtout pas
            dans la colonne de l'heure — celle-ci est dimensionnée sur la
            hauteur du bloc mesuré dessous (`restH`), et toute ligne ajoutée
            là lui serait retirée. Ici, ce bouton ne prend de hauteur qu'à la
            liste des réveils, qui défile de toute façon. */}
        {onRide ? (
          <View style={s.rightHead}>
            <Pressable
              onPress={onRide}
              accessibilityRole="button"
              accessibilityLabel="Passer en mode vélo"
              style={[t.btn, s.ride]}>
              <Text style={t.btnText} maxFontSizeMultiplier={1}>VÉLO ▶</Text>
            </Pressable>
          </View>
        ) : null}
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
              onSkip={() => lib.toggleSkip(alarm.id)}
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
          moindre contact, et sans rien changer aux réglages du téléphone. La
          luminosité de la fenêtre baisse avec lui (voir l'effet sur `dimmed`). */}
      {dimmed && !keepClock ? <View style={s.veil} pointerEvents="none" /> : null}
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
  onSkip,
  onRemove,
}: {
  alarm: Alarm;
  open: boolean;
  station: Station | null;
  onOpen: () => void;
  onSave: (a: Alarm) => void;
  onToggle: () => void;
  onSkip: () => void;
  onRemove: () => void;
}) {
  const { p, t } = useTheme();
  const s = useMemo(() => makeStyles(p), [p]);
  // Un saut ne compte que sur un réveil allumé : éteint, il ne sonne pas de
  // toute façon, et rallumer efface le saut (voir `toggle` dans useAlarms).
  const skipped = alarm.enabled && alarm.skipNext === true;
  const lit = alarm.enabled && !skipped;
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
    <View style={[s.row, { borderColor: lit ? p.base : p.border }]}>
      <Pressable onPress={onOpen} style={s.rowHead} accessibilityRole="button">
        <Text style={[s.rowTime, { color: lit ? p.base : p.dim }]}>
          {two(alarm.hour)}:{two(alarm.minute)}
        </Text>
        <View style={s.rowText}>
          {/* Le saut dit en toutes lettres, pas seulement par une couleur plus
              terne : la nuit, un vert atténué ressemble à un vert éteint. */}
          <Text style={s.rowDays}>
            {skipped ? 'SAUTÉ UNE FOIS · ' : ''}
            {describeDays(alarm.days)}
          </Text>
          <Text style={s.rowStation} numberOfLines={1}>{alarm.title}</Text>
        </View>
      </Pressable>

      {/* ON/OFF et le saut côte à côte : la colonne des réveils n'est pas
          mesurée, mais une ligne de plus par réveil en laisserait moins à l'écran. */}
      <View style={s.rowControls}>
        <Pressable
          onPress={onToggle}
          accessibilityRole="switch"
          accessibilityState={{ checked: alarm.enabled }}
          accessibilityLabel={alarm.enabled ? 'Désactiver ce réveil' : 'Activer ce réveil'}
          style={[t.btn, s.rowBtn]}>
          <Text style={[t.btnText, !alarm.enabled && t.btnOff]}>{alarm.enabled ? 'ON' : 'OFF'}</Text>
        </Pressable>

        {/* Sauter demain sans éteindre le réveil, et donc sans avoir à penser
            à le rallumer. Sur un réveil unique, sauter revient à l'éteindre. */}
        {alarm.enabled ? (
          <Pressable
            onPress={onSkip}
            accessibilityRole="button"
            accessibilityLabel={
              skipped
                ? 'Reprendre : la prochaine sonnerie de ce réveil est sautée'
                : 'Sauter la prochaine sonnerie de ce réveil'
            }
            style={[t.btn, s.rowBtn]}>
            <Text style={t.btnText}>{skipped ? 'REPRENDRE' : 'SAUTER'}</Text>
          </Pressable>
        ) : null}
      </View>

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
    left: { flex: 1.15 },
    leftContent: { flexGrow: 1, justifyContent: 'center' },
    // La taille vient du composant, calculée sur l'écran ; ce qui reste ici
    // ne dépend pas de la largeur.
    // `flex-start` : la boîte prend la largeur du texte, pas celle de la
    // colonne, sinon la mesure de `emWidth` ne mesurerait que la colonne.
    clock: { color: p.base, fontFamily: FONT_DISPLAY, alignSelf: 'flex-start', includeFontPadding: false },
    date: { color: p.dim, fontFamily: FONT_DISPLAY, fontSize: 24, letterSpacing: 3 },
    measure: { position: 'absolute', top: 0, left: 0, right: 0, opacity: 0 },
    next: { color: p.base, fontFamily: FONT_DISPLAY, fontSize: 26, letterSpacing: 2, marginTop: 16 },
    station: { color: p.dim, fontFamily: FONT_BODY, fontSize: 13, marginTop: 4 },
    track: { color: p.base, fontFamily: FONT_BODY, fontSize: 15, marginTop: 2, opacity: 0.9 },
    // Les trois boutons de transport sur une ligne, toujours. Ils passaient à
    // la ligne quand la place manquait (écran étroit, affichage agrandi) : la
    // deuxième rangée volait de la hauteur à l'horloge, puis sortait de
    // l'écran. C'est désormais le libellé du milieu qui rétrécit.
    transport: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18 },
    // Large : c'est un bouton qu'on vise à moitié réveillé, de travers, dans
    // le noir. `flexShrink` : le seul des trois qui cède de la largeur.
    play: { paddingVertical: 12, paddingHorizontal: 22, flexShrink: 1 },
    playText: { fontSize: 26, letterSpacing: 2, lineHeight: 30 },
    // Même hauteur de cible que la lecture, moins de largeur : deux glyphes
    // au lieu d'un mot.
    skip: { paddingVertical: 12, paddingHorizontal: 18 },
    skipText: { fontSize: 26, letterSpacing: 2, lineHeight: 30 },

    right: { flex: 1 },
    // Calé à droite : le bouton ne prend que sa largeur, la colonne garde son air.
    rightHead: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 },
    ride: { minHeight: 44, justifyContent: 'center' },
    row: { borderWidth: 1, backgroundColor: p.bg2, padding: 8, marginBottom: 8 },
    rowHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    rowTime: { fontFamily: FONT_DISPLAY, fontSize: 34, lineHeight: 38 },
    rowText: { flex: 1 },
    rowDays: { color: p.dim, fontFamily: FONT_DISPLAY, fontSize: 15, letterSpacing: 2 },
    rowStation: { color: p.dim, fontFamily: FONT_BODY, fontSize: 11 },
    rowControls: { flexDirection: 'row', gap: 8, marginTop: 6 },
    // 44 dp : la cible minimale, visée dans le noir et à moitié endormi.
    rowBtn: { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center' },

    editor: { marginTop: 8, gap: 6 },
    // `wrap` : agrandi, OK et ✕ sortaient de la colonne à droite.
    editRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
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
    // HEURE LISIBLE : une opacité par zone au lieu du voile, l'heure baisse
    // moins que le reste — c'est elle qu'on cherche des yeux dans le noir.
    dimClock: { opacity: 0.6 },
    dimRest: { opacity: 0.28 },
  });
