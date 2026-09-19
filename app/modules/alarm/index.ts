import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

type AlarmNative = {
  schedule(atMillis: number, url: string, title: string): void;
  cancel(): void;
  next(): number;
  isRinging(): boolean;
  stopRinging(): void;
  canScheduleExact(): boolean;
};

// Optionnel par construction, comme audio-boost : le module n'existe que sur
// Android, et la cible web doit continuer de tourner sans lui.
const native =
  Platform.OS === 'android' ? requireOptionalNativeModule<AlarmNative>('Alarm') : null;

export function alarmAvailable(): boolean {
  return native != null;
}

/** Pose l'alarme. `at` est un instant absolu : le calcul de l'heure reste au JS. */
export function scheduleAlarm(at: Date, url: string, title: string): void {
  native?.schedule(at.getTime(), url, title);
}

export function cancelAlarm(): void {
  native?.cancel();
}

/**
 * L'alarme armée, d'après le natif — qui fait foi : lui seul survit à la
 * fermeture de l'application.
 */
export function nextAlarm(): Date | null {
  const at = native?.next() ?? 0;
  return at > 0 ? new Date(at) : null;
}

export function isRinging(): boolean {
  return native?.isRinging() ?? false;
}

export function stopRinging(): void {
  native?.stopRinging();
}

/** Faux seulement sur Android 12 quand l'utilisateur a refusé les alarmes exactes. */
export function canScheduleExact(): boolean {
  return native?.canScheduleExact() ?? false;
}

/**
 * Le prochain passage à `hour:minute`, aujourd'hui si l'heure n'est pas
 * passée, demain sinon. Les secondes sont remises à zéro : une alarme à 7 h 00
 * posée à 7 h 00 min 30 s doit sonner demain, pas dans une demi-minute.
 */
export function nextOccurrence(hour: number, minute: number, from = new Date()): Date {
  const at = new Date(from);
  at.setHours(hour, minute, 0, 0);
  if (at.getTime() <= from.getTime()) at.setDate(at.getDate() + 1);
  return at;
}
