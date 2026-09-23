// Analyse des playlists M3U et PLS.
//
// Ce qu'exportent VLC, Winamp, foobar2000, cliamp — et Radio-Browser lui-même :
// une liste d'adresses de flux, avec un nom par entrée. De quoi faire venir d'un
// coup les stations d'un autre lecteur, en plus de la sauvegarde JSON.
//
// Porté du site le 23/09/2026. Les analyseurs sont volontairement purs : ils ne
// touchent ni au réseau ni au stockage, c'est ce qui les rend vérifiables.

import { DEFAULT_GROUP } from '../model/station';

/** Au-delà, c'est une liste IPTV entière, pas une bibliothèque de radios. */
export const PLAYLIST_MAX_ENTRIES = 200;
export const PLAYLIST_NAME_MAX = 120;

export type PlaylistKind = 'm3u' | 'pls';

export type PlaylistEntry = {
  url: string;
  name: string;
  group: string;
  favicon: string;
};

const BOM = /^﻿/;

/**
 * C'est le contenu qui décide ; l'extension ne fait que départager, parce
 * qu'une M3U simple n'est qu'une liste d'adresses, qu'aucun autre indice ne
 * distingue. Une sauvegarde JSON n'emprunte jamais ce chemin.
 */
export function playlistKind(name: string, text: string): PlaylistKind | null {
  const head = text.replace(BOM, '').trimStart();
  if (/^\[playlist\]/i.test(head)) return 'pls';
  if (/^#EXT(M3U|INF)/i.test(head)) return 'm3u';
  if (/\.pls$/i.test(name)) return 'pls';
  if (/\.m3u8?$/i.test(name)) return 'm3u';
  return null;
}

/**
 * « #EXTINF:-1 tvg-logo="…" group-title="…",Nom » : la durée, des attributs
 * entre guillemets, puis le nom après la première virgule **hors guillemets** —
 * une virgule dans un attribut ne coupe pas le nom.
 */
export function parseExtinf(line: string): { name: string; group: string; logo: string } {
  const body = line.slice(line.indexOf(':') + 1);
  let quoted = false;
  let comma = -1;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '"') quoted = !quoted;
    else if (body[i] === ',' && !quoted) {
      comma = i;
      break;
    }
  }
  const attrsPart = comma < 0 ? body : body.slice(0, comma);
  const attrs: Record<string, string> = {};
  for (const m of attrsPart.matchAll(/([\w-]+)="([^"]*)"/g)) attrs[m[1].toLowerCase()] = m[2];
  return {
    name: comma < 0 ? '' : body.slice(comma + 1).trim(),
    group: attrs['group-title'] || '',
    logo: attrs['tvg-logo'] || '',
  };
}

export function parseM3U(text: string): PlaylistEntry[] {
  const entries: PlaylistEntry[] = [];
  let pending: { name: string; group: string; logo: string } | null = null;
  let extgrp = '';
  for (const raw of text.replace(BOM, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^#EXTINF:/i.test(line)) {
      pending = parseExtinf(line);
      continue;
    }
    // VLC range le groupe sur sa propre ligne.
    if (/^#EXTGRP:/i.test(line)) {
      extgrp = line.slice(8).trim();
      continue;
    }
    if (line.startsWith('#')) continue;
    entries.push({
      url: line,
      name: pending?.name || '',
      group: pending?.group || extgrp,
      favicon: pending?.logo || '',
    });
    pending = null;
  }
  return entries;
}

/** `FileN` / `TitleN`, rapprochés **par numéro** : l'ordre des lignes n'est pas garanti. */
export function parsePLS(text: string): PlaylistEntry[] {
  const byN = new Map<number, PlaylistEntry>();
  for (const raw of text.replace(BOM, '').split(/\r?\n/)) {
    const m = raw.trim().match(/^(File|Title)(\d+)=(.*)$/i);
    if (!m) continue;
    const n = Number(m[2]);
    if (!byN.has(n)) byN.set(n, { url: '', name: '', group: '', favicon: '' });
    const e = byN.get(n)!;
    if (m[1].toLowerCase() === 'file') e.url = m[3].trim();
    else e.name = m[3].trim();
  }
  return [...byN.entries()]
    .sort((a, b) => a[0] - b[0])
    .map((e) => e[1])
    .filter((e) => e.url);
}

export function parsePlaylist(kind: PlaylistKind, text: string): PlaylistEntry[] {
  return kind === 'pls' ? parsePLS(text) : parseM3U(text);
}

/** Sans nom dans la playlist, l'hôte du flux vaut mieux qu'une adresse entière. */
export function fallbackStationName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * « Mes radios.m3u » → « Mes radios » : un lot importé reste regroupé, et
 * retrouvable sous le nom qu'on lui avait donné.
 */
export function groupFromFileName(name: string): string {
  const base = String(name || '')
    .replace(/\.[^.]+$/, '')
    .trim()
    .slice(0, 24);
  return base || DEFAULT_GROUP;
}

/**
 * Un master HLS commence lui aussi par `#EXTM3U`, mais c'est un flux découpé en
 * segments, pas une liste de stations : l'importer créerait des « stations » de
 * dix secondes.
 */
export function isHlsManifest(kind: PlaylistKind, text: string): boolean {
  return kind === 'm3u' && /#EXT-X-/i.test(text);
}

/** Une entrée qui est elle-même une playlist doit être résolue avant d'entrer. */
export function isNestedPlaylist(url: string): boolean {
  return /\.(pls|m3u)(\?|#|$)/i.test(url);
}
