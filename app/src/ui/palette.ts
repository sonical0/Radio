// Le calcul d'une palette Pip-Boy à partir d'une seule couleur.
//
// Séparé de `theme.tsx` parce qu'il ne dépend de rien de React Native : c'est
// de l'arithmétique de couleur, et isolée elle se vérifie sur toutes les couleurs
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


// ─── L'écran LIBRE : une couleur exacte, le reste de la palette en découle ───
// Le Pip-Boy de Fallout 4 laisse régler sa couleur, ce que les quatre écrans
// fixes ne permettent pas. Porté du site le 23/09/2026 ; passé à la couleur
// exacte avec avertissement le 04/10/2026, comme le site.

export const CUSTOM_PALETTE_ID = 'libre';
/**
 * Une teinte qu'aucun écran fixe ne propose, pour que choisir LIBRE se voie :
 * le magenta que l'ancien calcul donnait à 300°.
 */
export const CUSTOM_HUE_DEFAULT = 300;
export const CUSTOM_COLOR_DEFAULT = '#ff9eff';
/** En dessous, le texte principal devient difficile à lire (WCAG AA). */
export const CUSTOM_MIN_CONTRAST = 4.5;

export type Rgb = [number, number, number];

export function hslToRgb(h: number, sat: number, light: number): Rgb {
  const s = sat / 100;
  const l = light / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255)) as Rgb;
}

export const rgbHex = (rgb: number[]) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');

/** Teinte (null pour un gris), saturation et luminosité entières. */
export function rgbToHsl([r8, g8, b8]: Rgb): { h: number | null; s: number; l: number } {
  const r = r8 / 255;
  const g = g8 / 255;
  const b = b8 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return { h: null, s: 0, l: Math.round(l * 100) };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = Math.round(h * 60);
  return { h: (h + 360) % 360, s: Math.round(Math.min(s, 1) * 100), l: Math.round(l * 100) };
}

/** #rgb, #rrggbb (dièse facultatif), « r,g,b » ou rgb(r, g, b). Null sinon. Même grammaire que le site. */
export function parseColor(text: string): Rgb | null {
  const t = text.trim().toLowerCase();
  let m = t.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (m) {
    const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
  }
  m = t.match(/^(?:rgb\s*\()?\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*\)?$/);
  if (m) {
    const rgb = m.slice(1).map(Number) as Rgb;
    if (rgb.every((v) => v <= 255)) return rgb;
  }
  return null;
}

function luminance(rgb: number[]): number {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: number[], b: number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Monte la luminosité depuis `from` jusqu'au contraste visé sur `bg3`, sans dépasser `max`. */
function reach(h: number, sat: number, from: number, target: number, max: number, bg3: Rgb) {
  let l = from;
  let rgb = hslToRgb(h, sat, l);
  while (contrast(rgb, bg3) < target && l < max) rgb = hslToRgb(h, sat, ++l);
  return rgb;
}

/**
 * Les mêmes rôles que les quatre écrans fixes. La couleur choisie est le texte
 * principal, appliquée telle quelle : si elle manque de contraste, le panneau
 * le dit (`customContrastWarning`) mais ne la corrige pas.
 * Le reste en découle par sa teinte et sa saturation, dans la même proportion
 * pour tous les rôles : à 0 %, fonds et texte passent ensemble au gris, comme
 * l'écran BLANC. Seul `dim` garde une exigence — 5,5:1, comme partout ailleurs —
 * atteinte en montant sa luminosité, parce qu'à luminosité égale un bleu pur est
 * trois fois plus sombre à l'œil qu'un vert.
 */
export function paletteFromColor(rgb: Rgb, fallbackHue: number): Palette {
  const { h: hue, s, l } = rgbToHsl(rgb);
  const h = hue ?? fallbackHue;
  const k = s / 100;
  const bg3 = hslToRgb(h, 30 * k, 3);
  return {
    id: CUSTOM_PALETTE_ID,
    label: 'LIBRE',
    base: rgbHex(rgb),
    dim: rgbHex(reach(h, 60 * k, 25, 5.5, 70, bg3)),
    // Plus clair que le texte, sauf s'il l'est déjà plus que 94 %.
    bright: rgbHex(hslToRgb(h, s, Math.max(l, Math.min(l + 16, 94)))),
    bg: rgbHex(hslToRgb(h, 22 * k, 4.5)),
    bg2: rgbHex(hslToRgb(h, 28 * k, 7)),
    bg3: rgbHex(bg3),
    border: rgbHex(hslToRgb(h, 45 * k, 20)),
    red: '#ff6b6b',
  };
}

/** Le message à afficher sous les réglages, ou '' si la couleur se lit bien. */
export function customContrastWarning(p: Palette): string {
  const ratio = contrast(parseColor(p.base)!, parseColor(p.bg3)!);
  if (ratio >= CUSTOM_MIN_CONTRAST) return '';
  return `Contraste ${ratio.toFixed(1).replace('.', ',')}:1 sur le fond : le texte sera difficile à lire (4,5:1 conseillé).`;
}

/**
 * La couleur qu'affichait une teinte sous l'ancien calcul (luminosité montée
 * jusqu'à 11:1). Ne sert qu'à relire un réglage enregistré avant la couleur
 * exacte, pour que l'écran ne change pas à la mise à jour.
 */
export function legacyColorFromHue(h: number): string {
  return rgbHex(reach(h, 100, 50, 11, 90, hslToRgb(h, 30, 3)));
}

/**
 * Le type est vérifié avant la valeur : `Number(null)` vaut 0, et une teinte
 * absente du stockage rendait donc du rouge au lieu du défaut.
 */
export function sanitizeHue(v: unknown): number {
  const n = typeof v === 'string' ? parseInt(v, 10) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n >= 0 && n < 360 ? Math.round(n) : CUSTOM_HUE_DEFAULT;
}

/** Un `#rrggbb` en minuscules, ou null. Le stockage n'est pas une source de confiance. */
export function sanitizeColor(v: unknown): string | null {
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null;
}
