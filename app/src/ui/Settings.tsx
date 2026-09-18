import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { FONT_BODY, FONT_DISPLAY, PALETTES, useTheme, type Palette } from './theme';

/**
 * Le choix de la couleur d'écran, comme sur un Pip-Boy. Chaque option est
 * affichée dans sa propre teinte : le nom d'une couleur ne dit rien, la couleur
 * si — et elle reste doublée du libellé pour qui ne la distingue pas.
 */
export function Settings({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { p, t, setPalette } = useTheme();
  const s = useMemo(() => makeStyles(p), [p]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Toucher hors du panneau referme : sur un téléphone, c'est le geste
          attendu, et le bouton FERMER reste là pour le clavier et le web. */}
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Fermer les réglages">
        <Pressable style={s.panel} onPress={() => {}}>
          <Text style={s.title}>── RÉGLAGES ──</Text>
          <Text style={s.label}>COULEUR D'ÉCRAN</Text>

          {PALETTES.map((option) => {
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
    optionLabel: { flex: 1, fontFamily: FONT_DISPLAY, fontSize: 18, letterSpacing: 2, lineHeight: 22 },
    check: { fontFamily: FONT_BODY, fontSize: 14 },
    close: { alignSelf: 'flex-end', marginTop: 8 },
  });
