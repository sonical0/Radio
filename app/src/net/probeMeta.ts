// Détection d'un endpoint de métadonnées pour une station qui n'en déclare pas.
//
// Une station venue de l'annuaire n'a rien : ni `meta`, ni URL AzuraCast que
// `detectMeta()` sache lire. On interroge donc l'hôte du flux sur les deux
// chemins standard, une seule fois, à l'ajout.
//
// **Shoutcast n'est joignable qu'en natif.** `/stats?json=1` n'envoie aucun
// en-tête CORS : le site a dû y renoncer (c'est écrit dans son CLAUDE.md), et
// c'est l'un des deux verrous que le passage au natif lève. Icecast marche des
// deux côtés quand l'opérateur a laissé l'endpoint ouvert — sur six serveurs
// publics testés à l'époque, un seul répondait.

import { isSafeHttpUrl, type MetaSource } from '../model/station';

const TIMEOUT_MS = 6000;

async function getJson(url: string): Promise<unknown | null> {
  if (!isSafeHttpUrl(url)) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Icecast : /status-json.xsl liste les sources, on cherche la nôtre. */
function icecastHasStream(data: unknown, streamUrl: string): boolean {
  const src = (data as { icestats?: { source?: unknown } })?.icestats?.source;
  if (!src) return false;
  const list = Array.isArray(src) ? src : [src];
  if (!list.length) return false;
  // Une seule source : c'est forcément elle. Plusieurs : on exige la
  // correspondance, sinon on afficherait le titre d'une autre station du même
  // serveur.
  if (list.length === 1) return true;
  return list.some((s) => (s as { listenurl?: string })?.listenurl === streamUrl);
}

/** Shoutcast v2 : /stats?json=1 renvoie directement le morceau en cours. */
function shoutcastHasTitle(data: unknown): boolean {
  const d = data as { songtitle?: unknown; streamtitle?: unknown };
  return typeof d?.songtitle === 'string' || typeof d?.streamtitle === 'string';
}

/**
 * Renvoie un descripteur utilisable par le sondage, ou null si l'hôte ne dit
 * rien. Silencieux par construction : une station sans métadonnées reste
 * parfaitement écoutable, elle affiche « ... ».
 */
export async function probeMeta(streamUrl: string): Promise<MetaSource | null> {
  let origin: string;
  try {
    origin = new URL(streamUrl).origin;
  } catch {
    return null;
  }

  const icecastUrl = origin + '/status-json.xsl';
  const icecast = await getJson(icecastUrl);
  if (icecast && icecastHasStream(icecast, streamUrl)) {
    return { type: 'icecast', url: icecastUrl };
  }

  const shoutcastUrl = origin + '/stats?json=1';
  const shoutcast = await getJson(shoutcastUrl);
  if (shoutcast && shoutcastHasTitle(shoutcast)) {
    return { type: 'shoutcast', url: shoutcastUrl };
  }

  return null;
}
