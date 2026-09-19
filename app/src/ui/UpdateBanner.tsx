import { useMemo } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Release } from '../net/updates';
import { FONT_BODY, FONT_DISPLAY, useTheme, type Palette } from './theme';

/**
 * Une ligne sous l'en-tête, et rien de plus : pas de fenêtre modale, pas de
 * son, pas d'installation depuis l'appli — ouvrir la page de release dans le
 * navigateur évite de demander `REQUEST_INSTALL_PACKAGES`, une permission
 * lourde à justifier pour un gain d'un seul appui.
 */
export function UpdateBanner({
  update,
  onDismiss,
}: {
  update: Release | null;
  onDismiss: () => void;
}) {
  const { p } = useTheme();
  const s = useMemo(() => makeStyles(p), [p]);
  if (!update) return null;

  return (
    <View style={s.bar} accessibilityRole="summary">
      <Text style={s.label} numberOfLines={1}>
        ▲ VERSION {update.version} DISPONIBLE
      </Text>
      <Pressable
        onPress={() => void Linking.openURL(update.url)}
        accessibilityRole="link"
        accessibilityLabel={'Ouvrir la page de la version ' + update.version}
        style={s.action}>
        <Text style={s.actionText}>VOIR</Text>
      </Pressable>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Ignorer cette version"
        // La cible tactile fait 44 points malgré le peu d'encre affichée.
        hitSlop={12}
        style={s.close}>
        <Text style={s.closeText}>✕</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: p.bg3,
      borderBottomWidth: 1,
      borderBottomColor: p.border,
      paddingHorizontal: 16,
      paddingVertical: 7,
    },
    label: { flex: 1, color: p.dim, fontFamily: FONT_DISPLAY, fontSize: 16, letterSpacing: 2, lineHeight: 20 },
    action: { borderWidth: 1, borderColor: p.dim, paddingHorizontal: 10, paddingVertical: 3 },
    actionText: { color: p.base, fontFamily: FONT_DISPLAY, fontSize: 16, letterSpacing: 1, lineHeight: 19 },
    close: { paddingHorizontal: 2 },
    closeText: { color: p.dim, fontFamily: FONT_BODY, fontSize: 13 },
  });
