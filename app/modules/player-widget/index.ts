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
 */
export function publishWidgetState(station: string, title: string, playing: boolean): void {
  native?.setState(station, title, playing);
}

export function widgetAvailable(): boolean {
  return native != null;
}
