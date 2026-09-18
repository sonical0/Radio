// Annuaire Radio-Browser : ~50 000 stations, sans clé d'API. Porté du site,
// règles comprises.

import { Platform } from 'react-native';

import { isHlsUrl, isSafeHttpUrl } from '../model/station';

const RB_API = 'https://all.api.radio-browser.info/json/stations/search';
const RB_LIMIT = 15;
const TIMEOUT_MS = 10000;

export type DirectoryHit = {
  name: string;
  url: string;
  hls: boolean;
  countryCode: string;
  /** Pays · codec · débit · tags, déjà assemblé pour l'affichage. */
  detail: string;
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

async function rbQuery(params: Record<string, string>): Promise<DirectoryHit[]> {
  const qs = new URLSearchParams({
    ...params,
    // On demande large puis on filtre : une bonne moitié des fiches de
    // l'annuaire est éliminée ci-dessous, et couper à RB_LIMIT côté serveur
    // laisserait souvent une poignée de résultats affichables.
    limit: String(RB_LIMIT * 4),
    hidebroken: 'true',
    order: 'clickcount',
    reverse: 'true',
  });

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let data: unknown;
  try {
    const r = await fetch(RB_API + '?' + qs, { signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    data = await r.json();
  } finally {
    clearTimeout(t);
  }
  if (!Array.isArray(data)) return [];

  return (data as RawHit[])
    .filter((s) => s && s.name && isPlayableStreamUrl(String(s.url_resolved || s.url || '')))
    .slice(0, RB_LIMIT)
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
      };
    });
}

/**
 * Cherche par nom, puis par tag quand le nom ne donne rien : « jazz » ou
 * « classique » sont des genres, pas des noms de station.
 */
export async function searchDirectory(query: string): Promise<DirectoryHit[]> {
  const q = query.trim();
  if (!q) return [];
  const byName = await rbQuery({ name: q });
  if (byName.length) return byName;
  return rbQuery({ tag: q });
}
