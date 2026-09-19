import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

type PlayerWidgetNative = {
  setState(station: string, title: string, playing: boolean): void;
};

const native =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<PlayerWidgetNative>('PlayerWidget')
    : null;

/**
 * Publie ce qui joue, pour que le widget ait quelque chose a dessiner.
 *
 * Une seule direction : rien ne remonte du widget vers le JS. Ses boutons
 * passent par la session media, qui repond meme application fermee — les
 * faire transiter par le runtime rendrait le widget inutile la plupart du
 * temps.
 */
export function publishWidgetState(station: string, title: string, playing: boolean): void {
  native?.setState(station, title, playing);
}

export function widgetAvailable(): boolean {
  return native != null;
}
