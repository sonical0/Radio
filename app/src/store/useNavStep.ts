// L'étape de navigation de Google Maps, pour l'écran vélo : la notification de
// Maps relevée par le natif (modules/nav), poussée ici à chaque changement.
//
// Pas de minuterie : le natif prévient quand l'étape change, et on ne relit
// l'étape qu'au montage et au retour au premier plan, au cas où une
// notification serait passée pendant que l'appli dormait.

import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { currentStep, navAvailable, onStep, type NavStep } from '../../modules/nav';

export type { NavStep };

/** Ce que l'écran vélo affiche d'une étape, déjà démêlé. */
export type StepView = {
  /**
   * En très gros, à la place de l'heure : la distance jusqu'au virage si la
   * notification la donne, sinon ce qui reste du trajet (« 1,2 km »). `null`
   * s'il n'y a ni l'une ni l'autre : l'heure garde alors sa place.
   */
  distance: string | null;
  /** « Tourner à droite sur Rue X » : la ligne sous la distance. */
  maneuver: string | null;
  /** L'heure d'arrivée, « 17:04 », tirée de `sub` ; `null` si rien n'y ressemble. */
  arrival: string | null;
  /** La flèche, prête pour `<Image source={{ uri }}>`. */
  icon: string | null;
  /** Pour le lecteur d'écran : « Dans 300 mètres, tourner à droite sur Rue X ». */
  label: string;
};

function two(n: number): string {
  return String(n).padStart(2, '0');
}

function clean(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
}

/** Une étape sans aucun texte ne dit rien : autant ne rien afficher. */
function usable(step: NavStep | null | undefined): NavStep | null {
  if (!step) return null;
  return clean(step.title) || clean(step.text) || clean(step.sub) || clean(step.chip) ? step : null;
}

/** « 300 m » se lit « 300 mètres » ; « 1,2 km », « 1,2 kilomètres ». */
function spokenDistance(d: string): string {
  return d
    .replace(/(\d)\s*km\b/i, '$1 kilomètres')
    .replace(/(\d)\s*m\b/i, '$1 mètres');
}

/** « 300 m », « 1,2 km », « Dans 300 m », « 0.2 mi » : un champ qui n'est qu'une distance. */
const DISTANCE = /^((dans|in)\s+)?\d+([.,]\d+)?\s*(m|km|ft|mi|yd)$/i;

/**
 * « 60 m · Tourner à droite sur Rue X » : la distance du virage en tête du
 * titre, puis un séparateur (·, •, |, -, –, virgule), comme Maps l'écrit en
 * roulant. L'unité doit être suivie du séparateur : « Route 66 » n'est pas
 * une distance.
 */
const LEADING_DISTANCE = /^(\d+(?:[.,]\d+)?\s*(?:m|km|ft|mi|yd))\s*[·•|\-–,]\s*(.+)$/i;

/** Les mètres restants, comme Maps les écrit : « 850 m », « 1,2 km », « 12 km ». */
function formatMeters(m: number): string {
  if (m < 1000) return Math.max(10, Math.round(m / 10) * 10) + ' m';
  // 9 950 et plus s'arrondit à 10,0 : autant écrire 10 km.
  if (m < 9950) return (m / 1000).toFixed(1).replace('.', ',') + ' km';
  return Math.round(m / 1000) + ' km';
}

/**
 * L'heure seule, en 24 h, dans « Arrivée à 17:04 », « Arrive 5:04 PM GMT+1 »
 * ou « 17 h 04 ». Le reste de la phrase dépend de la langue du téléphone : on
 * ne l'affiche jamais, et rien plutôt qu'un texte brut si l'heure manque.
 */
function arrivalTime(sub: string): string | null {
  const m = /(\d{1,2})\s*(?::|h)\s*(\d{2})(?:\s*([ap])\.?\s*m\b\.?)?/i.exec(sub);
  if (!m) return null;
  let h = Number(m[1]);
  const ampm = m[3]?.toLowerCase();
  if (ampm) h = (h % 12) + (ampm === 'p' ? 12 : 0);
  if (h > 23) return null;
  return two(h) + ':' + m[2];
}

/**
 * Le seul endroit qui sait ce que Maps met dans chaque champ de sa
 * notification. Relevé sur Android 16 (T16) : la manœuvre et la rue dans
 * `title`, `text` vide, l'heure d'arrivée dans `sub`, la pastille `chip`
 * vide, et aucune distance jusqu'au virage — seulement les mètres restants
 * du trajet entier (`remaining`, qui peut remonter après un détour).
 *
 * La grosse valeur, dans l'ordre : une vraie distance de virage si un champ
 * n'est que cela (anciens gabarits, ou la pastille) ou si elle ouvre le titre
 * (« 60 m · … », en roulant) ; sinon le reste du trajet ; sinon rien, et
 * l'heure garde sa place.
 */
export function describeStep(step: NavStep): StepView {
  const title = clean(step.title);
  const text = clean(step.text);
  const sub = clean(step.sub);
  const chip = clean(step.chip);
  const lead = LEADING_DISTANCE.exec(title);
  const turn = [chip, title, text].find((f) => DISTANCE.test(f)) ?? lead?.[1] ?? null;
  const left =
    typeof step.remaining === 'number' && Number.isFinite(step.remaining) && step.remaining > 0
      ? formatMeters(step.remaining)
      : null;
  const distance = turn ?? left;
  // La distance en tête du titre est déjà en grand : la répéter devant la
  // manœuvre (« 60 M · TURN RIGHT… ») ne ferait que lui prendre la place.
  const sameTurn =
    lead && turn ? lead[1].replace(/\s+/g, '').toLowerCase() === turn.replace(/\s+/g, '').toLowerCase() : false;
  const shown = sameTurn && lead ? lead[2] : title;
  const maneuver = [shown, text].find((f) => f && f !== turn) || null;
  const arrival = arrivalTime(sub);
  // Le natif l'envoie nu ; un préfixe `data:` déjà là est gardé tel quel, et
  // les sauts de ligne (Base64.DEFAULT d'Android en met tous les 76
  // caractères) sont retirés, une URI ne les tolère pas.
  const raw = typeof step.icon === 'string' ? step.icon.replace(/\s+/g, '') : '';
  const icon = !raw ? null : raw.startsWith('data:') ? raw : 'data:image/png;base64,' + raw;

  const said = turn
    ? /^(dans|in)\b/i.test(turn)
      ? spokenDistance(turn)
      : 'Dans ' + spokenDistance(turn)
    : '';
  const what = maneuver ? (said ? maneuver.charAt(0).toLowerCase() + maneuver.slice(1) : maneuver) : '';
  // Le reste du trajet n'est pas la distance du virage : il se dit après,
  // pour ne pas laisser croire qu'on tourne dans 1,2 kilomètre.
  const label = [
    said && what ? said + ', ' + what : said || what,
    !turn && left ? 'reste ' + spokenDistance(left) + ' de trajet' : '',
    arrival ? 'arrivée à ' + arrival : '',
  ]
    .filter(Boolean)
    .join(', ');
  return { distance, maneuver, arrival, icon, label };
}

/**
 * L'étape en cours d'une navigation Google Maps, ou `null` : pas de
 * navigation, pas d'accès aux notifications, pas de module natif (web, iOS).
 */
export function useNavStep(): NavStep | null {
  const [step, setStep] = useState<NavStep | null>(null);

  useEffect(() => {
    // Sans module natif (web, iOS), rien à écouter : on ne s'abonne à rien.
    // L'accès aux notifications, lui, n'est pas vérifié ici : sans lui,
    // `currentStep()` rend null, et l'accès accordé plus tard est relu au
    // retour au premier plan.
    if (!navAvailable()) return;
    let alive = true;
    const read = () => {
      if (alive) setStep(usable(currentStep()));
    };
    read();
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') read();
    });
    // `null` du natif : la navigation est finie (ou l'accès retiré), l'heure
    // revient.
    const sub = onStep((next) => {
      if (alive) setStep(usable(next));
    });
    return () => {
      alive = false;
      app.remove();
      sub?.remove();
    };
  }, []);

  return step;
}
