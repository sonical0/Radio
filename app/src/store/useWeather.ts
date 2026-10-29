// La météo de l'horloge de chevet, côté JavaScript : la ville réglée dans les
// paramètres, un résultat gardé une demi-heure, et le résumé poussé au natif.
//
// Une horloge reste allumée toute la nuit : sans cache, chaque remontée au
// premier plan et chaque passage en paysage referait deux requêtes. On n'en
// fait donc qu'une par demi-heure et par ville, et le résultat survit au
// redémarrage de l'appli.

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { setWeatherSummary } from '../../modules/alarm';
import { fetchWeather, weatherSummary, type Weather } from '../net/weather';
import { KEY_WEATHER_CITY, readJson, readString, writeJson } from './storage';

/** Le dernier résultat, avec la ville qui l'a produit. Hors export, comme les statistiques. */
const KEY_WEATHER_CACHE = 'weatherCache';

/** Une requête par demi-heure et par ville : la température ne bouge pas plus vite. */
const FRESH_MS = 30 * 60 * 1000;
/** Hors ligne, un relevé de moins de trois heures vaut mieux que rien ; au-delà, il ment. */
const STALE_MS = 3 * 60 * 60 * 1000;
/** Le rythme auquel on regarde si le cache a expiré — sans appel réseau tant qu'il est frais. */
const TICK_MS = 5 * 60 * 1000;

type Cached = { city: string; at: number; weather: Weather };

// Au niveau du module plutôt que du composant : l'horloge se démonte à chaque
// retour en portrait, le cache et le dernier essai doivent lui survivre.
let memo: Cached | null = null;
let memoLoaded = false;
let lastTry: { city: string; at: number } | null = null;
let inflight: { city: string; p: Promise<Weather | null> } | null = null;

/** La casse et les espaces ne font pas une autre ville. */
function sameCity(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

async function weatherFor(city: string): Promise<Weather | null> {
  if (!memoLoaded) {
    memo = await readJson<Cached | null>(KEY_WEATHER_CACHE, null);
    memoLoaded = true;
  }
  const now = Date.now();
  const cached = memo && sameCity(memo.city, city) ? memo : null;
  if (cached && now - cached.at < FRESH_MS) return cached.weather;
  // Un échec compte aussi : hors ligne, on ne réessaie pas à chaque tic.
  const tried = lastTry && sameCity(lastTry.city, city) && now - lastTry.at < FRESH_MS;
  if (!tried) {
    lastTry = { city, at: now };
    // La ville n'a pas changé : ses coordonnées non plus, pas besoin de
    // refaire le géocodage.
    const fresh = await fetchWeather(city, cached?.weather.place);
    if (fresh) {
      memo = { city, at: Date.now(), weather: fresh };
      void writeJson(KEY_WEATHER_CACHE, memo);
      return fresh;
    }
  }
  return cached && Date.now() - cached.at < STALE_MS ? cached.weather : null;
}

/**
 * Le résumé à afficher (« 12° · Nuageux »), ou `null` : pas de ville, pas de
 * réseau depuis trop longtemps, ville introuvable. Jamais d'erreur visible.
 */
export function useWeather(): string | null {
  const [summary, setSummary] = useState<string | null>(null);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    const city = ((await readString(KEY_WEATHER_CITY)) ?? '').trim();
    let text: string | null = null;
    // Ville vide : aucun appel réseau, et le natif efface ce qu'il avait.
    if (city) {
      // Une seule requête à la fois : le montage et le retour au premier plan
      // arrivent souvent ensemble. Une autre ville attend la sienne.
      if (!inflight || !sameCity(inflight.city, city)) {
        const p = weatherFor(city).finally(() => {
          if (inflight?.p === p) inflight = null;
        });
        inflight = { city, p };
      }
      const w = await inflight.p;
      text = w ? weatherSummary(w) : null;
    }
    if (!alive.current) return;
    setSummary(text);
    // Déposé pour l'écran de réveil et l'annonce. Sans module natif (web,
    // iOS), l'appel ne fait rien.
    setWeatherSummary(text);
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh();
    // Toute la nuit à l'écran : regarder de temps en temps si le relevé a
    // vieilli. Le cache décide s'il y a vraiment une requête.
    const id = setInterval(() => void refresh(), TICK_MS);
    // La ville se règle en portrait, dans les paramètres : la relire au retour.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh();
    });
    return () => {
      alive.current = false;
      clearInterval(id);
      sub.remove();
    };
  }, [refresh]);

  return summary;
}
