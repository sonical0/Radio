// Annuaire Radio-Browser : ~50 000 stations, sans clé d'API. Porté du site,
// règles comprises — la recherche, puis le parcours par pays et par genre et
// le tri des résultats, portés le 23/09/2026.

import { Platform } from 'react-native';

import countriesFr from '../data/countries.fr.json';
import { isHlsUrl, isSafeHttpUrl, sanitizeFavicon, sanitizeUuid } from '../model/station';
import { rbJson } from './radioBrowser';

const RB_LIMIT = 15;
/**
 * Parcourir ramène plus large que chercher : on choisit parmi beaucoup, et la
 * liste défile. Chercher vise une station précise, quinze suffisent.
 */
export const RB_BROWSE_LIMIT = 40;
/** Les tags les plus portés. Au-delà, la queue de l'index est du bruit de saisie. */
const RB_TAG_INDEX_SIZE = 500;

/**
 * Les ordres de l'API, avec le sens qui a du sens pour chacun : les compteurs
 * du plus grand au plus petit, les noms de A à Z.
 */
export const RB_ORDERS = {
  clickcount: { label: 'plus écoutées', reverse: true },
  votes: { label: 'plus votées', reverse: true },
  clicktrend: { label: 'tendance', reverse: true },
  name: { label: 'par nom', reverse: false },
  random: { label: 'au hasard', reverse: false },
} as const;

export type RbOrder = keyof typeof RB_ORDERS;
export const RB_ORDER_IDS = Object.keys(RB_ORDERS) as RbOrder[];
export const RB_ORDER_DEFAULT: RbOrder = 'clickcount';

export function isRbOrder(v: unknown): v is RbOrder {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(RB_ORDERS, v);
}

export type DirectoryHit = {
  name: string;
  url: string;
  hls: boolean;
  countryCode: string;
  /** Pays · codec · débit · tags, déjà assemblé pour l'affichage. */
  detail: string;
  /** Fiche d'origine, gardée avec la station : compteur d'écoutes et pochette. */
  uuid: string | null;
  favicon: string | null;
};

type RawHit = {
  name?: string;
  url?: string;
  url_resolved?: string;
  country?: string;
  countrycode?: string;
  codec?: string;
  bitrate?: number;
  tags?: string;
  stationuuid?: string;
  favicon?: string;
};

/**
 * Le site écarte les flux `http://` quand la page est en `https:` — c'est du
 * contenu mixte, que le navigateur bloquerait, et la station serait ajoutée mais
 * muette. Sur mobile la raison change mais la conclusion tient : Android refuse
 * le trafic en clair par défaut depuis API 28. Une seule règle, donc, sauf en
 * développement web sur une page `http:`.
 */
export function isPlayableStreamUrl(raw: string): boolean {
  if (!isSafeHttpUrl(raw)) return false;
  if (raw.toLowerCase().startsWith('https:')) return true;
  if (Platform.OS !== 'web') return false;
  return typeof location !== 'undefined' && location.protocol !== 'https:';
}

async function rbQuery(
  params: Record<string, string>,
  order: RbOrder,
  limit: number,
): Promise<DirectoryHit[]> {
  const data = await rbJson<unknown>('/stations/search', {
    ...params,
    // On demande large puis on filtre : une bonne moitié des fiches de
    // l'annuaire est éliminée ci-dessous, et couper à `limit` côté serveur
    // laisserait souvent une poignée de résultats affichables.
    limit: String(limit * 4),
    hidebroken: 'true',
    order,
    reverse: String(RB_ORDERS[order].reverse),
  });
  if (!Array.isArray(data)) return [];

  // L annuaire liste plusieurs fois le même flux — une fiche par nom donné par
  // les contributeurs. On garde la première : deux lignes identiques n apportent
  // rien, et leurs clés se marchent dessus au rendu.
  const seen = new Set<string>();
  return (data as RawHit[])
    .filter((s) => {
      if (!s || !s.name) return false;
      const url = String(s.url_resolved || s.url || '');
      if (!isPlayableStreamUrl(url) || seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .slice(0, limit)
    .map((s) => {
      const url = String(s.url_resolved || s.url).trim();
      const detail = [
        s.country || s.countrycode,
        s.codec,
        s.bitrate ? s.bitrate + ' kbps' : null,
        isHlsUrl(url) ? 'HLS' : null,
        String(s.tags || '')
          .split(',')
          .filter(Boolean)
          .slice(0, 3)
          .join(', '),
      ]
        .filter(Boolean)
        .join(' · ');
      return {
        name: String(s.name).trim(),
        url,
        hls: isHlsUrl(url),
        countryCode: String(s.countrycode || '').toUpperCase(),
        detail,
        // Validés ici plutôt qu'à l'ajout : une fiche d'annuaire est saisie par
        // n'importe qui, et `favicon` devient une requête sortante.
        uuid: sanitizeUuid(s.stationuuid),
        favicon: sanitizeFavicon(s.favicon),
      };
    });
}

/**
 * Une interrogation de l'annuaire : une suite de tentatives essayées dans
 * l'ordre, la première qui rend quelque chose l'emporte. Chercher en a deux
 * (nom puis tag) ; parcourir n'en a qu'une.
 */
export type DirectoryQuery = {
  /** Ce qui est affiché en tête des résultats : « Norvège », « jazz »… */
  label: string;
  attempts: Record<string, string>[];
  limit: number;
};

export async function runDirectoryQuery(
  q: DirectoryQuery,
  order: RbOrder = RB_ORDER_DEFAULT,
): Promise<DirectoryHit[]> {
  for (const attempt of q.attempts) {
    const hits = await rbQuery(attempt, order, q.limit);
    if (hits.length) return hits;
  }
  return [];
}

/**
 * Cherche par nom, puis par tag quand le nom ne donne rien : « jazz » ou
 * « classique » sont des genres, pas des noms de station.
 */
export function searchQuery(query: string): DirectoryQuery {
  const q = query.trim();
  return { label: q, attempts: [{ name: q }, { tag: q }], limit: RB_LIMIT };
}

/** Toutes les stations d'un pays. Le code ISO, pas le nom : celui-ci varie. */
export function countryQuery(code: string, label: string): DirectoryQuery {
  return { label, attempts: [{ countrycode: code }], limit: RB_BROWSE_LIMIT };
}

/**
 * Les stations d'un genre. `tagExact` : « rock » ne ramène pas « classic
 * rock ». Une station qui porte les deux apparaît dans les deux.
 */
export function tagQuery(tag: string): DirectoryQuery {
  return { label: tag, attempts: [{ tag, tagExact: 'true' }], limit: RB_BROWSE_LIMIT };
}

// ─── Index de parcours : pays et genres ───
// Chercher suppose de savoir quoi taper. Les deux index sont chargés une fois
// par lancement et gardés en mémoire : deux listes figées de quelques centaines
// d'entrées, que l'annuaire ne bouge pas d'une minute à l'autre.

export type BrowseEntry = {
  /** Le code ISO pour un pays, le tag lui-même pour un genre. */
  id: string;
  label: string;
  count: number;
  /** Le libellé réduit pour la frappe : sans accent ni casse. */
  key: string;
};

/**
 * Le nom français du pays. L'API ne les donne qu'en anglais, et le site les
 * traduit avec `Intl.DisplayNames` — **qui n'existe pas sur Hermes** : mesuré
 * le 23/09/2026 sur RN 0.86, `Intl.DisplayNames` y est `undefined`, et la
 * liste s'affichait « Albania », « United Arab Emirates ». (`normalize`, lui,
 * est bien là : le filtre sans accent fonctionne.)
 *
 * La table est donc calculée une fois par Node, qui a l'ICU complet, et
 * embarquée — 279 codes, 5 Ko. `Intl.DisplayNames` reste consulté d'abord pour
 * la cible web, où il existe et suit la langue du navigateur.
 */
const FR_NAMES = countriesFr as Record<string, string>;

function countryLabel(code: string, fallback: string): string {
  try {
    const v = new Intl.DisplayNames(['fr'], { type: 'region' }).of(code);
    if (v && v !== code) return v;
  } catch {}
  return FR_NAMES[code] || fallback;
}

const COMBINING = /[̀-ͯ]/g;

/**
 * Réduit une chaîne à ce qui se tape : sans accent, sans casse — « emirats »
 * doit trouver les Émirats arabes unis. `normalize` manque sur certaines
 * versions d'Hermes, auquel cas on se contente de la casse.
 */
export function normalizeSearch(v: string): string {
  const lower = v.toLocaleLowerCase();
  try {
    return lower.normalize('NFD').replace(COMBINING, '');
  } catch {
    return lower;
  }
}

type RawCountry = { name?: string; iso_3166_1?: string; stationcount?: number };
type RawTag = { name?: string; stationcount?: number };

let countriesCache: BrowseEntry[] | null = null;
let tagsCache: BrowseEntry[] | null = null;

export async function loadCountries(): Promise<BrowseEntry[]> {
  if (countriesCache) return countriesCache;
  const data = await rbJson<unknown>('/countries', { hidebroken: 'true' });
  const list = (Array.isArray(data) ? (data as RawCountry[]) : [])
    .filter((c) => c && /^[A-Z]{2}$/.test(String(c.iso_3166_1)) && Number(c.stationcount) > 0)
    .map((c) => {
      const code = String(c.iso_3166_1);
      const label = countryLabel(code, String(c.name || code));
      return {
        id: code,
        label,
        count: Number(c.stationcount),
        key: normalizeSearch(label + ' ' + code),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  countriesCache = list;
  return list;
}

export async function loadTags(): Promise<BrowseEntry[]> {
  if (tagsCache) return tagsCache;
  const data = await rbJson<unknown>('/tags', {
    order: 'stationcount',
    reverse: 'true',
    hidebroken: 'true',
    limit: String(RB_TAG_INDEX_SIZE),
  });
  // Des tags ne diffèrent que par la casse, ou sont vides : l'index est rempli
  // par les contributeurs, pas par une taxonomie.
  const seen = new Set<string>();
  const list = (Array.isArray(data) ? (data as RawTag[]) : [])
    .filter((t) => {
      const name = String(t?.name ?? '').trim();
      const k = name.toLocaleLowerCase();
      if (!name || Number(t.stationcount) <= 0 || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((t) => {
      const name = String(t.name).trim();
      return { id: name, label: name, count: Number(t.stationcount), key: normalizeSearch(name) };
    });
  tagsCache = list;
  return list;
}
