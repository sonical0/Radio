import { useEffect, useMemo, useRef, useState } from 'react';
import Slider from '@react-native-community/slider';
import { Linking, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { CURRENT_VERSION, type Release } from '../net/updates';
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
}: {
  visible: boolean;
  onClose: () => void;
  update: Release | null;
  checking: boolean;
  onCheckUpdate: () => void;
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
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Fermer les réglages">
        <Pressable style={s.panel} onPress={() => {}}>
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

          <Text style={s.label}>RÉVEIL</Text>
          {/* Le réveil vit sur l'horloge de chevet : le dire ici, sinon
              personne ne pense à tourner le téléphone. */}
          <Text style={s.hint}>Tourne le téléphone à l'horizontale.</Text>

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
    optionLabel: { flex: 1, fontFamily: FONT_DISPLAY, fontSize: 18, letterSpacing: 2, lineHeight: 22 },
    check: { fontFamily: FONT_BODY, fontSize: 14 },
    close: { alignSelf: 'flex-end', marginTop: 8 },
  });
