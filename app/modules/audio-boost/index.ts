import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

type AudioBoostNative = {
  setBoostDb(db: number): void;
  isAvailable(): boolean;
};

// Optionnel par construction : le module n'existe que sur Android, et la cible
// web comme iOS doivent continuer de tourner sans lui.
const native =
  Platform.OS === 'android' ? requireOptionalNativeModule<AudioBoostNative>('AudioBoost') : null;

/** Plafond volontaire : au-delà, on entend surtout la saturation. */
const MAX_DB = 15;

export function setBoostDb(db: number): void {
  native?.setBoostDb(Math.max(0, Math.min(MAX_DB, db)));
}

export function boostAvailable(): boolean {
  return native?.isAvailable() ?? false;
}
