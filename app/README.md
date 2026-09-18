# Fallout Radio — application React Native

Portage mobile du site, sur la branche `react-native/dev`. Le site en HTML pur reste sur `main` et n'est pas touché : on ajoute une cible, on ne migre pas.

## État : jalon 1 — le son d'abord

Ce qui marche : les 11 stations de `stations.json` se chargent, la lecture démarre, le titre en cours est récupéré (AzuraCast) et rafraîchi toutes les 30 s. L'interface est volontairement minimale — l'habillage Pip-Boy (scanline, flicker, ticker, polices VT323) est le jalon suivant, une fois la lecture validée sur appareil.

Pas encore porté : liste groupée, corbeille, gain par station réglable, annuaire Radio-Browser, minuterie de veille, import/export, stations custom.

## Lancer

```bash
npm install
npm run web        # navigateur
npm run android    # appareil ou émulateur ; nécessite un dev build, pas Expo Go
```

`npm run ios` demande un Mac. EAS Build permettrait de s'en passer le jour où ça compte.

## Décisions à connaître avant de toucher aux dépendances

**`react-native-track-player` est épinglé en 4.1.2, et ce n'est pas de la négligence.** Depuis la v5, la bibliothèque (`@rntp/player`) est sous licence commerciale : gratuite pour un usage personnel ou éducatif, payante en commercial. Surtout, la v5 n'annonce plus le web parmi ses plateformes, alors que la v4 liste explicitement « Android, iOS and Web » et reste en Apache-2.0. Comme le socle choisi est Expo + React Native Web — un seul code pour le téléphone et le navigateur — c'est la v4 qui tient la promesse. Passer en v5 signifierait renoncer au web, ou y maintenir un second lecteur.

**`shaka-player` est une dépendance du web, à installer à la main.** RNTP ne la déclare pas ; sans elle, le bundle web échoue sur `Unable to resolve "shaka-player/dist/shaka-player.ui"`. Elle ne pèse que sur la cible web.

**Nouvelle architecture activée** (RN 0.86, `newArchEnabled=true`) : RNTP v4 y passe par la couche d'interopérabilité. C'est le point à revérifier à chaque montée de version d'Expo — c'est là que ça cassera en premier.

**`src/data/stations.json` est une copie de `stations.json` de la racine.** Metro ne sort pas de `app/`, et un lien symbolique ne survit ni à Windows ni à la synchro. Les deux fichiers doivent être modifiés ensemble tant qu'on n'a pas décidé lequel fait foi. À trancher avant le jalon 3.

## Build Android : deux obstacles, un corrigé, un à installer

**Corrigé, et figé dans `patches/`.** RNTP 4.1.2 ne compile pas avec le Kotlin d'Expo 57 : `Arguments.fromBundle()` n'accepte plus de `Bundle?`, et deux appels de `MusicModule.kt` lui en passent un. Le correctif garde la sémantique d'origine — un morceau absent se résout à `null`, pas à un bundle vide — et vit dans `patches/react-native-track-player+4.1.2.patch`, réappliqué par `patch-package` au `postinstall`. **Ne pas supprimer ce script** : sans lui, un `npm install` casse le build Android en silence.

**À installer une fois sur le poste.** React Native 0.86 demande **CMake 3.30.5** ; seule la 3.22.1 était présente, et AGP retombe dessus sans rien dire. Le lien natif échoue alors sur des symboles `libc++` absents (`operator delete`, `std::__ndk1::basic_string`…), dans `:app:buildCMakeDebug` comme dans `:expo-modules-core:buildCMakeDebug`. Ça ne se corrige pas dans le dépôt : Android Studio → SDK Manager → SDK Tools → *Show Package Details* → cocher **CMake 3.30.5**. Le NDK, lui, est bon (27.1.12297006, la version attendue).

## Ce que le natif change par rapport au site

Deux verrous du navigateur tombent, et c'est ce qui justifie le portage :

- **Plus de CORS.** Les métadonnées Shoutcast v2 (`/stats?json=1`), inatteignables depuis une page web faute d'en-tête, deviennent lisibles. Pas encore branché : la parité d'abord.
- **Le visualiseur FFT redevient possible.** Côté web, `createMediaElementSource()` coupe le son de tous ces flux cross-origin sans CORS (constaté le 14/09, noté « ne pas retenter »). La contrainte n'existe pas en natif.

Et une contrainte disparaît aussi : HLS est géré nativement par ExoPlayer et AVPlayer. `vendor/hls.light.min.js` n'a pas d'équivalent ici — sur le web, RNTP passe par shaka.

## Accessibilité

Le site expose de vrais `<button aria-pressed>` dans une liste sémantique, au prix d'une passe dédiée en septembre. `Pressable` ne rend qu'un `<div>` muet par défaut : chaque élément interactif porte donc `accessibilityRole` et `accessibilityState` explicites. À ne pas laisser filer en ajoutant des écrans.
