import { registerRootComponent } from 'expo';
import TrackPlayer from 'react-native-track-player';

import App from './App';

registerRootComponent(App);

// Le service doit être enregistré au démarrage du bundle, avant tout rendu :
// c'est lui qui reçoit les événements quand l'appli n'est plus au premier plan.
TrackPlayer.registerPlaybackService(() => require('./src/player/service').default);
