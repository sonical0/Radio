// Pilotage de TrackPlayer (@rntp/player v5), pour le téléphone comme pour le
// navigateur — la v5 embarque une implémentation web (WebTrackPlayer, shaka),
// même si son README ne l'annonce pas.
//
// Une seule piste dans la file à la fois : une radio n'est pas une playlist, et
// garder la file à une entrée évite de gérer des index en plus de ceux de la
// liste de stations.

import TrackPlayer, { PlayerCommand } from '@rntp/player';
import { setBoostDb } from '../../modules/audio-boost';
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
  // Next/Previous sont exposées : la notification permet de zapper de station
  // sans revenir dans l'appli, et le natif relaie l'appui via un évènement.
  TrackPlayer.setCommands({
    capabilities: [
      PlayerCommand.PlayPause,
      PlayerCommand.Stop,
      PlayerCommand.Next,
      PlayerCommand.Previous,
    ],
    handling: 'native',
  });
  ready = true;
}

/**
 * Toute opération passe par là. Les effets de usePlayback se déclenchent avant
 * celui qui configure le lecteur (les hooks appelés en premier posent leurs
 * effets en premier), et la v5 refuse tout appel avant setupPlayer() — sur le
 * web elle lève, ce que le natif laissait passer en silence. Plutôt que de
 * dépendre d un ordre de montage, chaque fonction s assure elle-même.
 */
function ensure(): void {
  if (!ready) setupPlayer();
}
/** Charge une station et lance la lecture. */
export function playStation(s: Station, master: number): void {
  ensure();
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
  // L amplificateur touche tout le mixage de sortie : on ne l arme que pour
  // la station qui en a besoin, et on le coupe au moindre arrêt.
  setBoostDb(s.boost);
  TrackPlayer.play();
}

/**
 * Gain par station, même règle que sur le site : volume maître × gain, borné à
 * [0, 1]. Une station trop forte est baissée, jamais l'inverse — on ne peut pas
 * amplifier au-delà du maximum.
 */
export function setVolume(s: Station | null, master: number): void {
  ensure();
  const g = s ? s.gain : 1;
  TrackPlayer.setVolume(Math.max(0, Math.min(1, master * g)));
}

export function togglePlay(playing: boolean, boost = 0): void {
  ensure();
  if (playing) {
    // En pause, plus rien ne sort d ici : garder l amplificateur armé
    // reviendrait à pousser le son des autres applications.
    setBoostDb(0);
    TrackPlayer.pause();
    return;
  }
  setBoostDb(boost);
  TrackPlayer.play();
}

export function stop(): void {
  ensure();
  setBoostDb(0);
  TrackPlayer.stop();
  TrackPlayer.clear();
}

/**
 * Relance le flux après une coupure. Sur le site, il fallait réattacher la
 * source à la main et compter les tentatives ; ici le natif sait reprendre, on
 * ne garde que la politique (combien de fois, à quel rythme), dans usePlayback.
 */
export function retry(): void {
  ensure();
  TrackPlayer.retry();
}

// ─── Minuterie de veille ───
// Les paliers du site, en minutes. 0 = éteinte.
export const SLEEP_STEPS_MIN = [0, 15, 30, 60, 90];
const FADE_OUT_SECONDS = 20;

/** Arme la minuterie, ou l'annule si `minutes` vaut 0. */
export function setSleepTimer(minutes: number): void {
  ensure();
  if (!minutes) {
    TrackPlayer.cancelSleepTimer();
    return;
  }
  // Le fondu est natif : il n'y a plus à interpoler le volume nous-mêmes, et
  // surtout plus à réparer le volume laissé bas quand l'utilisateur annule en
  // plein fondu — cancelSleepTimer() le restaure.
  TrackPlayer.sleepAfterTime(minutes * 60, { fadeOutSeconds: FADE_OUT_SECONDS });
}

export function sleepRemainingSeconds(): number | null {
  const t = TrackPlayer.getSleepTimer();
  return t && t.type === 'time' ? t.remainingSeconds : null;
}
