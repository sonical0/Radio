// Service de lecture : le code qui tourne quand l'appli n'est plus à l'écran.
// C'est la raison d'être du passage au natif — le site web, lui, s'arrête avec
// l'onglet. Enregistré dans index.ts, jamais importé par l'interface.

import TrackPlayer, { Event } from 'react-native-track-player';

export default async function playbackService(): Promise<void> {
  // Boutons de la notification, de l'écran verrouillé, du casque et de la voiture.
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());

  // Un flux de radio n'a pas de durée : avancer ou reculer n'a pas de sens, on
  // change de station. La file ne contient qu'une piste à la fois, donc ces deux
  // événements sont relayés à l'interface via un simple arrêt — la navigation
  // entre stations viendra avec la liste (jalon 2).
  TrackPlayer.addEventListener(Event.RemoteDuck, async (e) => {
    // Appel entrant, notification sonore : on se tait pendant, on reprend après.
    if (e.permanent) return TrackPlayer.stop();
    if (e.paused) return TrackPlayer.pause();
    return TrackPlayer.play();
  });
}
