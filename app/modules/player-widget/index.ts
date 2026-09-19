import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

export type WidgetCommand = 'next' | 'previous';

type PlayerWidgetNative = {
  setState(station: string, title: string, playing: boolean): void;
  addListener?(event: string): void;
  removeListeners?(count: number): void;
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

/**
 * Les fleches du widget arrivent ici.
 *
 * Zapper n'est pas une notion du lecteur : sa file ne contient qu'une piste,
 * et la station suivante se lit dans la bibliotheque, cote JS. Le widget
 * s'adresse donc a l'application -- ce qui suppose un runtime vivant, ce
 * qu'une lecture en cours garantit. Sans rien qui joue, il n'y a de toute
 * facon aucune station a quitter.
 */
export function onWidgetCommand(handler: (command: WidgetCommand) => void): () => void {
  const sub = (native as unknown as {
    addListener: (
      event: string,
      cb: (payload: { action?: string }) => void,
    ) => { remove: () => void };
  } | null)?.addListener('onWidgetCommand', (payload) => {
    if (payload?.action === 'next' || payload?.action === 'previous') handler(payload.action);
  });
  return () => sub?.remove();
}

export function widgetAvailable(): boolean {
  return native != null;
}
