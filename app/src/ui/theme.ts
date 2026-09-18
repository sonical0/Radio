// L'habillage Pip-Boy. Les valeurs viennent des variables CSS du site, reprises
// telles quelles : ce sont des couleurs choisies pour tenir le contraste WCAG AA
// sur le fond sombre, pas des teintes approchées.

import { StyleSheet } from 'react-native';

export const GREEN = '#39ff6a';
export const GREEN_DIM = '#24a34a'; // ~5,9:1 sur BG3 — AA texte normal
export const GREEN_BRIGHT = '#7fff9a';
export const BG = '#0a0f0a';
export const BG2 = '#0f180f';
export const BG3 = '#071007';
export const BORDER = '#1f4a1f';
export const RED = '#ff6b6b';

// Anciens noms, gardés le temps que tous les écrans passent au thème complet.
export const DIM = GREEN_DIM;

/** VT323 pour les titres et l'affichage, Share Tech Mono pour le texte courant. */
export const FONT_DISPLAY = 'VT323';
export const FONT_BODY = 'ShareTechMono';

export const FONTS = {
  [FONT_DISPLAY]: require('../../assets/fonts/VT323-Regular.ttf'),
  [FONT_BODY]: require('../../assets/fonts/ShareTechMono-Regular.ttf'),
};

export const t = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor: BG2,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  title: {
    color: GREEN,
    fontFamily: FONT_DISPLAY,
    fontSize: 30,
    letterSpacing: 6,
    // VT323 a un interligne serré : sans hauteur explicite, Android rogne les
    // jambages sur Android comme sur le web.
    lineHeight: 34,
  },
  clock: { color: GREEN_DIM, fontFamily: FONT_DISPLAY, fontSize: 24, letterSpacing: 2, lineHeight: 28 },

  sectionLabel: {
    color: GREEN_DIM,
    fontFamily: FONT_DISPLAY,
    fontSize: 18,
    letterSpacing: 3,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    lineHeight: 22,
  },

  btn: {
    borderWidth: 1,
    borderColor: GREEN_DIM,
    backgroundColor: BG3,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  btnText: { color: GREEN, fontFamily: FONT_DISPLAY, fontSize: 17, letterSpacing: 1, lineHeight: 20 },
  btnOff: { color: GREEN_DIM, opacity: 0.55 },

  input: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: BG3,
    color: GREEN_BRIGHT,
    fontFamily: FONT_BODY,
    paddingVertical: 7,
    paddingHorizontal: 9,
    fontSize: 13,
    marginBottom: 6,
  },

  msgOk: { color: GREEN, fontFamily: FONT_BODY, fontSize: 12, minHeight: 16 },
  msgErr: { color: RED, fontFamily: FONT_BODY, fontSize: 12, minHeight: 16 },
});
