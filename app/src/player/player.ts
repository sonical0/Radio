// Pilotage de TrackPlayer. Une seule piste dans la file à la fois : une radio
// n'est pas une playlist, et garder la file à une entrée évite d'avoir à gérer
// des index en plus de ceux de la liste de stations.

import TrackPlayer, {
  AndroidAudioContentType,
  AppKilledPlaybackBehavior,
  Capability,
  IOSCategory,
  IOSCategoryMode,
} from 'react-native-track-player';
import type { Station } from '../model/station';

let ready = false;

/**
 * setupPlayer() ne doit être appelé qu'une fois, et sur Android seulement quand
 * l'appli est au premier plan (le service de lecture ne peut pas démarrer en
 * arrière-plan). L'appel est donc idempotent et fait au montage de l'écran.
 */
export async function setupPlayer(): Promise<void> {
  if (ready) return;
  await TrackPlayer.setupPlayer({
    autoHandleInterruptions: true,
    androidAudioContentType: AndroidAudioContentType.Music,
    iosCategory: IOSCategory.Playback,
    iosCategoryMode: IOSCategoryMode.Default,
  });
  await TrackPlayer.updateOptions({
    android: {
      // Le flux s'arrête avec l'appli plutôt que de survivre en notification
      // fantôme : on écoute une radio, pas un livre audio qu'on reprend.
      appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
    },
    capabilities: [Capability.Play, Capability.Pause, Capability.Stop],
    compactCapabilities: [Capability.Play, Capability.Pause],
    notificationCapabilities: [Capability.Play, Capability.Pause, Capability.Stop],
    progressUpdateEventInterval: 0,
  });
  ready = true;
}

/**
 * Charge une station et lance la lecture. `isLiveStream` retire la barre de
 * progression de la notification : un direct n'a ni durée ni position.
 */
export async function playStation(s: Station, master: number): Promise<void> {
  await TrackPlayer.reset();
  await TrackPlayer.add({
    id: s.url,
    url: s.url,
    title: s.name,
    artist: s.group,
    isLiveStream: true,
  });
  await setVolume(s, master);
  await TrackPlayer.play();
}

/**
 * Le gain par station se réapplique à chaque changement, exactement comme sur le
 * site : volume maître × gain, borné à [0, 1]. Une station trop forte est
 * baissée, jamais l'inverse — on ne peut pas amplifier au-delà du maximum.
 */
export async function setVolume(s: Station | null, master: number): Promise<void> {
  const g = s ? s.gain : 1;
  await TrackPlayer.setVolume(Math.max(0, Math.min(1, master * g)));
}

export async function togglePlay(playing: boolean): Promise<void> {
  return playing ? TrackPlayer.pause() : TrackPlayer.play();
}

export async function stop(): Promise<void> {
  await TrackPlayer.stop();
  await TrackPlayer.reset();
}
