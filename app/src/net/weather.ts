// La météo de l'horloge de chevet. Open-Meteo plutôt qu'un service à clé : rien
// à configurer, rien à cacher dans l'APK, et l'API accepte le nom d'une ville
// tapé tel quel. Rien n'est envoyé d'autre que ce nom, puis ses coordonnées.

const GEOCODING_API = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_API = 'https://api.open-meteo.com/v1/forecast';
const TIMEOUT_MS = 8000;

/** La ville telle que le géocodage l'a comprise : on la garde pour ne pas la rechercher à chaque fois. */
export type Place = { name: string; latitude: number; longitude: number };

export type Weather = {
  place: Place;
  /** En degrés Celsius, l'unité par défaut d'Open-Meteo. */
  temperature: number;
  /** Le code météo WMO, et son libellé court (vide pour un code inconnu). */
  code: number;
  label: string;
};

/**
 * Les codes WMO regroupés comme on les dit à voix haute : l'horloge n'a la
 * place que pour un mot, et « bruine verglaçante modérée » n'en est pas un.
 */
export function weatherLabel(code: number): string {
  if (code === 0 || code === 1) return 'Clair';
  if (code <= 3) return 'Nuageux';
  if (code === 45 || code === 48) return 'Brouillard';
  if (code >= 51 && code <= 57) return 'Bruine';
  if (code >= 61 && code <= 67) return 'Pluie';
  if (code >= 71 && code <= 77) return 'Neige';
  if (code >= 80 && code <= 82) return 'Averses';
  if (code === 85 || code === 86) return 'Neige';
  if (code >= 95 && code <= 99) return 'Orage';
  return '';
}

/** « 12° · Nuageux » — ce que l'horloge affiche, et ce qu'on pousse au natif. */
export function weatherSummary(w: Weather): string {
  // `+ 0` : Math.round(-0,3) vaut -0, qui s'afficherait « 0 » mais se lit mal.
  const deg = String(Math.round(w.temperature) + 0) + '°';
  return w.label ? deg + ' · ' + w.label : deg;
}

async function getJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function geocode(city: string): Promise<Place | null> {
  const data = (await getJson(
    GEOCODING_API + '?name=' + encodeURIComponent(city) + '&count=1&language=fr&format=json',
  )) as { results?: { name?: string; latitude?: number; longitude?: number }[] } | null;
  const hit = data?.results?.[0];
  if (!hit || !Number.isFinite(hit.latitude) || !Number.isFinite(hit.longitude)) return null;
  return { name: String(hit.name ?? city), latitude: Number(hit.latitude), longitude: Number(hit.longitude) };
}

/**
 * Le temps qu'il fait maintenant sur `city`. `known` évite de refaire le
 * géocodage quand la ville n'a pas changé : une seule requête au lieu de deux.
 * Toute erreur — ville introuvable, réseau coupé, délai dépassé, réponse
 * inattendue — rend `null` : une horloge de chevet n'affiche pas d'erreur.
 */
export async function fetchWeather(city: string, known?: Place | null): Promise<Weather | null> {
  const place = known ?? (await geocode(city));
  if (!place) return null;
  const data = (await getJson(
    FORECAST_API +
      '?latitude=' + place.latitude +
      '&longitude=' + place.longitude +
      '&current=temperature_2m,weather_code&timezone=auto',
  )) as { current?: { temperature_2m?: number; weather_code?: number } } | null;
  const temperature = data?.current?.temperature_2m;
  const code = data?.current?.weather_code;
  if (typeof temperature !== 'number' || !Number.isFinite(temperature)) return null;
  const wmo = typeof code === 'number' && Number.isFinite(code) ? code : -1;
  return { place, temperature, code: wmo, label: weatherLabel(wmo) };
}
