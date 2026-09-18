// Modèle de station, porté depuis index.html (site web, branche main).
//
// Les deux implémentations partagent volontairement les mêmes règles : mêmes
// noms de champs, même ordre de précédence pour les métadonnées, mêmes anciens
// noms tolérés en lecture (`game` → `group`, `apiId` → `meta`). Un export JSON
// fait depuis le site doit pouvoir être relu ici sans conversion.

export const API_BASE = 'https://stations.fallout.radio/api/nowplaying/';
export const DEFAULT_GROUP = 'DIVERS';
export const GAIN_MIN = 0.1;

export type MetaType = 'azuracast' | 'icecast';
export type MetaSource = { type: MetaType; url: string };

/** Forme interne, identique à celle du site. */
export type Station = {
  group: string;
  name: string;
  url: string;
  hls: boolean;
  meta: MetaSource | null;
  gain: number;
  hidden: boolean;
  isCustom: boolean;
};

/** Ce qui entre : stations.json, un export, le localStorage d'un navigateur. */
export type RawStation = {
  group?: unknown;
  game?: unknown;
  name?: unknown;
  url?: unknown;
  hls?: unknown;
  meta?: unknown;
  apiId?: unknown;
  gain?: unknown;
  hidden?: unknown;
};

export function isValidStation(s: unknown): s is RawStation {
  const r = s as RawStation;
  return (
    !!r &&
    typeof r.name === 'string' &&
    r.name.trim().length > 0 &&
    typeof r.url === 'string' &&
    r.url.startsWith('http')
  );
}

export function stationGroup(s: RawStation): string {
  const g = s.group ?? s.game ?? '';
  return (typeof g === 'string' && g.trim()) || DEFAULT_GROUP;
}

/** Regroupement insensible à la casse : « Jazz » et « JAZZ » = une seule section. */
export function groupKey(g: string): string {
  return g.trim().toLocaleUpperCase();
}

export function isHlsUrl(url: string): boolean {
  return /\.m3u8(\?|#|$)/i.test(url);
}

/**
 * Un gain absent, non numérique ou hors plage revient à 1. Côté web, un NaN
 * rendait `audio.volume` invalide et coupait la lecture ; ici il partirait dans
 * TrackPlayer.setVolume(), qui ne s'en remettrait pas mieux.
 */
export function sanitizeGain(g: unknown): number {
  return typeof g === 'number' && isFinite(g) && g >= GAIN_MIN && g <= 1 ? g : 1;
}

export function isSafeHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return ['http:', 'https:'].includes(u.protocol) && !isPrivateHost(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Garde SSRF reprise du site. Sur mobile elle protège moins l'utilisateur que
 * son réseau local : une station importée pointant sur 192.168.x.y ferait du
 * téléphone un scanner du LAN sur lequel il est connecté.
 */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (h === '0.0.0.0' || h === '::1' || h === '[::1]') return true;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  if (a === 10 || a === 127) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // link-local, dont 169.254.169.254
  return false;
}

/**
 * Une URL AzuraCast a toujours la forme https://<hôte>/listen/<shortcode>/<mount>,
 * et /api/nowplaying/<shortcode> accepte le shortcode comme l'id numérique. Coller
 * une telle URL suffit donc à obtenir le titre en cours, sans rien configurer.
 */
export function detectMeta(url: string): MetaSource | null {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/^\/listen\/([^/]+)\//);
    if (m) {
      return {
        type: 'azuracast',
        url: u.origin + '/api/nowplaying/' + decodeURIComponent(m[1]),
      };
    }
  } catch {}
  return null;
}

/** Précédence : `meta` explicite → `apiId` hérité → déduction depuis l'URL. */
export function normalizeMeta(s: RawStation, url: string): MetaSource | null {
  const m = s.meta as MetaSource | undefined;
  if (m && typeof m === 'object' && typeof m.url === 'string' && isSafeHttpUrl(m.url)) {
    return { type: m.type === 'icecast' ? 'icecast' : 'azuracast', url: m.url };
  }
  if (s.apiId) return { type: 'azuracast', url: API_BASE + String(s.apiId) };
  return detectMeta(url);
}

/** Porte d'entrée unique du modèle — rien n'entre dans la liste sans passer ici. */
export function normalizeStation(s: RawStation, isCustom: boolean): Station {
  const url = String(s.url).trim();
  return {
    group: stationGroup(s),
    name: String(s.name).trim(),
    url,
    hls: s.hls === true || isHlsUrl(url),
    meta: normalizeMeta(s, url),
    gain: sanitizeGain(s.gain),
    hidden: s.hidden === true,
    isCustom,
  };
}
