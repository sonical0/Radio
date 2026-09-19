import { useMemo } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Station } from '../model/station';
import { CURRENT_VERSION, type Release } from '../net/updates';
import { AlarmSetup } from './AlarmSetup';
import { FONT_BODY, FONT_DISPLAY, PALETTES, useTheme, type Palette } from './theme';

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
  station,
}: {
  visible: boolean;
  onClose: () => void;
  update: Release | null;
  checking: boolean;
  onCheckUpdate: () => void;
  station: Station | null;
}) {
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

          <AlarmSetup station={station} />

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
    optionLabel: { flex: 1, fontFamily: FONT_DISPLAY, fontSize: 18, letterSpacing: 2, lineHeight: 22 },
    check: { fontFamily: FONT_BODY, fontSize: 14 },
    close: { alignSelf: 'flex-end', marginTop: 8 },
  });
