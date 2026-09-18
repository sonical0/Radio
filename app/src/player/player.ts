// Pilotage de TrackPlayer (@rntp/player v5), pour le téléphone comme pour le
// navigateur — la v5 embarque une implémentation web (WebTrackPlayer, shaka),
// même si son README ne l'annonce pas.
//
// Une seule piste dans la file à la fois : une radio n'est pas une playlist, et
// garder la file à une entrée évite de gérer des index en plus de ceux de la
// liste de stations.

import TrackPlayer, { PlayerCommand } from '@rntp/player';
import type { Station } from '../model/station';

let ready = false;

/**
 * À n'appeler qu'une fois, et sur Android seulement quand l'appli est au premier
 * plan — le service de lecture ne peut pas démarrer en arrière-plan. L'appel est
 * donc idempotent et fait au montage de l'écran.
 *
 * Les commandes distantes sont traitées en 'native' : la notification, l'écran
 * verrouillé et les touches du casque répondent même quand le runtime JS ne
 * tourne plus, ce qui est précisément ce qu'on est venu chercher.
 */
export function setupPlayer(): void {
  if (ready) return;
  TrackPlayer.setupPlayer({
    contentType: 'music',
    handleAudioBecomingNoisy: true,
    // Les flux Icecast/AzuraCast portent leurs titres en ICY : le natif les lit
    // sans requête HTTP. Le sondage /api/nowplaying reste le chemin principal,
    // les deux se complètent (l'un donne la pochette, l'autre l'instantané).
    autoUpdateMetadataFromStream: true,
    android: { wakeMode: 'network' },
  });
  // Les commandes distantes se configurent à part de setupPlayer en v5.
  TrackPlayer.setCommands({
    capabilities: [PlayerCommand.PlayPause, PlayerCommand.Stop],
    handling: 'native',
  });
  ready = true;
}

/** Charge une station et lance la lecture. */
export function playStation(s: Station, master: number): void {
  TrackPlayer.setMediaItem({
    mediaId: s.url,
    url: s.url,
    title: s.name,
    artist: s.group,
    // Un direct n'est ni mis en cache ni préchargé, et la notification n'affiche
    // pas de barre de progression.
    isLive: true,
  });
  setVolume(s, master);
  TrackPlayer.play();
}

/**
 * Gain par station, même règle que sur le site : volume maître × gain, borné à
 * [0, 1]. Une station trop forte est baissée, jamais l'inverse — on ne peut pas
 * amplifier au-delà du maximum.
 */
export function setVolume(s: Station | null, master: number): void {
  const g = s ? s.gain : 1;
  TrackPlayer.setVolume(Math.max(0, Math.min(1, master * g)));
}

export function togglePlay(playing: boolean): void {
  if (playing) TrackPlayer.pause();
  else TrackPlayer.play();
}

export function stop(): void {
  TrackPlayer.stop();
  TrackPlayer.clear();
}
