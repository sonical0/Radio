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

import TrackPlayer, { type BrowseCategory, PlayerCommand, RepeatMode } from '@rntp/player';
import { Platform } from 'react-native';
import { setBoostDb } from '../../modules/audio-boost';
import { groupKey, type Station } from '../model/station';

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

/**
 * Pose la pochette sur une piste de la file, sans interrompre la lecture.
 *
 * Elle n'est posée que sur la station écoutée, et seulement une fois l'image
 * validée : la file contient toute la bibliothèque, et sonder chaque favicon
 * ferait contacter l'hôte de chaque station sans qu'on l'écoute. La station
 * retrouve son index par `mediaId`, l'URL du flux — l'index de la file peut
 * avoir bougé depuis le sondage.
 */
export function setStationArtwork(url: string, artworkUrl: string): void {
  ensure();
  const i = TrackPlayer.getQueue().findIndex((x) => x.mediaId === url);
  if (i < 0) return;
  TrackPlayer.updateMetadata(i, { artworkUrl });
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

// ─── Minuterie de veille ───
// Les paliers du site, en minutes. 0 = éteinte.
export const SLEEP_STEPS_MIN = [0, 15, 30, 60, 90];
// Exporté : la luminosité de l'écran suit le même fondu (usePlayback).
export const FADE_OUT_SECONDS = 20;

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

// ─── Android Auto ───
// Le service de lecture de @rntp/player est un MediaLibraryService media3 : il
// répond lui-même à onGetLibraryRoot / onGetChildren à partir d'un arbre que JS
// lui confie par setBrowseTree(). L'arbre est écrit dans les SharedPreferences
// du lecteur, il survit donc à l'arrêt du runtime JS — la voiture peut parcourir
// les stations et en lancer une sans que l'appli ait été ouverte.

/** Préfixe des dossiers : un mediaId de groupe ne doit jamais valoir une URL de flux. */
const GROUP_ID_PREFIX = 'group:';
// Le dernier arbre envoyé, sérialisé : la bibliothèque change d'identité à
// chaque réglage de gain, et rien de ce que la voiture affiche n'a bougé.
let lastBrowseTree = '';

/**
 * Publie les stations **visibles** pour Android Auto : racine → un dossier par
 * groupe (même regroupement insensible à la casse que la liste) → stations.
 *
 * Choisir une station dans la voiture charge les stations de son dossier dans
 * la file, sans passer par JS : suivant/précédent parcourent alors ce groupe.
 * Le `mediaId` reste l'URL du flux, comme dans playStation() — c'est ce que lit
 * l'écouteur MediaItemTransition de usePlayback pour retrouver la station.
 */
export function publishBrowseTree(stations: Station[]): void {
  // Sur le web, setBrowseTree ne fait qu'avertir ; l'iPhone demanderait
  // CarPlay, ses droits et sa scène, hors du périmètre de l'appli.
  if (Platform.OS !== 'android') return;
  const groups = new Map<string, BrowseCategory>();
  for (const s of stations) {
    if (s.hidden) continue;
    const key = groupKey(s.group);
    let cat = groups.get(key);
    if (!cat) {
      // Le libellé du premier venu, comme la section de la liste ; la casse
      // saisie survit, la voiture n'a pas de text-transform.
      cat = { mediaId: GROUP_ID_PREFIX + key, title: s.group, items: [] };
      groups.set(key, cat);
    }
    // Pas de pochette : la poser ferait contacter l'hôte de chaque favicon par
    // la voiture, ce que setStationArtwork() évite justement côté file.
    cat.items.push({ mediaId: s.url, url: s.url, title: s.name, artist: s.group, isLive: true });
  }
  const tree = [...groups.values()];
  const serialized = JSON.stringify(tree);
  if (serialized === lastBrowseTree) return;
  lastBrowseTree = serialized;
  TrackPlayer.setBrowseTree(tree);
}
