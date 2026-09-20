// Pilotage de TrackPlayer (@rntp/player v5), pour le téléphone comme pour le
// navigateur — la v5 embarque une implémentation web (WebTrackPlayer, shaka),
// même si son README ne l'annonce pas.
//
// **Toute la bibliothèque visible est dans la file**, la station choisie servant
// d'index de départ. Ce n'était pas le cas avant le 20/09/2026 : on n'y mettait
// qu'une piste, « une radio n'est pas une playlist », et c'était vrai mais ruineux.
// Sans piste suivante, la notification, le casque, l'écran verrouillé et le widget
// ne pouvaient pas changer de station — media3 abandonne l'appel avant même
// d'atteindre le lecteur. Une file complète rend le zapping natif, donc disponible
// sans runtime JS. Le prix est un index à tenir en plus de la liste : c'est
// l'évènement MediaItemTransition qui s'en charge, dans usePlayback.

import TrackPlayer, { PlayerCommand, RepeatMode } from '@rntp/player';
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
  //
  // `native` : le lecteur traite lui-même play/pause, stop et le zapping, donc
  // tout répond même quand le runtime JS ne tourne plus — casque, notification,
  // écran verrouillé. C'est possible depuis que la file contient toutes les
  // stations ; avec une seule piste, Next et Previous ne faisaient rien du tout.
  TrackPlayer.setCommands({
    capabilities: [
      PlayerCommand.PlayPause,
      PlayerCommand.Stop,
      PlayerCommand.Next,
      PlayerCommand.Previous,
    ],
    handling: 'native',
  });
  // La file boucle : après la dernière station on revient à la première, comme
  // le faisait le parcours en JS. Sans ça, zapper s'arrête au bout.
  TrackPlayer.setRepeatMode(RepeatMode.All);
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
/**
 * Charge la bibliothèque dans la file, se place sur la station choisie et
 * lance la lecture.
 *
 * `queue` doit être la liste **visible**, dans l'ordre affiché : c'est elle que
 * parcourront les boutons suivant/précédent, y compris ceux de la notification
 * et du casque. Les stations masquées n'y figurent pas — la corbeille ne se
 * traverse pas en zappant.
 */
export function playStation(s: Station, master: number, queue: Station[]): void {
  ensure();
  const items = (queue.length ? queue : [s]).map((x) => ({
    mediaId: x.url,
    url: x.url,
    title: x.name,
    artist: x.group,
    // Un direct n'est ni mis en cache ni préchargé, et la notification n'affiche
    // pas de barre de progression.
    isLive: true,
  }));
  const startIndex = Math.max(0, items.findIndex((x) => x.url === s.url));
  TrackPlayer.setMediaItems(items, startIndex);
  setVolume(s, master);
  // L amplificateur touche tout le mixage de sortie : on ne l arme que pour
  // la station qui en a besoin, et on le coupe au moindre arrêt.
  setBoostDb(s.boost);
  TrackPlayer.play();
}

/** Zapper dans la file, sans la reconstruire. */
export function skipNext(): void {
  ensure();
  TrackPlayer.skipToNext();
}

export function skipPrevious(): void {
  ensure();
  TrackPlayer.skipToPrevious();
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
