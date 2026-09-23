// Résolution d'une URL saisie vers un flux jouable. Porté du site sans changer
// une règle : ce sont des décisions payées par des bugs réels, notées dans le
// CHANGELOG de la racine.

import { isHlsUrl, isPrivateHost } from '../model/station';

export type Resolved = {
  url: string;
  /** Le serveur a répondu et on a pu conclure sur la nature du flux. */
  verified: boolean;
  hls?: boolean;
  /** Une entrée de playlist a été refusée par la garde d'hôte. */
  blocked?: boolean;
};

const TIMEOUT_MS = 6000;

async function fetchWithTimeout(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { Accept: 'audio/*, application/*, */*' },
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

export async function resolveStreamUrl(url: string): Promise<Resolved> {
  const lower = url.toLowerCase();
  let text: string;
  try {
    const r = await fetchWithTimeout(url);
    if (!r.ok) return { url, verified: false, hls: isHlsUrl(lower) };
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    // Les playlists se servent sous un type audio/ : `audio/x-scpls` pour une
    // PLS, `audio/x-mpegurl` pour une M3U — ou pour un HLS. Elles se lisent
    // donc avant qu'on décide. Faute de quoi une PLS passait pour un flux
    // direct (SomaFM : la station était créée muette), et toute M3U pour du
    // HLS, que le lecteur ne sait pas lire. Un flux audio réel, lui, ne se lit
    // jamais : il ne finit pas. Si un serveur en sert un sous un type de
    // playlist, le délai de six secondes coupe et l'URL est gardée telle quelle.
    const playlistType = ct.includes('scpls') || ct.includes('mpegurl');
    if (!playlistType) {
      if (isHlsUrl(lower)) return { url, verified: true, hls: true };
      if (ct.startsWith('audio/') || ct.startsWith('video/')) return { url, verified: true };
    }
    text = await r.text();
  } catch {
    // Timeout, réseau, ou CORS sur la cible web : on tente l'URL telle quelle.
    return { url, verified: false, hls: isHlsUrl(lower) };
  }

  // Un master HLS commence lui aussi par #EXTM3U : sans ce test il tombait dans
  // la branche M3U ci-dessous, qui gardait la première ligne non commentée —
  // c'est-à-dire une variante ou un segment de quelques secondes. La station
  // était créée, jouait dix secondes, puis mourait.
  if (/#EXT-X-/.test(text)) return { url, verified: true, hls: true };

  // Une entrée de playlist peut être relative à l'URL de la playlist, et elle
  // doit repasser par la même garde d'hôte que la saisie utilisateur : sinon une
  // playlist distante ferait pointer le lecteur vers un service local (SSRF).
  // Le risque est plus grand ici que sur le site : un téléphone se promène de
  // réseau en réseau, et scannerait celui auquel il est connecté.
  const resolveEntry = (raw: string): string | null => {
    let abs: URL;
    try {
      abs = new URL(raw, url);
    } catch {
      return null;
    }
    if (!['http:', 'https:'].includes(abs.protocol)) return null;
    if (isPrivateHost(abs.hostname)) return null;
    return abs.href;
  };

  if (lower.includes('.pls') || text.includes('[playlist]')) {
    const m = text.match(/^File\d+=(.+)$/im);
    if (m) {
      const entry = resolveEntry(m[1].trim());
      return entry ? { url: entry, verified: true } : { url, verified: false, blocked: true };
    }
  }

  if (lower.includes('.m3u') || text.startsWith('#EXTM3U') || text.startsWith('#EXTINF')) {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    if (lines.length) {
      const entry = resolveEntry(lines[0]);
      return entry ? { url: entry, verified: true } : { url, verified: false, blocked: true };
    }
  }

  return { url, verified: true };
}
