// Le calcul d'une palette Pip-Boy à partir d'une seule teinte.
//
// Séparé de `theme.tsx` parce qu'il ne dépend de rien de React Native : c'est
// de l'arithmétique de couleur, et isolée elle se vérifie sur les 360 teintes
// sans monter l'application. Porté du site le 23/09/2026, calcul compris.

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


// ─── L'écran LIBRE : une palette calculée depuis une seule teinte ───
// Le Pip-Boy de Fallout 4 laisse régler sa couleur, ce que les quatre écrans
// fixes ne permettent pas. Porté du site le 23/09/2026, calcul compris.

export const CUSTOM_PALETTE_ID = 'libre';
/** Une teinte qu'aucun écran fixe ne propose, pour que choisir LIBRE se voie. */
export const CUSTOM_HUE_DEFAULT = 300;

function hslToRgb(h: number, sat: number, light: number): [number, number, number] {
  const s = sat / 100;
  const l = light / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255)) as [number, number, number];
}

const rgbHex = (rgb: number[]) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');

function luminance(rgb: number[]): number {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: number[], b: number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Les mêmes rôles que les quatre écrans fixes, avec les mêmes exigences. À
 * luminosité égale, les teintes ne se valent pas : un bleu pur est trois fois
 * plus sombre à l'œil qu'un vert. On monte donc la luminosité jusqu'au contraste
 * visé plutôt que de la fixer — sans quoi un Pip-Boy bleu nuit serait illisible.
 */
export function paletteFromHue(h: number): Palette {
  const bg3 = hslToRgb(h, 30, 3);
  const reach = (sat: number, from: number, target: number, max: number) => {
    let l = from;
    let rgb = hslToRgb(h, sat, l);
    while (contrast(rgb, bg3) < target && l < max) rgb = hslToRgb(h, sat, ++l);
    return { rgb, l };
  };
  // Texte principal : les écrans fixes vont de 11,2:1 (ambre) à 19,2:1 (blanc).
  // On vise l'ambre et pas plus — chaque point gagné sur un rouge ou un bleu se
  // paie en saturation, jusqu'au pastel (mesuré : 13:1 les faisait tourner).
  const main = reach(100, 50, 11, 90);
  // Texte secondaire : 5,5:1 au moins, comme `dim` partout ailleurs.
  const dim = reach(60, 25, 5.5, 70);
  return {
    id: CUSTOM_PALETTE_ID,
    label: 'LIBRE',
    base: rgbHex(main.rgb),
    dim: rgbHex(dim.rgb),
    bright: rgbHex(hslToRgb(h, 100, Math.min(main.l + 16, 94))),
    bg: rgbHex(hslToRgb(h, 22, 4.5)),
    bg2: rgbHex(hslToRgb(h, 28, 7)),
    bg3: rgbHex(bg3),
    border: rgbHex(hslToRgb(h, 45, 20)),
    red: '#ff6b6b',
  };
}

/**
 * Le type est vérifié avant la valeur : `Number(null)` vaut 0, et une teinte
 * absente du stockage rendait donc du rouge au lieu du défaut.
 */
export function sanitizeHue(v: unknown): number {
  const n = typeof v === 'string' ? parseInt(v, 10) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n >= 0 && n < 360 ? Math.round(n) : CUSTOM_HUE_DEFAULT;
}
