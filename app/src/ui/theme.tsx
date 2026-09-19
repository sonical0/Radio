// L'habillage Pip-Boy, et le choix de sa couleur.
//
// Le site n'a qu'une teinte, écrite en variables CSS. Ici les quatre écrans de
// Pip-Boy sont proposés, ce qui interdit les constantes figées : les styles se
// construisent à partir de la palette courante, servie par un contexte.
//
// Les valeurs ne sont pas choisies à l'œil. Le contraste de `dim` sur `bg3` est
// mesuré pour chacune (5,5 à 8,0 : 1), au niveau du vert d'origine, dont le CSS
// du site note « ~5.9:1, WCAG AA ».

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { setAlarmPalette } from '../../modules/alarm';
import { KEY_THEME, readString, writeString } from '../store/storage';

export type Palette = {
  id: string;
  label: string;
  base: string;
  dim: string;
  bright: string;
  bg: string;
  bg2: string;
  bg3: string;
  border: string;
  red: string;
};

export const PALETTES: Palette[] = [
  {
    id: 'vert',
    label: 'VERT',
    base: '#39ff6a',
    dim: '#24a34a',
    bright: '#7fff9a',
    bg: '#0a0f0a',
    bg2: '#0f180f',
    bg3: '#071007',
    border: '#1f4a1f',
    red: '#ff6b6b',
  },
  {
    id: 'ambre',
    label: 'AMBRE',
    base: '#ffb642',
    dim: '#b87a1f',
    bright: '#ffd48f',
    bg: '#0f0c07',
    bg2: '#191307',
    bg3: '#100b04',
    border: '#4a331f',
    red: '#ff6b6b',
  },
  {
    id: 'bleu',
    label: 'BLEU',
    base: '#41d4ff',
    dim: '#2b93b8',
    bright: '#9ae8ff',
    bg: '#070d0f',
    bg2: '#0a1519',
    bg3: '#050c10',
    border: '#1f3f4a',
    red: '#ff6b6b',
  },
  {
    id: 'blanc',
    label: 'BLANC',
    base: '#e8fff0',
    dim: '#93a89a',
    bright: '#ffffff',
    bg: '#0a0a0a',
    bg2: '#141414',
    bg3: '#070707',
    border: '#333333',
    red: '#ff6b6b',
  },
];

/** VT323 pour les titres et l'affichage, Share Tech Mono pour le texte courant. */
export const FONT_DISPLAY = 'VT323';
export const FONT_BODY = 'ShareTechMono';

export const FONTS = {
  [FONT_DISPLAY]: require('../../assets/fonts/VT323-Regular.ttf'),
  [FONT_BODY]: require('../../assets/fonts/ShareTechMono-Regular.ttf'),
};

/** Les styles partagés par tous les écrans, dérivés de la palette courante. */
export function makeShared(p: Palette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: p.bg },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: p.border,
      backgroundColor: p.bg2,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    title: {
      // Rétractable en dernier recours, mais dimensionné pour ne pas en arriver
      // là : à 30 px et 6 px d interlettrage, « FALLOUT RADIO » débordait sur un
      // téléphone de 428 points de large et s affichait « FALLOUT RAD… ».
      flexShrink: 1,
      color: p.base,
      fontFamily: FONT_DISPLAY,
      fontSize: 25,
      letterSpacing: 3,
      lineHeight: 29,
    },
    clock: { flexShrink: 0, color: p.dim, fontFamily: FONT_DISPLAY, fontSize: 20, letterSpacing: 1, lineHeight: 24 },

    sectionLabel: {
      color: p.dim,
      fontFamily: FONT_DISPLAY,
      fontSize: 18,
      letterSpacing: 3,
      textTransform: 'uppercase',
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 4,
      borderBottomWidth: 1,
      borderBottomColor: p.border,
      lineHeight: 22,
    },

    btn: {
      borderWidth: 1,
      borderColor: p.dim,
      backgroundColor: p.bg3,
      paddingVertical: 5,
      paddingHorizontal: 12,
    },
    btnText: { color: p.base, fontFamily: FONT_DISPLAY, fontSize: 17, letterSpacing: 1, lineHeight: 20 },
    btnOff: { color: p.dim, opacity: 0.55 },

    input: {
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.bg3,
      color: p.bright,
      fontFamily: FONT_BODY,
      paddingVertical: 7,
      paddingHorizontal: 9,
      fontSize: 13,
      marginBottom: 6,
    },

    msgOk: { color: p.base, fontFamily: FONT_BODY, fontSize: 12, minHeight: 16 },
    msgErr: { color: p.red, fontFamily: FONT_BODY, fontSize: 12, minHeight: 16 },
  });
}

type ThemeValue = {
  p: Palette;
  t: ReturnType<typeof makeShared>;
  setPalette: (id: string) => void;
};

const fallback = PALETTES[0];
const ThemeContext = createContext<ThemeValue>({
  p: fallback,
  t: makeShared(fallback),
  setPalette: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState(fallback.id);

  useEffect(() => {
    readString(KEY_THEME).then((saved) => {
      if (saved && PALETTES.some((x) => x.id === saved)) setId(saved);
    });
  }, []);

  const setPalette = useCallback((next: string) => {
    setId(next);
    void writeString(KEY_THEME, next);
  }, []);

  const value = useMemo(() => {
    const p = PALETTES.find((x) => x.id === id) ?? fallback;
    return { p, t: makeShared(p), setPalette };
  }, [id, setPalette]);

  // L'écran de réveil est une fenêtre native, posée alors que le runtime JS
  // dort : il ne peut pas lire ce contexte. On lui dépose les couleurs à
  // chaque changement, pour qu'il s'habille comme le reste au réveil.
  useEffect(() => {
    const p = value.p;
    setAlarmPalette(p.bg, p.bg3, p.base, p.dim);
  }, [value.p]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}
