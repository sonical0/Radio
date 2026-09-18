// Métadonnées « en cours de lecture », portées depuis index.html.
//
// Différence de fond avec le web, et c'est l'un des arguments qui ont fait
// choisir le natif : **il n'y a pas de CORS ici**. Le site ne peut interroger
// qu'AzuraCast et Icecast, les deux seules familles qui envoient un en-tête
// permissif ; Shoutcast v2 (/stats?json=1) n'en envoie aucun et reste
// inatteignable depuis un navigateur. Sur Android et iOS, il répondra.
// Il n'est pas encore branché : le port se fait à isofonctionnalité d'abord,
// l'ouverture Shoutcast viendra quand la parité sera atteinte.

import type { MetaSource } from './station';

type AzuraSong = { title?: string; artist?: string; text?: string };
type AzuraEntry = { station?: { listen_url?: string }; now_playing?: { song?: AzuraSong } };

export function parseAzuracast(d: unknown, streamUrl: string): string | null {
  // /api/nowplaying sans identifiant renvoie toutes les stations de l'instance :
  // on retrouve la nôtre par son listen_url.
  const arr = d as AzuraEntry[] | AzuraEntry;
  const entry = Array.isArray(arr)
    ? arr.find((x) => x?.station?.listen_url === streamUrl) || arr[0]
    : arr;
  const song = entry?.now_playing?.song;
  if (!song) return null;
  return [song.title, song.artist].filter(Boolean).join(' — ') || song.text || null;
}

type IcecastSource = { listenurl?: string; title?: string; yp_currently_playing?: string };

export function parseIcecast(d: unknown, streamUrl: string): string | null {
  const src = (d as { icestats?: { source?: IcecastSource | IcecastSource[] } })?.icestats?.source;
  if (!src) return null;
  const list = Array.isArray(src) ? src : [src];
  const m = list.find((s) => s?.listenurl === streamUrl) || list[0];
  return m ? m.title || m.yp_currently_playing || null : null;
}

export async function fetchMeta(meta: MetaSource, streamUrl: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(meta.url, { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const d = await r.json();
    return meta.type === 'icecast' ? parseIcecast(d, streamUrl) : parseAzuracast(d, streamUrl);
  } catch {
    return null;
  }
}
