import { useEffect, useMemo, useRef, useState } from 'react';
import Slider from '@react-native-community/slider';
import {
  AppState,
  Keyboard,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { setAnnounceTime } from '../../modules/alarm';
import { hasNavAccess, navAvailable, openNavAccess } from '../../modules/nav';
import { CURRENT_VERSION, type Release } from '../net/updates';
import {
  KEY_ANNOUNCE_TIME,
  KEY_BEDSIDE_DIM,
  KEY_WEATHER_CITY,
  readString,
  writeString,
  type LandscapeMode,
} from '../store/storage';
import {
  CUSTOM_PALETTE_ID,
  FONT_BODY,
  FONT_DISPLAY,
  PALETTES,
  customContrastWarning,
  hslToRgb,
  parseColor,
  rgbHex,
  rgbToHsl,
  useTheme,
  type Palette,
} from './theme';

type Hsl = { h: number; s: number; l: number };

/** Les curseurs d'une couleur ; un gris n'ayant pas de teinte, il garde `hue`. */
function hslOf(color: string, hue: number): Hsl {
  const v = rgbToHsl(parseColor(color)!);
  return { h: v.h ?? hue, s: v.s, l: v.l };
}

/** Ce que montre le téléphone à l'horizontale ; le premier choix est celui par défaut. */
const LANDSCAPE: { id: LandscapeMode; label: string }[] = [
  { id: 'bedside', label: 'CHEVET' },
  { id: 'ride', label: 'VÉLO' },
];

/** La veille de nuit de l'horloge de chevet ; le premier choix est celui par défaut. */
const BEDSIDE_DIM: { id: 'veil' | 'clock'; label: string }[] = [
  { id: 'veil', label: 'TOUT ASSOMBRIR' },
  { id: 'clock', label: 'HEURE LISIBLE' },
];

const SLIDERS: { key: keyof Hsl; label: string; max: number; unit: string; a11y: string }[] = [
  { key: 'h', label: 'TEINTE', max: 359, unit: '°', a11y: "Teinte de l'écran" },
  { key: 's', label: 'SATUR.', max: 100, unit: ' %', a11y: "Saturation de l'écran" },
  { key: 'l', label: 'LUMIN.', max: 100, unit: ' %', a11y: "Luminosité de l'écran" },
];

/**
 * Le choix de la couleur d'écran, comme sur un Pip-Boy. Chaque option est
 * affichée dans sa propre teinte : le nom d'une couleur ne dit rien, la couleur
 * si — et elle reste doublée du libellé pour qui ne la distingue pas.
 */
export function Settings({
  visible,
  onClose,
  update,
  checking,
  onCheckUpdate,
  landscapeMode,
  onLandscapeMode,
}: {
  visible: boolean;
  onClose: () => void;
  update: Release | null;
  checking: boolean;
  onCheckUpdate: () => void;
  landscapeMode: LandscapeMode;
  onLandscapeMode: (m: LandscapeMode) => void;
}) {
  const { p, t, setPalette, customColor, customHue, custom, previewCustom, commitCustom } = useTheme();
  const s = useMemo(() => makeStyles(p), [p]);

  // Les curseurs tiennent leur propre état plutôt que de relire la couleur :
  // l'aller-retour HSL → RGB → HSL arrondit, et un curseur dont la valeur
  // bouge sous le doigt saute. On repart de la couleur à chaque ouverture.
  const [hsl, setHsl] = useState<Hsl>(() => hslOf(customColor, customHue));
  const hslRef = useRef(hsl);
  const [code, setCode] = useState(customColor);
  const [codeErr, setCodeErr] = useState(false);
  const [bedsideDim, setBedsideDim] = useState<'veil' | 'clock'>('veil');
  const [city, setCity] = useState('');
  const [announce, setAnnounce] = useState(false);
  const [navAccess, setNavAccess] = useState(false);
  // Comme l'écran principal : la fenêtre n'est plus redimensionnée, c'est au
  // panneau de remonter au-dessus du clavier, sinon le champ ville reste dessous.
  const [keyboard, setKeyboard] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKeyboard(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboard(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  // La ville est le dernier champ : amener le panneau à son terme la place au-dessus
  // du clavier, une fois la marge appliquée.
  const onCityFocus = () => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
  };
  useEffect(() => {
    if (!visible) return;
    void readString(KEY_ANNOUNCE_TIME).then((v) => setAnnounce(v === '1'));
    void readString(KEY_BEDSIDE_DIM).then((v) => setBedsideDim(v === 'clock' ? 'clock' : 'veil'));
    void readString(KEY_WEATHER_CITY).then((v) => setCity(v ?? ''));
  }, [visible]);

  // L'accord se donne dans les réglages d'Android, hors de l'appli : on relit
  // l'accès à l'ouverture et à chaque retour au premier plan, panneau ouvert.
  useEffect(() => {
    if (!visible || !navAvailable()) return;
    const read = () => setNavAccess(hasNavAccess());
    read();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') read();
    });
    return () => sub.remove();
  }, [visible]);

  // Comme le code couleur : la ville s'écrit à la validation, pas à chaque
  // frappe, sinon la météo chercherait « Pa » puis « Par ».
  // Le natif garde sa propre copie : c'est lui qui parle à la sonnerie, appli
  // fermée. La clé ne sert qu'à rouvrir ce panneau sur le bon état.
  const toggleAnnounce = () => {
    const next = !announce;
    setAnnounce(next);
    setAnnounceTime(next);
    void writeString(KEY_ANNOUNCE_TIME, next ? '1' : '');
  };

  const submitCity = () => {
    const v = city.trim();
    setCity(v);
    void writeString(KEY_WEATHER_CITY, v);
  };
  useEffect(() => {
    if (!visible) return;
    const v = hslOf(customColor, customHue);
    hslRef.current = v;
    setHsl(v);
    setCode(customColor);
    setCodeErr(false);
    // Seulement à l'ouverture : pendant le réglage, c'est le panneau qui mène.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const slide = (key: keyof Hsl, value: number, commit: boolean) => {
    const next = { ...hslRef.current, [key]: Math.round(value) };
    hslRef.current = next;
    setHsl(next);
    const c = rgbHex(hslToRgb(next.h, next.s, next.l));
    setCode(c);
    setCodeErr(false);
    (commit ? commitCustom : previewCustom)(c, next.h);
  };

  // Le code s'applique à la validation, pas à chaque frappe : « #f » ou « 25 »
  // ne sont pas encore des couleurs.
  const submitCode = () => {
    const rgb = parseColor(code);
    if (!rgb) {
      setCodeErr(true);
      return;
    }
    const c = rgbHex(rgb);
    const v = hslOf(c, hslRef.current.h);
    hslRef.current = v;
    setHsl(v);
    setCode(c);
    setCodeErr(false);
    commitCustom(c, v.h);
  };

  // La couleur n'est jamais corrigée : on dit seulement quand elle se lit mal.
  // Le message garde le rouge fixe des erreurs, lisible même quand le reste du
  // panneau ne l'est plus.
  const message = codeErr
    ? 'Code non reconnu : #rrggbb, #rgb ou r,g,b (0 à 255).'
    : customContrastWarning(custom);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Toucher hors du panneau referme : sur un téléphone, c'est le geste
          attendu, et le bouton FERMER reste là pour le clavier et le web. */}
      <Pressable
        style={[s.backdrop, keyboard ? { paddingBottom: keyboard + 8 } : null]}
        onPress={onClose}
        accessibilityLabel="Fermer les réglages">
        <Pressable style={s.panel} onPress={() => {}}>
          {/* Défilant : sur un écran agrandi, le panneau dépassait la hauteur et
              FERMER comme VÉRIFIER sortaient de l'écran. */}
          <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled">
            <Text style={s.title}>── RÉGLAGES ──</Text>
            <Text style={s.label}>COULEUR D'ÉCRAN</Text>

            {[...PALETTES, custom].map((option) => {
              const current = option.id === p.id;
              return (
                <Pressable
                  key={option.id}
                  style={[s.option, { borderColor: current ? option.base : p.border }]}
                  onPress={() => setPalette(option.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: current }}
                  accessibilityLabel={option.label}>
                  <View style={[s.swatch, { backgroundColor: option.base, borderColor: option.dim }]} />
                  <Text style={[s.optionLabel, { color: option.base }]}>{option.label}</Text>
                  <Text style={[s.check, { color: option.base }]}>{current ? '✓' : ' '}</Text>
                </Pressable>
              );
            })}

            {/* Les réglages n'apparaissent que sous LIBRE : hors de ce choix ils
                ne régleraient rien de visible. L'écran se recolore pendant le
                geste, le choix s'écrit quand on lâche. */}
            {p.id === CUSTOM_PALETTE_ID ? (
              <View>
                {SLIDERS.map((def) => (
                  <View key={def.key} style={s.hueRow}>
                    <Text style={s.hueLabel}>{def.label}</Text>
                    <Slider
                      style={s.hueSlider}
                      minimumValue={0}
                      maximumValue={def.max}
                      step={1}
                      value={hsl[def.key]}
                      minimumTrackTintColor={p.dim}
                      maximumTrackTintColor={p.border}
                      thumbTintColor={p.base}
                      onValueChange={(v) => slide(def.key, v, false)}
                      onSlidingComplete={(v) => slide(def.key, v, true)}
                      accessibilityLabel={def.a11y}
                    />
                    <Text style={s.hueValue}>
                      {hsl[def.key]}
                      {def.unit}
                    </Text>
                  </View>
                ))}
                <View style={s.hueRow}>
                  <Text style={s.hueLabel}>CODE</Text>
                  <TextInput
                    style={[t.input, s.codeInput]}
                    value={code}
                    onChangeText={(v) => {
                      setCode(v);
                      setCodeErr(false);
                    }}
                    onSubmitEditing={submitCode}
                    onEndEditing={submitCode}
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    placeholder="#ff8800 ou 255,136,0"
                    placeholderTextColor={p.dim}
                    returnKeyType="done"
                    accessibilityLabel="Code couleur"
                  />
                </View>
                <Text style={t.msgErr} accessibilityLiveRegion="polite">
                  {message}
                </Text>
              </View>
            ) : null}

            <Text style={s.label}>EN PAYSAGE, AFFICHER</Text>
            {LANDSCAPE.map((option) => {
              const current = landscapeMode === option.id;
              return (
                <Pressable
                  key={option.id}
                  style={[s.option, { borderColor: current ? p.base : p.border }]}
                  onPress={() => onLandscapeMode(option.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: current }}
                  accessibilityLabel={'En paysage : ' + option.label}>
                  <Text style={[s.optionLabel, { color: current ? p.base : p.dim }]}>{option.label}</Text>
                  <Text style={[s.check, { color: p.base }]}>{current ? '✓' : ' '}</Text>
                </Pressable>
              );
            })}

            {/* L'écran vélo montre l'étape de Maps en lisant sa notification de
                navigation, ce qu'Android n'accorde que dans ses propres réglages. */}
            {navAvailable() ? (
              <View>
                <Text style={s.label}>ÉTAPES GOOGLE MAPS (VÉLO)</Text>
                <Pressable
                  style={[s.option, { borderColor: navAccess ? p.base : p.border }]}
                  onPress={openNavAccess}
                  accessibilityRole="button"
                  accessibilityLabel={
                    'Étapes Google Maps : ' + (navAccess ? 'accès accordé' : 'accès à autoriser')
                  }>
                  <Text style={[s.optionLabel, { color: navAccess ? p.base : p.dim }]}>
                    {navAccess ? 'ACCÈS ACCORDÉ' : "AUTORISER L'ACCÈS"}
                  </Text>
                  <Text style={[s.check, { color: p.base }]}>{navAccess ? '✓' : '›'}</Text>
                </Pressable>
                <Text style={s.hint}>
                  Seule la notification de navigation de Maps est lue. Si Android répond
                  « Paramètre restreint » : Infos de l'appli › menu (trois points) › Autoriser les paramètres
                  restreints, puis revenir ici.
                </Text>
              </View>
            ) : null}

            <Text style={s.label}>RÉVEIL</Text>
            {/* Le réveil vit sur l'horloge de chevet : le dire ici, sinon
                personne ne pense à tourner le téléphone. */}
            <Text style={s.hint}>Tourne le téléphone à l'horizontale.</Text>

            {/* Au bout d'une minute sans contact, l'horloge s'assombrit. */}
            <Text style={[s.hint, s.subHint]}>La nuit, après une minute sans toucher l'écran :</Text>
            {BEDSIDE_DIM.map((option) => {
              const current = bedsideDim === option.id;
              return (
                <Pressable
                  key={option.id}
                  style={[s.option, { borderColor: current ? p.base : p.border }]}
                  onPress={() => {
                    setBedsideDim(option.id);
                    void writeString(KEY_BEDSIDE_DIM, option.id);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: current }}
                  accessibilityLabel={option.label}>
                  <Text style={[s.optionLabel, { color: current ? p.base : p.dim }]}>{option.label}</Text>
                  <Text style={[s.check, { color: p.base }]}>{current ? '✓' : ' '}</Text>
                </Pressable>
              );
            })}

            <Pressable
              style={[s.option, s.announce, { borderColor: announce ? p.base : p.border }]}
              onPress={toggleAnnounce}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: announce }}
              accessibilityLabel="Annoncer l'heure au réveil">
              <Text style={[s.optionLabel, { color: announce ? p.base : p.dim }]}>ANNONCER L'HEURE</Text>
              <Text style={[s.check, { color: p.base }]}>{announce ? '✓' : ' '}</Text>
            </Pressable>

            <Text style={s.label}>MÉTÉO</Text>
            {/* Vide : pas de météo, et aucune requête. */}
            <TextInput
              style={t.input}
              value={city}
              onChangeText={setCity}
              onFocus={onCityFocus}
              onSubmitEditing={submitCity}
              onEndEditing={submitCity}
              autoCorrect={false}
              placeholder="Ville (vide = pas de météo)"
              placeholderTextColor={p.dim}
              returnKeyType="done"
              accessibilityLabel="Ville de la météo"
            />

            <Text style={s.label}>VERSION</Text>
            {/* La vérification se fait d'elle-même une fois par jour ; ce bouton
                n'existe que pour ne pas avoir à attendre le lendemain, et pour
                rendre visible ce que l'appli fait déjà en silence. */}
            <View style={s.version}>
              <Text style={s.versionText} numberOfLines={1}>
                {CURRENT_VERSION}
                {update ? '  →  ' + update.version + ' DISPONIBLE' : ''}
              </Text>
              {update ? (
                <Pressable
                  onPress={() => void Linking.openURL(update.url)}
                  accessibilityRole="link"
                  style={t.btn}>
                  <Text style={t.btnText}>VOIR</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={onCheckUpdate}
                  disabled={checking}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: checking }}
                  style={t.btn}>
                  <Text style={[t.btnText, checking && t.btnOff]}>
                    {checking ? '…' : 'VÉRIFIER'}
                  </Text>
                </Pressable>
              )}
            </View>

            <Pressable style={[t.btn, s.close]} onPress={onClose} accessibilityRole="button">
              <Text style={t.btnText}>FERMER</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.75)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    panel: {
      width: '100%',
      maxWidth: 420,
      maxHeight: '100%',
      borderWidth: 1,
      borderColor: p.base,
      backgroundColor: p.bg2,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    title: {
      color: p.base,
      fontFamily: FONT_DISPLAY,
      fontSize: 22,
      letterSpacing: 4,
      lineHeight: 26,
      textAlign: 'center',
    },
    label: {
      color: p.dim,
      fontFamily: FONT_DISPLAY,
      fontSize: 15,
      letterSpacing: 3,
      marginTop: 12,
      marginBottom: 6,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: 1,
      backgroundColor: p.bg3,
      paddingHorizontal: 10,
      paddingVertical: 8,
      marginBottom: 6,
    },
    swatch: { width: 14, height: 14, borderRadius: 7, borderWidth: 1 },
    version: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    versionText: { flex: 1, color: p.dim, fontFamily: FONT_BODY, fontSize: 12 },
    hueRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  // Largeur fixe : les trois curseurs commencent au même endroit.
  hueLabel: { color: p.dim, fontFamily: FONT_DISPLAY, fontSize: 15, letterSpacing: 2, minWidth: 58 },
  hueSlider: { flex: 1, height: 36 },
  hueValue: { color: p.dim, fontFamily: FONT_BODY, fontSize: 11, minWidth: 36, textAlign: 'right' },
  codeInput: { flex: 1, marginBottom: 0 },
  hint: { color: p.dim, fontFamily: FONT_BODY, fontSize: 12 },
  subHint: { marginTop: 8, marginBottom: 6 },
  announce: { marginTop: 6 },
    optionLabel: { flex: 1, fontFamily: FONT_DISPLAY, fontSize: 18, letterSpacing: 2, lineHeight: 22 },
    check: { fontFamily: FONT_BODY, fontSize: 14 },
    close: { alignSelf: 'flex-end', marginTop: 8 },
  });
