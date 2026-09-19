// La bibliothèque de stations : ce que le site tient dans son tableau `stations`
// plus les deux stockages qui l'accompagnent. Les règles sont reprises telles
// quelles, y compris les raisons qui les ont fait choisir.

import rawStations from '../data/stations.json';
import {
  isValidStation,
  normalizeStation,
  sanitizeGain,
  type RawStation,
  type Station,
} from '../model/station';
import {
  KEY_BUILTIN_PREFS,
  KEY_CUSTOM,
  readJson,
  writeJson,
} from './storage';

/** Ce qui est écrit dans le stockage et dans un export : jamais `isCustom`. */
export function serializeStation(s: Station) {
  const out: Record<string, unknown> = {
    group: s.group,
    name: s.name,
    url: s.url,
    hls: s.hls,
    meta: s.meta,
    gain: s.gain,
    ...(s.boost ? { boost: s.boost } : {}),
  };
  // Seulement quand il est vrai : un export ne contient que des stations
  // visibles, autant ne pas y traîner un `hidden: false` sur chaque entrée.
  if (s.hidden) out.hidden = true;
  return out;
}

type BuiltinPref = { gain?: number; hidden?: boolean };

/** Gains d'origine, relevés avant toute retouche. */
let builtinDefaultGain = new Map<string, number>();

function builtins(): Station[] {
  const list = (rawStations as unknown[])
    .filter(isValidStation)
    .map((s) => normalizeStation(s, false));
  builtinDefaultGain = new Map(list.map((s) => [s.url, s.gain]));
  return list;
}

/**
 * stations.json reste la référence et n'est jamais réécrit : ce que
 * l'utilisateur change dessus (gain, masquage) vit à côté, indexé par URL de
 * flux — la seule clé stable, l'ordre du fichier pouvant changer d'une version
 * à l'autre.
 */
async function loadBuiltinPrefs(): Promise<Map<string, BuiltinPref>> {
  const parsed = await readJson<Record<string, BuiltinPref>>(KEY_BUILTIN_PREFS, {});
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return new Map();
  // Map et non l'objet brut : les clés viennent du stockage et l'une d'elles
  // pourrait s'appeler « __proto__ », qu'un accès par index résoudrait sur
  // Object.prototype.
  return new Map(Object.entries(parsed).filter(([, v]) => v && typeof v === 'object'));
}

/**
 * N'écrit que les écarts au fichier : une station revenue à son gain d'origine
 * disparaît du stockage au lieu d'y figer une valeur, donc une future
 * modification de stations.json reste visible pour qui n'y avait pas touché.
 */
export async function saveBuiltinPrefs(stations: Station[]): Promise<void> {
  const out: Record<string, BuiltinPref> = {};
  for (const s of stations) {
    if (s.isCustom) continue;
    const p: BuiltinPref = {};
    if (s.gain !== (builtinDefaultGain.get(s.url) ?? 1)) p.gain = s.gain;
    if (s.hidden) p.hidden = true;
    if (Object.keys(p).length) out[s.url] = p;
  }
  await writeJson(KEY_BUILTIN_PREFS, out);
}

export async function saveCustomStations(stations: Station[]): Promise<void> {
  await writeJson(KEY_CUSTOM, stations.filter((s) => s.isCustom).map(serializeStation));
}

/** Une station custom et une station livrée ne se persistent pas au même endroit. */
export async function persist(stations: Station[], station: Station): Promise<void> {
  if (station.isCustom) await saveCustomStations(stations);
  else await saveBuiltinPrefs(stations);
}

/** Construit la liste complète : livrées (retouchées) puis custom. */
export async function loadLibrary(): Promise<Station[]> {
  const list = builtins();
  const prefs = await loadBuiltinPrefs();
  for (const s of list) {
    const p = prefs.get(s.url);
    if (!p) continue;
    if (p.gain !== undefined) s.gain = sanitizeGain(p.gain);
    if (p.hidden === true) s.hidden = true;
  }
  const custom = await readJson<RawStation[]>(KEY_CUSTOM, []);
  const customList = Array.isArray(custom)
    ? custom.filter(isValidStation).map((s) => normalizeStation(s, true))
    : [];
  return [...list, ...customList];
}

/**
 * Regroupement par `group`, insensible à la casse : « Jazz » et « JAZZ » saisis
 * à deux moments différents tombent dans la même section au lieu d'en créer
 * deux. L'orthographe conservée est celle de la première station rencontrée.
 */
export function groupStations(stations: Station[]): { title: string; data: Station[] }[] {
  const groups = new Map<string, { title: string; data: Station[] }>();
  for (const s of stations) {
    if (s.hidden) continue;
    const key = s.group.trim().toLocaleUpperCase();
    if (!groups.has(key)) groups.set(key, { title: s.group, data: [] });
    groups.get(key)!.data.push(s);
  }
  return [...groups.values()];
}

/** Les groupes déjà utilisés, proposés à la saisie pour éviter les doublons. */
export function knownGroups(stations: Station[]): string[] {
  const seen = new Map<string, string>();
  for (const s of stations) {
    const key = s.group.trim().toLocaleUpperCase();
    if (!seen.has(key)) seen.set(key, s.group);
  }
  return [...seen.values()];
}
