// Persistance clé/valeur. AsyncStorage retombe sur localStorage côté web, donc
// une seule implémentation couvre les deux cibles — et les clés sont les mêmes
// que celles du site (`customStations`, `builtinStationPrefs`, `lastStationUrl`),
// pour qu'un jour on puisse relire l'un depuis l'autre sans conversion.

import AsyncStorage from '@react-native-async-storage/async-storage';

export const KEY_CUSTOM = 'customStations';
export const KEY_BUILTIN_PREFS = 'builtinStationPrefs';
export const KEY_LAST_STATION = 'lastStationUrl';
export const KEY_VOLUME = 'radioVolume';
export const KEY_THEME = 'themePalette';
/**
 * L'écran LIBRE : sa couleur exacte (#rrggbb), et sa teinte en degrés, gardée à
 * part parce qu'un gris n'en a pas — remonter la saturation repart d'elle. Le
 * site range un objet ; ici deux valeurs simples suffisent. Un réglage sans
 * couleur date d'avant la couleur exacte : voir `legacyColorFromHue`.
 */
export const KEY_THEME_HUE = 'themeCustomHue';
export const KEY_THEME_COLOR = 'themeCustomColor';
/** Dernière vérification de release : date, version vue, lien, version écartée. */
export const KEY_UPDATE = 'updateCheck';
/** Les alarmes du réveil. Le natif en tient sa propre copie, qu'on lui pousse. */
export const KEY_ALARMS = 'alarms';
/** Les titres passés, plafonnés : voir useHistory. */
export const KEY_HISTORY = 'titleHistory';
/** Le temps d'écoute par jour et par station, sur 31 jours glissants. Hors export. */
export const KEY_LISTEN_STATS = 'listenStats';
/** Tri des résultats d'annuaire, et pays épinglés du parcours. Mêmes clés que le site. */
export const KEY_RB_ORDER = 'rbOrder';
export const KEY_RB_PINNED = 'rbPinnedCountries';

/**
 * Toute lecture peut échouer (stockage plein, mode privé, données corrompues
 * d'une version précédente) et aucune ne doit empêcher l'appli de démarrer :
 * on retombe sur la valeur par défaut, exactement comme le site le fait avec
 * ses try/catch autour de localStorage.
 */
export async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw == null) return fallback;
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export async function readString(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function writeString(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {}
}
