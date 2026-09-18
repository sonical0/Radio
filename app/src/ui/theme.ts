// Palette minimale, partagée par les écrans. L'habillage Pip-Boy complet
// (scanline, flicker, polices VT323) est le jalon suivant : ici, juste de quoi
// ne pas travailler dans le blanc.

import { StyleSheet } from 'react-native';

export const GREEN = '#39ff6a';
export const GREEN_BRIGHT = '#8fffb0';
export const DIM = '#1f7a3a';
export const BG = '#0a0f0a';
export const BORDER = '#14301c';
export const RED = '#ff6b6b';

export const t = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  title: { color: GREEN, fontSize: 22, letterSpacing: 4, paddingHorizontal: 16, paddingTop: 20 },
  sectionLabel: {
    color: DIM,
    fontSize: 12,
    letterSpacing: 3,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  btn: { borderWidth: 1, borderColor: DIM, paddingVertical: 6, paddingHorizontal: 12 },
  btnText: { color: GREEN, letterSpacing: 1, fontSize: 13 },
  btnOff: { color: DIM },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    color: GREEN_BRIGHT,
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 13,
    marginBottom: 6,
  },
  msgOk: { color: GREEN, fontSize: 12, minHeight: 16 },
  msgErr: { color: RED, fontSize: 12, minHeight: 16 },
});
