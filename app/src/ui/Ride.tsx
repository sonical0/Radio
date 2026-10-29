import { useEffect, useMemo, useState } from 'react';
import { AppState, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { setKeepAwake } from '../../modules/alarm';
import type { Station } from '../model/station';
import type { StreamState } from '../player/usePlayback';
import { favoriteStations } from '../store/library';
import { describeStep, useNavStep, type StepView } from '../store/useNavStep';
import { useWeather } from '../store/useWeather';
import { FONT_BODY, FONT_DISPLAY, useTheme, type Palette } from './theme';

/**
 * La hauteur de ligne de l'heure, en corps : la même que l'horloge de chevet,
 * pour les mêmes raisons (métriques de VT323, voir `CLOCK_LINE` dans Bedside).
 * Au-delà, plus de la moitié de la boîte est vide et cette hauteur est prise
 * aux boutons.
 */
const CLOCK_LINE = 0.8;

/**
 * La hauteur des cibles principales. 72 dp au moins : on les touche avec des
 * gants, d'un doigt qui tremble avec la route, sans les regarder longtemps.
 * Les boutons de lecture en prennent un peu plus, ce sont eux qu'on vise le
 * plus souvent.
 */
const TARGET = 72;
const TRANSPORT_H = 80;

/**
 * La ligne de manœuvre sous la distance, en navigation : deux lignes au plus,
 * et toujours la hauteur de deux, même quand une suffit. Une hauteur qui
 * changerait avec le texte ferait sauter la taille de la distance à chaque
 * nouvelle rue ; fixe, elle se retranche d'avance (`NAV_TEXT_H`).
 */
const NAV_LINE = 26;
const NAV_TEXT_H = 4 + 2 * NAV_LINE;
/**
 * L'heure et l'heure d'arrivée, sur une rangée sous la distance. 48 et non
 * plus 32 : à 32, sur le vrai téléphone, on ne les lisait plus d'un coup d'œil
 * au guidon. Même corps pour les deux, c'est la même sorte d'information.
 */
const TIMES = 48;
const TIMES_LINE = Math.round(TIMES * CLOCK_LINE);
/** La rangée des heures, marge comprise : retranchée d'avance comme la manœuvre. */
const TIMES_ROW_H = 6 + TIMES_LINE;
/** L'écart entre l'heure, l'arrivée et la température dans leur rangée. */
const TIMES_GAP = 20;
/**
 * La distance se dimensionne pour cinq caractères au moins (« 230 m ») :
 * VT323 est à chasse fixe, et sans ce plancher elle grossirait en passant de
 * « 300 m » à « 50 m ». Six (« 1,2 km ») la gardait petite tout le trajet
 * pour un seul changement d'unité ; elle ne rétrécit plus qu'à ce moment-là.
 */
const NAV_MIN_CHARS = 5;

function two(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Le mode vélo — le téléphone en paysage sur le guidon.
 *
 * On jette un œil à l'écran en roulant : rien ici ne se lit de près ni ne
 * demande de viser. Trois boutons de lecture et les favoris en gros, l'heure,
 * ce qui passe ; pas d'édition, pas de liste. Un contact ne fait que ce que
 * fait le bouton touché : pas d'écran entier sensible, qu'un cahot ou une
 * goutte de pluie ne coupe pas la musique.
 *
 * Toutes les tailles de texte sont fixes (`maxFontSizeMultiplier={1}`) ou
 * calculées sur l'écran (l'heure) : la police agrandie du système prenait
 * chaque point de hauteur aux boutons. La mise en page tient sur 329 dp de
 * haut, ce que donne un téléphone 1080 × 2400 à l'affichage agrandi (densité
 * 525) — voir les chiffres au-dessus de `makeStyles`.
 */
export function Ride({
  station,
  title,
  playing,
  streamState,
  onToggle,
  onNext,
  onPrevious,
  stations,
  onSelect,
  onBedside,
  onExit,
}: {
  station: Station | null;
  title: string | null;
  playing: boolean;
  streamState: StreamState;
  onToggle: () => void;
  onNext: () => void;
  onPrevious: () => void;
  stations: Station[];
  onSelect: (s: Station) => void;
  /** Paysage : retour à l'horloge de chevet. */
  onBedside?: () => void;
  /** Portrait : retour à la liste. Exclusif avec `onBedside`. */
  onExit?: () => void;
}) {
  const { p, t } = useTheme();
  const s = useMemo(() => makeStyles(p), [p]);
  const { width, height } = useWindowDimensions();
  // Les deux états où l'on attend du son, comme dans Bedside.
  const connecting = streamState === 'buffering' || streamState === 'reconnecting';
  const favs = useMemo(() => favoriteStations(stations), [stations]);
  // Rien quand aucune ville n'est réglée ou que le réseau manque : voir useWeather.
  const weather = useWeather();
  // Une navigation Google Maps en cours : son étape prend la place de l'heure.
  // `null` hors navigation, et l'écran est alors exactement celui d'avant.
  const step = useNavStep();
  const stepView = useMemo(() => (step ? describeStep(step) : null), [step]);
  const [now, setNow] = useState(() => new Date());

  // L'heure se dimensionne comme celle du chevet : sur la colonne mesurée,
  // moins ce qui s'affiche à côté (la météo) et dessous (station, titre,
  // boutons). Une taille forfaitaire poussait les boutons hors de l'écran
  // agrandi ; ici, ce sont les boutons qui comptent, l'heure prend le reste.
  const [column, setColumn] = useState({ w: 0, h: 0 });
  const [restH, setRestH] = useState(0);
  const [weatherW, setWeatherW] = useState(0);
  // Largeur de « 07:00 » en cadratins, mesurée sur le texte affiché : cette
  // police pixel a des glyphes bien plus petits que leur corps.
  const [emWidth, setEmWidth] = useState(1.8);
  const clockSize = useMemo(() => {
    const side = weather ? weatherW + 12 : 0;
    const avail = (column.w || width * 0.55 - 40) - side;
    const byWidth = avail / (emWidth * 1.04);
    const byHeight = column.h && restH ? (column.h - restH) / CLOCK_LINE : height * 0.35;
    return Math.max(32, Math.floor(Math.min(byWidth, byHeight)));
  }, [column, emWidth, height, restH, weather, weatherW, width]);

  // L'heure ne bat que quand l'écran est là.
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

  // L'écran reste allumé tant qu'on roule : le rallumer d'un gant sur un
  // capteur d'empreinte, c'est lâcher le guidon. Ni voile ni luminosité baissée
  // ici — en plein jour, on doit lire l'écran au soleil. En passant au chevet,
  // React démonte avant de monter : le `false` d'ici précède le `true` de
  // Bedside, l'écran reste allumé.
  useEffect(() => {
    setKeepAwake(true);
    return () => setKeepAwake(false);
  }, []);

  const playLabel = !station
    ? '▶ AUCUNE STATION'
    : connecting
      ? '… CONNEXION'
      : playing
        ? '❚❚ PAUSE'
        : '▶ ÉCOUTER';

  // Ce qui passe, ou pourquoi rien ne passe : un flux coupé se voit d'un coup
  // d'œil au lieu de se deviner au silence.
  const subLine =
    streamState === 'dropped' ? '✕ FLUX INTERROMPU' : station && title ? title : null;

  return (
    // Ouvert en portrait par le bouton VÉLO de la liste, les deux colonnes
    // s'empilent : côte à côte sur 360 dp, trois boutons de 72 n'y tiennent pas.
    <View style={[s.screen, height > width && s.stacked]}>
      {/* Défilante en dernier recours, comme au chevet : si même une heure
          réduite au minimum ne laisse pas la place aux boutons, on doit
          pouvoir aller les chercher. */}
      <ScrollView
        style={s.left}
        contentContainerStyle={s.leftContent}
        onLayout={(e) => setColumn({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {/* En navigation, l'étape à la place de la rangée de l'heure, et rien
            d'autre ne change : sans étape, la rangée ci-dessous est celle de
            toujours, avec ses styles. */}
        {stepView ? (
          <NavHeader view={stepView} now={now} weather={weather} s={s} tint={p.base} />
        ) : (
          <View style={s.clockRow}>
            {/* Taille déjà calculée sur l'écran : la police du système ne la
                multiplie pas encore. */}
            <Text
              style={[s.clock, { fontSize: clockSize, lineHeight: Math.round(clockSize * CLOCK_LINE) }]}
              numberOfLines={1}
              allowFontScaling={false}
              onLayout={(e) => {
                const w = e.nativeEvent.layout.width / clockSize;
                if (w > 0.5 && Math.abs(w - emWidth) > 0.01) setEmWidth(w);
              }}
              accessibilityLabel={'Il est ' + now.getHours() + ' heures ' + now.getMinutes()}>
              {two(now.getHours())}:{two(now.getMinutes())}
            </Text>
            {/* À côté de l'heure, pas dessous : une ligne de plus sous l'heure
                serait prise aux boutons. Deux lignes au plus, et jamais plus de
                40 % de la colonne : c'est la météo qui cède, pas l'heure. */}
            {weather ? (
              <Text
                style={[s.weather, { maxWidth: (column.w || width * 0.5) * 0.4 }]}
                maxFontSizeMultiplier={1}
                numberOfLines={2}
                onLayout={(e) => {
                  const w = Math.ceil(e.nativeEvent.layout.width);
                  if (w !== weatherW) setWeatherW(w);
                }}
                accessibilityLabel={weather.replace('°', ' degrés').replace(' · ', ', ')}>
                {weather.replace(' · ', '\n').toUpperCase()}
              </Text>
            ) : null}
          </View>
        )}

        <View style={s.rest} onLayout={(e) => setRestH(e.nativeEvent.layout.height)}>
          {/* Une ligne chacun, coupés par la fin : leur hauteur est fixe,
              c'est elle que l'heure retranche de la sienne. */}
          <Text style={s.station} numberOfLines={1} maxFontSizeMultiplier={1}>
            {station ? station.name.toUpperCase() : 'AUCUNE STATION'}
          </Text>
          <Text style={s.track} numberOfLines={1} maxFontSizeMultiplier={1}>
            {subLine ?? ' '}
          </Text>

          <View style={s.transport}>
            <Pressable
              onPress={onPrevious}
              disabled={!station}
              accessibilityRole="button"
              accessibilityState={{ disabled: !station }}
              accessibilityLabel="Station précédente"
              style={({ pressed }) => [
                t.btn,
                s.big,
                s.skip,
                { borderColor: station ? p.base : p.border },
                pressed && s.pressed,
              ]}>
              <Text style={[t.btnText, s.bigText, !station && t.btnOff]} maxFontSizeMultiplier={1}>
                ◀◀
              </Text>
            </Pressable>

            <Pressable
              onPress={onToggle}
              disabled={!station}
              accessibilityRole="button"
              accessibilityState={{ disabled: !station, busy: connecting }}
              accessibilityLabel={playing ? 'Mettre en pause' : 'Lancer la radio'}
              style={({ pressed }) => [
                t.btn,
                s.big,
                s.play,
                { borderColor: station ? p.base : p.border },
                pressed && s.pressed,
              ]}>
              <Text
                style={[t.btnText, s.bigText, !station && t.btnOff]}
                maxFontSizeMultiplier={1}
                numberOfLines={1}
                adjustsFontSizeToFit>
                {playLabel}
              </Text>
            </Pressable>

            <Pressable
              onPress={onNext}
              disabled={!station}
              accessibilityRole="button"
              accessibilityState={{ disabled: !station }}
              accessibilityLabel="Station suivante"
              style={({ pressed }) => [
                t.btn,
                s.big,
                s.skip,
                { borderColor: station ? p.base : p.border },
                pressed && s.pressed,
              ]}>
              <Text style={[t.btnText, s.bigText, !station && t.btnOff]} maxFontSizeMultiplier={1}>
                ▶▶
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <View style={s.right}>
        {/* Les favoris en lecture seule : on les choisit en portrait, pas sur
            le guidon. Deux par rangée, six au plus (FAVORITES_MAX) : trois
            rangées de 72 dp tiennent sur l'écran agrandi, et la grille défile
            si jamais elles ne tiennent pas. */}
        <ScrollView style={s.favScroll} contentContainerStyle={s.favGrid} accessibilityLabel="Favoris">
          {favs.length ? (
            favs.map((st, i) => {
              const active = !!station && st.url === station.url;
              const on = active && playing;
              return (
                <Pressable
                  key={st.url}
                  onPress={() => onSelect(st)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={'Favori ' + (i + 1) + ' : ' + st.name}
                  style={({ pressed }) => [
                    s.fav,
                    active && (on ? s.favOn : s.favSelected),
                    pressed && s.pressed,
                  ]}>
                  <Text
                    style={[s.favName, active && s.favNameActive]}
                    numberOfLines={2}
                    maxFontSizeMultiplier={1}>
                    {on ? '■ ' : ''}
                    {st.name}
                  </Text>
                </Pressable>
              );
            })
          ) : (
            <Text style={s.hint} maxFontSizeMultiplier={1}>
              Aucun favori. En portrait, l'étoile ☆ d'une station l'ajoute ici.
            </Text>
          )}
        </ScrollView>

        {/* Moins visible que la lecture : on ne quitte le mode vélo qu'à
            l'arrêt. Hauteur de cible tout de même confortable. */}
        {onBedside || onExit ? (
          <Pressable
            onPress={onBedside ?? onExit}
            accessibilityRole="button"
            accessibilityLabel={onBedside ? "Revenir à l'horloge de chevet" : 'Quitter le mode vélo'}
            style={({ pressed }) => [t.btn, s.exit, pressed && s.pressed]}>
            <Text style={t.btnText} maxFontSizeMultiplier={1}>
              {onBedside ? '◀ CHEVET' : '◀ RETOUR'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * L'étape de navigation, à la place de la rangée de l'heure : la flèche et la
 * distance en très gros, l'heure et l'arrivée dessous, la manœuvre en bas.
 *
 * Elle prend toute la hauteur que le bloc des boutons laisse (`flex: 1`), et
 * c'est cette boîte, mesurée, qui dimensionne la distance : en 1.8.0, la
 * taille était déduite de la colonne et laissait une bande vide en haut et en
 * bas. La rangée des heures et la manœuvre ont des hauteurs fixes, retranchées
 * d'avance ; la distance prend le reste, ou la largeur si elle décide avant.
 */
function NavHeader({
  view,
  now,
  weather,
  s,
  tint,
}: {
  view: StepView;
  now: Date;
  weather: string | null;
  s: ReturnType<typeof makeStyles>;
  tint: string;
}) {
  const clockText = two(now.getHours()) + ':' + two(now.getMinutes());
  // Sans distance ni reste du trajet, l'heure garde sa place en gros, et ne
  // se répète pas dans la rangée du dessous.
  const big = view.distance ?? clockText;
  const small = view.distance != null;
  const times = small || view.arrival != null;
  const [box, setBox] = useState({ w: 0, h: 0 });
  // Largeur d'un caractère en corps, mesurée sur la distance affichée : la
  // police est à chasse fixe, elle vaut pour les heures aussi.
  const [charEm, setCharEm] = useState(0.4);

  const size = useMemo(() => {
    if (!box.w || !box.h) return 48;
    const arrow = view.icon ? 8 : 0;
    const chars = Math.max(big.length, NAV_MIN_CHARS);
    // La flèche est carrée, de la hauteur de ligne de la distance.
    const byWidth = (box.w - arrow) / (chars * charEm * 1.04 + (view.icon ? CLOCK_LINE : 0));
    const byHeight = (box.h - (times ? TIMES_ROW_H : 0) - NAV_TEXT_H) / CLOCK_LINE;
    return Math.max(32, Math.floor(Math.min(byWidth, byHeight)));
  }, [big.length, box, charEm, times, view.icon]);
  const line = Math.round(size * CLOCK_LINE);

  // La température en dernier, seulement si elle tient encore sur la rangée :
  // la météo s'efface, jamais l'heure ni l'arrivée.
  const tempText = weather ? weather.split(' · ')[0] : null;
  const timesW = (texts: string[]) =>
    texts.reduce((w, t) => w + t.length * charEm * TIMES, 0) + (texts.length - 1) * TIMES_GAP;
  const shown = [small ? clockText : '', view.arrival ? '→ ' + view.arrival : ''].filter(Boolean);
  const temp =
    times && tempText && box.w && timesW([...shown, tempText]) <= box.w ? tempText : null;

  return (
    <View style={s.navBox} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <View style={s.navStep}>
        {view.icon ? (
          <Image
            source={{ uri: view.icon }}
            style={{ width: line, height: line, tintColor: tint }}
            resizeMode="contain"
            accessible={false}
            importantForAccessibility="no"
          />
        ) : null}
        <Text
          style={[s.navDistance, { fontSize: size, lineHeight: line }]}
          numberOfLines={1}
          allowFontScaling={false}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width / size / big.length;
            if (w > 0.15 && Math.abs(w - charEm) > 0.005) setCharEm(w);
          }}
          // La phrase entière au toucher ; elle n'est pas annoncée d'elle-même,
          // la distance change trop souvent pour qu'on la répète à chaque fois.
          accessibilityLabel={
            small ? view.label : 'Il est ' + now.getHours() + ' heures ' + now.getMinutes()
          }>
          {big}
        </Text>
      </View>
      {times ? (
        <View style={s.navTimes}>
          {small ? (
            <Text
              style={s.navTime}
              numberOfLines={1}
              allowFontScaling={false}
              accessibilityLabel={'Il est ' + now.getHours() + ' heures ' + now.getMinutes()}>
              {clockText}
            </Text>
          ) : null}
          {view.arrival ? (
            <Text
              style={s.navTime}
              numberOfLines={1}
              allowFontScaling={false}
              accessibilityLabel={'Arrivée à ' + view.arrival}>
              {'→ ' + view.arrival}
            </Text>
          ) : null}
          {temp ? (
            <Text
              style={[s.navTime, s.navTemp]}
              numberOfLines={1}
              allowFontScaling={false}
              accessibilityLabel={temp.replace('°', ' degrés')}>
              {temp.toUpperCase()}
            </Text>
          ) : null}
        </View>
      ) : null}
      {/* Hauteur fixe de deux lignes, comptée d'avance dans la taille de la
          distance. Seule la manœuvre est annoncée d'elle-même, sans couper la
          parole : une fois par étape, pas à chaque mètre parcouru. */}
      <View style={s.navText} accessibilityLiveRegion="polite">
        <Text
          style={s.navManeuver}
          numberOfLines={2}
          ellipsizeMode="tail"
          maxFontSizeMultiplier={1}
          accessibilityLabel={view.maneuver ?? ''}>
          {view.maneuver ? view.maneuver.toUpperCase() : ' '}
        </Text>
      </View>
    </View>
  );
}

/*
 * Le compte, sur l'écran le plus serré visé : 1080 × 2400 à la densité 525,
 * soit 329 dp de haut et environ 730 de large (moins une barre de navigation
 * à boutons sur le côté, ~48). Barre d'état cachée par App.tsx.
 *
 * Hauteur utile : 329 − 2 × 12 de marge = 305 dp.
 *
 * Colonne de gauche : station 26 + titre 2 + 20 + boutons 10 + 80 = 138 dp,
 * auxquels s'ajoute l'écart de 8 sous l'heure : 146. Il reste 159 dp de ligne
 * à l'heure, soit un corps de 198 au plus ; c'est la largeur qui décide avant
 * (≈ 360 dp de colonne, moins la météo). Si la mesure se trompe, l'heure
 * rétrécit, et la colonne défile en dernier recours.
 *
 * En navigation, l'étape prend la boîte que les boutons laissent, mesurée :
 * 305 − 146 = 159 dp. La rangée des heures (6 + 38 = 44) et la manœuvre
 * (4 + 2 × 26 = 56) s'en retranchent : 59 dp de ligne, un corps de ≈ 73 pour
 * la distance, que la largeur (≈ 360 dp, cinq caractères à ≈ 0,4 cadratin
 * plus la flèche de 0,8 : ≈ 125) ne limite pas. Total : 159 ≤ 159, la colonne
 * est pleine. Sur le téléphone de l'utilisateur (2400 × 1080 à densité 420,
 * ≈ 411 dp de haut), la boîte fait ≈ 241 dp et c'est la largeur (≈ 490 dp)
 * qui décide : un corps de ≈ 165 ; le surplus de hauteur se répartit entre
 * les rangées (`space-between`) au lieu de rester en bandes vides. En portrait
 * empilé, même calcul sur la boîte mesurée.
 *
 * Colonne de droite : trois rangées de favoris à 72 + deux écarts de 8 = 232,
 * puis 8 et le bouton CHEVET à 48 = 288 ≤ 305. La grille prend `flex: 1` et
 * défile si une rangée ne tenait pas : le bouton de sortie reste visible.
 *
 * Aucune de ces hauteurs ne grandit avec la police du système : toutes les
 * tailles sont fixes (`maxFontSizeMultiplier={1}`) ou calculées.
 */
const makeStyles = (p: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, flexDirection: 'row', backgroundColor: p.bg, padding: 12, gap: 12 },
    stacked: { flexDirection: 'column' },
    // Un peu plus de la moitié pour l'heure et la lecture : ce sont elles
    // qu'on regarde ; les favoris se contentent de deux colonnes de noms.
    left: { flex: 1.25 },
    leftContent: { flexGrow: 1, justifyContent: 'center' },
    clockRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    // Dans une rangée, la boîte prend déjà la largeur du texte : c'est elle
    // que mesure `emWidth`. `flexShrink: 0`, sinon la météo la rognerait.
    clock: { color: p.base, fontFamily: FONT_DISPLAY, flexShrink: 0, includeFontPadding: false },
    weather: { color: p.dim, fontFamily: FONT_DISPLAY, fontSize: 24, lineHeight: 26, letterSpacing: 2 },
    // L'écart sous l'heure est un `paddingTop` et non une marge : il entre
    // ainsi dans la hauteur mesurée de ce bloc, que l'heure retranche.
    rest: { paddingTop: 8 },
    station: { color: p.base, fontFamily: FONT_DISPLAY, fontSize: 24, lineHeight: 26, letterSpacing: 2 },
    track: { color: p.dim, fontFamily: FONT_BODY, fontSize: 15, lineHeight: 20, marginTop: 2 },
    // Toujours sur une ligne : c'est le libellé du milieu qui rétrécit, jamais
    // une deuxième rangée qui sortirait de l'écran.
    transport: { flexDirection: 'row', alignItems: 'stretch', gap: 10, marginTop: 10, height: TRANSPORT_H },
    big: { minHeight: TARGET, justifyContent: 'center', alignItems: 'center', paddingVertical: 0 },
    // Les flèches gardent une largeur de pouce ganté ; la lecture prend le reste.
    skip: { flexGrow: 1, flexBasis: 0, minWidth: TARGET, paddingHorizontal: 8 },
    play: { flexGrow: 1.7, flexBasis: 0, flexShrink: 1, paddingHorizontal: 12 },
    bigText: { fontSize: 32, lineHeight: 36, letterSpacing: 2 },
    pressed: { opacity: 0.6 },

    right: { flex: 1, gap: 8 },
    favScroll: { flex: 1 },
    favGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, flexGrow: 1, alignContent: 'center' },
    // Deux par rangée : `flexBasis` sous la moitié pour laisser l'écart.
    fav: {
      flexBasis: '45%',
      flexGrow: 1,
      minHeight: TARGET,
      borderWidth: 1,
      borderColor: p.dim,
      backgroundColor: p.bg3,
      paddingHorizontal: 10,
      paddingVertical: 4,
      justifyContent: 'center',
    },
    // Choisie, et à l'antenne : le cadre s'allume, puis le fond — et un ■
    // devant le nom, pour qui ne distingue pas bien les verts au soleil.
    favSelected: { borderColor: p.base },
    favOn: { borderColor: p.base, borderWidth: 2, backgroundColor: p.bg2 },
    favName: { color: p.bright, fontFamily: FONT_DISPLAY, fontSize: 22, lineHeight: 24, letterSpacing: 1 },
    favNameActive: { color: p.base },
    hint: { color: p.dim, fontFamily: FONT_BODY, fontSize: 12, lineHeight: 16 },

    exit: { minHeight: 48, justifyContent: 'center', alignItems: 'center' },

    // En navigation seulement (NavHeader) : aucun des styles ci-dessus n'est
    // repris ni modifié, l'écran sans étape reste celui d'avant.
    // Toute la hauteur que laisse le bloc des boutons : `flex: 1` (base 0) la
    // donne quel que soit le contenu, et c'est elle qu'on mesure.
    navBox: { flex: 1, justifyContent: 'space-between' },
    navStep: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    navDistance: { color: p.base, fontFamily: FONT_DISPLAY, flexShrink: 0, includeFontPadding: false },
    navTimes: { flexDirection: 'row', alignItems: 'center', gap: TIMES_GAP, marginTop: 6, height: TIMES_LINE },
    navTime: {
      color: p.base,
      fontFamily: FONT_DISPLAY,
      fontSize: TIMES,
      lineHeight: TIMES_LINE,
      includeFontPadding: false,
    },
    navTemp: { color: p.dim },
    navText: { height: NAV_TEXT_H, paddingTop: 4 },
    navManeuver: {
      color: p.bright,
      fontFamily: FONT_DISPLAY,
      fontSize: 26,
      lineHeight: NAV_LINE,
      letterSpacing: 1,
      includeFontPadding: false,
    },
  });
