import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

type AlarmNative = {
  setAlarms(json: string): void;
  cancelAll(): void;
  next(): number;
  nextId(): string;
  isRinging(): boolean;
  stopRinging(): void;
  snooze(): void;
  setKeepAwake(on: boolean): void;
  setPalette(background: string, surface: string, base: string, dim: string): void;
  canScheduleExact(): boolean;
};

// Optionnel par construction, comme audio-boost : le module n'existe que sur
// Android, et la cible web doit continuer de tourner sans lui.
const native =
  Platform.OS === 'android' ? requireOptionalNativeModule<AlarmNative>('Alarm') : null;

/** Réglés une fois pour toutes : un réveil se règle à l'heure, pas en options. */
export const SNOOZE_MINUTES = 10;
export const SNOOZE_MAX = 3;
export const AUTO_STOP_MINUTES = 10;
export const GIVE_UP_MINUTES = 30;
export const RAMP_SECONDS_DEFAULT = 30;

export type Alarm = {
  id: string;
  hour: number;
  minute: number;
  /** 0 = dimanche … 6 = samedi. Vide = une seule fois. */
  days: number[];
  stationUrl: string;
  title: string;
  enabled: boolean;
  rampSeconds: number;
};

export function alarmAvailable(): boolean {
  return native != null;
}

/**
 * Pousse la liste entière vers le natif, qui recalcule ce qu'il arme. À
 * appeler après chaque modification : c'est la seule direction d'écriture, et
 * une liste complète ne peut pas diverger de ce qui est affiché.
 */
export function pushAlarms(alarms: Alarm[]): void {
  native?.setAlarms(JSON.stringify(alarms));
}

export function cancelAll(): void {
  native?.cancelAll();
}

/**
 * La prochaine sonnerie, d'après le natif — qui fait foi : lui seul survit à
 * la fermeture de l'application et au redémarrage du téléphone.
 */
export function nextAlarm(): { at: Date; id: string } | null {
  const at = native?.next() ?? 0;
  return at > 0 ? { at: new Date(at), id: native?.nextId() ?? '' } : null;
}

export function isRinging(): boolean {
  return native?.isRinging() ?? false;
}

export function stopRinging(): void {
  native?.stopRinging();
}

export function snoozeRinging(): void {
  native?.snooze();
}

/** L'horloge de chevet garde l'écran allumé ; le reste de l'appli non. */
export function setKeepAwake(on: boolean): void {
  native?.setKeepAwake(on);
}

/**
 * L'écran de réveil est natif : il ne voit pas le thème React. On lui
 * dépose les couleurs courantes pour qu'il s'habille pareil.
 */
export function setAlarmPalette(background: string, surface: string, base: string, dim: string): void {
  native?.setPalette(background, surface, base, dim);
}

/** Faux seulement sur Android 12 quand l'utilisateur a refusé les alarmes exactes. */
export function canScheduleExact(): boolean {
  return native?.canScheduleExact() ?? false;
}

const DAY_LABELS = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM'];

/**
 * « LUN-VEN », « TOUS LES JOURS », « UNE FOIS » — les formes qu'on lit sur un
 * réveil, plutôt que sept cases à déchiffrer.
 */
export function describeDays(days: number[]): string {
  if (days.length === 0) return 'UNE FOIS';
  if (days.length === 7) return 'TOUS LES JOURS';
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.join() === '1,2,3,4,5') return 'LUN-VEN';
  if (sorted.join() === '0,6') return 'WEEK-END';
  return sorted.map((d) => DAY_LABELS[d]).join(' ');
}

/** Ordre d'affichage : la semaine commence le lundi, le dimanche ferme. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const DAY_INITIALS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
