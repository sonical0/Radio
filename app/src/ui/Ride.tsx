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
/** L'heure en petit à droite de la distance, et sa hauteur de ligne. */
const SMALL_CLOCK = 32;
const SMALL_CLOCK_LINE = Math.round(SMALL_CLOCK * CLOCK_LINE);
/** La ligne de `s.weather`, qu'on reprend pour la température sous la petite heure. */
const WEATHER_LINE = 26;
/**
 * La distance se dimensionne pour six caractères au moins (« 1,2 km ») :
 * VT323 est à chasse fixe, et sans ce plancher la distance grossirait en
 * passant de « 300 m » à « 50 m », puis rétrécirait au kilomètre suivant.
 */
const NAV_MIN_CHARS = 6;

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
          <NavHeader
            view={stepView}
            now={now}
            weather={weather}
            column={column}
            restH={restH}
            width={width}
            height={height}
            s={s}
            tint={p.base}
          />
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
 * distance en très gros, l'heure en petit à droite, la manœuvre dessous.
 *
 * La distance se dimensionne comme l'heure : sur la colonne mesurée, moins le
 * bloc du dessous (`restH`) et la ligne de manœuvre, dont la hauteur est fixe
 * (`NAV_TEXT_H`). C'est en général la largeur qui décide.
 */
function NavHeader({
  view,
  now,
  weather,
  column,
  restH,
  width,
  height,
  s,
  tint,
}: {
  view: StepView;
  now: Date;
  weather: string | null;
  column: { w: number; h: number };
  restH: number;
  width: number;
  height: number;
  s: ReturnType<typeof makeStyles>;
  tint: string;
}) {
  const clockText = two(now.getHours()) + ':' + two(now.getMinutes());
  // Sans distance ni reste du trajet, l'heure garde sa place en gros, et la
  // petite heure n'a plus lieu d'être.
  const big = view.distance ?? clockText;
  const small = view.distance != null;
  // La colonne de droite : la petite heure, l'arrivée dessous, puis la
  // température s'il reste de la place.
  const side = small || view.arrival != null;
  // Largeur d'un caractère en corps, mesurée sur le texte affiché comme
  // `emWidth` pour l'heure : la police est à chasse fixe, un seul chiffre suffit.
  const [charEm, setCharEm] = useState(0.36);
  // Largeur de la colonne de droite (petite heure, arrivée, température), mesurée.
  const [sideW, setSideW] = useState(60);

  const size = useMemo(() => {
    const sideSpace = side ? sideW + 12 : 0;
    const arrow = view.icon ? 8 : 0;
    const avail = (column.w || width * 0.55 - 40) - sideSpace - arrow;
    const chars = Math.max(big.length, NAV_MIN_CHARS);
    // La flèche est carrée, de la hauteur de ligne de la distance.
    const byWidth = avail / (chars * charEm * 1.04 + (view.icon ? CLOCK_LINE : 0));
    const byHeight =
      column.h && restH ? (column.h - restH - NAV_TEXT_H) / CLOCK_LINE : height * 0.25;
    return Math.max(32, Math.floor(Math.min(byWidth, byHeight)));
  }, [big.length, charEm, column, height, restH, side, sideW, view.icon, width]);
  const line = Math.round(size * CLOCK_LINE);
  // La température en dernier, seulement si elle tient dans la hauteur de la
  // distance avec ce qui la précède : la météo s'efface, pas l'arrivée.
  const sideH = (small ? SMALL_CLOCK_LINE : 0) + (view.arrival ? WEATHER_LINE : 0);
  const temp = side && weather && line >= sideH + WEATHER_LINE ? weather.split(' · ')[0] : null;

  return (
    <View>
      <View style={s.navRow}>
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
        {side ? (
          <View
            style={s.navSide}
            onLayout={(e) => {
              const w = Math.ceil(e.nativeEvent.layout.width);
              if (w !== sideW) setSideW(w);
            }}>
            {small ? (
              <Text
                style={s.navSmallClock}
                numberOfLines={1}
                maxFontSizeMultiplier={1}
                accessibilityLabel={'Il est ' + now.getHours() + ' heures ' + now.getMinutes()}>
                {clockText}
              </Text>
            ) : null}
            {view.arrival ? (
              <Text
                style={s.navArrival}
                numberOfLines={1}
                maxFontSizeMultiplier={1}
                accessibilityLabel={'Arrivée à ' + view.arrival}>
                {'→ ' + view.arrival}
              </Text>
            ) : null}
            {temp ? (
              <Text
                style={s.weather}
                numberOfLines={1}
                maxFontSizeMultiplier={1}
                accessibilityLabel={temp.replace('°', ' degrés')}>
                {temp.toUpperCase()}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
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
 * En navigation, la ligne de manœuvre (4 + 2 × 26 = 56) se retranche en plus :
 * il reste 159 − 56 = 103 dp à la distance, soit un corps de 128 au plus.
 * La largeur décide encore avant : ≈ 360 dp de colonne, moins la petite heure
 * (≈ 60 + 12 d'écart) et 8 sous la flèche, laissent ≈ 280 dp pour six
 * caractères à ≈ 0,36 cadratin plus la flèche carrée de 0,8 : un corps de
 * ≈ 92, une ligne de ≈ 74. Total de la colonne : 74 + 56 + 146 = 276 ≤ 305.
 * À droite, la petite heure (26) puis l'arrivée « → 17:04 » (26) tiennent
 * dans ces 74 ; la température ne s'y ajoute que s'il reste 26 de plus, ce
 * qui n'arrive qu'en grand écran. La grosse valeur est en général le reste
 * du trajet (« 1,2 km ») : Maps ne donne pas la distance du virage. En portrait empilé (≈ 305 dp de large, ≈ 385 de
 * haut pour la colonne), la distance descend à un corps de ≈ 74 : 59 + 56 +
 * 146 = 261 ≤ 385.
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
    navRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    navStep: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
    // Poussée à droite : la distance garde sa place à gauche, sous l'œil.
    navSide: { marginLeft: 'auto', alignItems: 'flex-end' },
    navDistance: { color: p.base, fontFamily: FONT_DISPLAY, flexShrink: 0, includeFontPadding: false },
    navSmallClock: {
      color: p.base,
      fontFamily: FONT_DISPLAY,
      fontSize: SMALL_CLOCK,
      lineHeight: SMALL_CLOCK_LINE,
      includeFontPadding: false,
    },
    // Comme la température qu'elle remplace, mais dans la couleur de l'heure :
    // c'est une heure, et on la cherche autant qu'elle.
    navArrival: { color: p.base, fontFamily: FONT_DISPLAY, fontSize: 24, lineHeight: WEATHER_LINE, letterSpacing: 2 },
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
