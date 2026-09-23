// Pochette : le favicon de la fiche Radio-Browser.
//
// Un flux n'a pas de pochette ; la station, souvent, a une image. Porté du site
// le 23/09/2026, avec sa règle : beaucoup de ces favicons sont des .ico de
// 16 px ou des liens morts, on ne remplace donc l'icône de l'application que
// par une image qui se charge vraiment et reste lisible en grand.

import { Image, Platform } from 'react-native';

import type { Station } from '../model/station';

const ARTWORK_MIN_PX = 64;
const PROBE_TIMEOUT_MS = 8000;

export type Artwork = { src: string; size: number };

/**
 * Par URL d'image : l'entrée validée, `null` si refusée, une promesse tant que
 * le sondage court. Jamais persisté — un favicon peut changer ou mourir, le
 * prochain lancement le redemandera.
 */
const cache = new Map<string, Artwork | null | Promise<Artwork | null>>();

/**
 * Sur le web, une image `http:` dans une page `https:` est du contenu mixte ;
 * sur Android, le trafic en clair est refusé depuis l'API 28. Même correction
 * dans les deux cas — on tente l'https, que la plupart des hôtes servent aussi —
 * mais sur mobile elle vaut toujours, faute de page qui puisse être en clair.
 */
export function artworkCandidate(url: string): string {
  if (!url.startsWith('http:')) return url;
  if (Platform.OS !== 'web') return 'https:' + url.slice(5);
  const https = typeof location !== 'undefined' && location.protocol === 'https:';
  return https ? 'https:' + url.slice(5) : url;
}

/**
 * `Image.getSize` fait ici ce que `new Image()` fait sur le site : il charge
 * l'image et rend ses dimensions, donc il valide le lien et la taille d'un seul
 * geste. Il n'a pas de délai d'expiration propre — un hôte qui ne répond jamais
 * laisserait la promesse en suspens — d'où le nôtre.
 */
export function probeArtwork(url: string): Artwork | null | Promise<Artwork | null> {
  const src = artworkCandidate(url);
  const hit = cache.get(src);
  if (hit !== undefined) return hit;
  const p = new Promise<Artwork | null>((resolve) => {
    let settled = false;
    const done = (v: Artwork | null) => {
      if (settled) return;
      settled = true;
      cache.set(src, v);
      resolve(v);
    };
    const t = setTimeout(() => done(null), PROBE_TIMEOUT_MS);
    Image.getSize(
      src,
      (w, h) => {
        clearTimeout(t);
        const size = Math.min(w, h);
        done(size >= ARTWORK_MIN_PX ? { src, size } : null);
      },
      () => {
        clearTimeout(t);
        done(null);
      },
    );
  });
  cache.set(src, p);
  return p;
}

/** La pochette de la station si elle est déjà validée, null sinon. */
export function stationArtwork(s: Station | null | undefined): Artwork | null {
  if (!s?.favicon) return null;
  const v = cache.get(artworkCandidate(s.favicon));
  return v && !(v instanceof Promise) ? v : null;
}

/**
 * Sondage lancé en même temps que le son, jamais avant : un hôte lent ne doit
 * pas se glisser entre l'appui et la musique. `onReady` n'est rappelé que si
 * l'image est bonne, pour que l'appelant rafraîchisse ce qui l'affiche.
 */
export function loadArtwork(s: Station | null | undefined, onReady: (a: Artwork) => void): void {
  if (!s?.favicon) return;
  const v = probeArtwork(s.favicon);
  if (!(v instanceof Promise)) {
    if (v) onReady(v);
    return;
  }
  void v.then((a) => {
    if (a) onReady(a);
  });
}
