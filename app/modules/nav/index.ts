import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

/**
 * L'étape en cours d'une navigation Google Maps, recopiée telle quelle de sa
 * notification : le natif n'interprète rien, l'écran choisit quoi afficher.
 * Un champ absent de la notification vaut une chaîne vide.
 */
export type NavStep = {
  /** EXTRA_TITLE — la manœuvre et la rue (« Tourner à gauche sur… »), sans distance. */
  title: string;
  /** EXTRA_TEXT — vide sous Android 16 ; peut servir ailleurs. */
  text: string;
  /** EXTRA_SUB_TEXT — l'heure d'arrivée. */
  sub: string;
  /** La pastille de la barre d'état d'une Live Update (Android 16), '' si absente. */
  chip: string;
  /** Mètres restants du trajet entier (pas jusqu'au virage), null si inconnus. */
  remaining: number | null;
  /** La flèche (icône large), en PNG base64 brut, sans préfixe `data:` ; 192 px au plus. */
  icon: string | null;
};

type NavNative = {
  step(): NavStep | null;
  hasAccess(): boolean;
  openAccessSettings(): void;
  addListener(
    event: 'onStep',
    listener: (e: { step: NavStep | null }) => void,
  ): { remove(): void };
};

// Optionnel par construction : le module n'existe que sur Android, et la cible
// web comme iOS doivent continuer de tourner sans lui.
const native = Platform.OS === 'android' ? requireOptionalNativeModule<NavNative>('Nav') : null;

/** Le module natif est présent (Android). Ne dit rien de l'accès aux notifications. */
export function navAvailable(): boolean {
  return native != null;
}

/** L'utilisateur a autorisé l'accès aux notifications. Relu à chaque appel, sans cache. */
export function hasNavAccess(): boolean {
  return native?.hasAccess() ?? false;
}

/** Ouvre la page d'Android où l'on accorde l'accès aux notifications. */
export function openNavAccess(): void {
  native?.openAccessSettings();
}

/** L'étape en cours, ou null hors navigation (ou sans accès). */
export function currentStep(): NavStep | null {
  return native?.step() ?? null;
}

/**
 * Appelé à chaque changement d'étape, et avec null quand la navigation
 * s'arrête. Rend null quand le module est absent.
 */
export function onStep(cb: (step: NavStep | null) => void): { remove(): void } | null {
  if (!native) return null;
  return native.addListener('onStep', (e) => cb(e.step ?? null));
}
