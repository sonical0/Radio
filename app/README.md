# Fallout Radio — application React Native

Portage mobile du site, sur la branche `react-native/dev`. Le site en HTML pur reste sur `main` et n'est pas touché : on ajoute une cible, on ne migre pas.

## État : jalons 1 et 2 atteints

**Jalon 1 — la lecture.** Vérifié sur émulateur Android (Pixel 8a, API 36) et dans le navigateur : les stations jouent, la lecture **continue quand l app passe en arrière-plan**, avec une notification média (`FOREGROUND_SERVICE`, `category=transport`) et les contrôles de l écran verrouillé. Le titre y vient des métadonnées **ICY lues dans le flux** par le natif. Côté web, `navigator.mediaSession` est renseigné.

**Jalon 2 — la bibliothèque.** Liste groupée par `group`, curseur de gain sur chaque ligne (stations livrées comprises), corbeille dépliable, ajout manuel, import/export, le tout persisté par AsyncStorage sous les mêmes clés que le site (`customStations`, `builtinStationPrefs`).

Vérifié geste par geste sur l émulateur, avec un arrêt forcé entre chaque pour prouver la persistance : masquer une station livrée, la retrouver dans la corbeille après redémarrage, la restaurer ; ajouter une station par son URL AzuraCast (`demo.azuracast.com`) — la résolution de flux passe, `detectMeta()` déduit l endpoint sans configuration et le titre « Ex Nihilo — Lokan » s affiche ; la jouer ; la masquer ; la supprimer définitivement depuis la corbeille, option que les stations livrées n ont pas.

**Non vérifié :** les dialogues d import/export (feuille de partage Android et sélecteur de fichier) n ont pas été exercés — automatiser ces boîtes système sur émulateur ne prouve pas grand-chose. Le code est là, il reste à l essayer à la main.

Pas encore porté, par ordre d utilité : le sondage des titres de **toutes** les stations (seule celle qu on écoute est sondée, contre 40 par tour sur le site), le volume maître et la sourdine, suivant/précédent, la dernière station mémorisée, la minuterie de veille (`sleepAfterTime` la fournit en natif), la reconnexion sur flux coupé (`retry()` et les évènements `PlaybackError`), l annuaire Radio-Browser, les raccourcis clavier, et tout l habillage Pip-Boy.

## Lancer

```bash
npm install
npm run web        # navigateur
npm run android    # appareil ou émulateur ; dev build, pas Expo Go
```

`npm run ios` demande un Mac. EAS Build permettrait de s'en passer le jour où ça compte.

## Décisions à connaître avant de toucher aux dépendances

**Le lecteur est `@rntp/player` v5, pas `react-native-track-player` v4.** La v4 ne tourne pas sur la nouvelle architecture : elle compile (au prix de correctifs Kotlin), passe le parsing TurboModule (au prix de 37 autres), puis meurt à l'exécution sur `RuntimeException: You should not use ReactNativeHost directly in the New Architecture` — son `MusicService` repose sur `HeadlessJsTaskService`, qui n'existe plus. Ce n'est pas rattrapable par un patch, c'est le mécanisme même du service de lecture. Ne pas y revenir.

**La v5 supporte le web, contrairement à ce que son README laisse croire.** Le paquet embarque `WebTrackPlayer`, `MediaSessionController`, `SleepTimerController`, et déclare `shaka-player >= 4.12.0` en peer dependency — qu'il faut installer à la main, sinon le bundle web échoue sur `Unable to resolve "shaka-player/dist/shaka-player.ui"`. Un seul lecteur couvre donc le téléphone et le navigateur, et le lecteur web séparé qu'on envisageait est inutile.

**Licence :** la v5 est gratuite pour un usage personnel ou éducatif ; un usage commercial demande une licence (rntp.dev/pricing). Ce projet est perso, donc c'est bon — mais c'est à re-vérifier si le projet change de nature.

**API synchrone.** La v5 passe par JSI : `setupPlayer()`, `play()`, `setVolume()` ne renvoient pas de promesse. `useIsPlaying()` renvoie un booléen, pas un objet. Les commandes distantes se règlent par `setCommands()`, à part de `setupPlayer()`, et `handling: 'native'` fait répondre la notification et l'écran verrouillé même quand le runtime JS ne tourne plus — c'est précisément ce qu'on est venu chercher.

**`src/data/stations.json` est une copie de `stations.json` de la racine.** Metro ne sort pas de `app/`, et un lien symbolique ne survit ni à Windows ni à la synchro. Les deux fichiers doivent être modifiés ensemble tant qu'on n'a pas décidé lequel fait foi. À trancher avant le jalon 3.

## Build Android : trois obstacles d'environnement, tous documentés ici

Aucun des trois ne se corrige dans le dépôt, et les trois se reposeront à l'identique sur un autre poste Windows.

**CMake 3.30.5 est requis** (RN 0.86 le demande explicitement). Avec seulement la 3.22.1 installée, AGP retombe dessus sans un mot. À installer via le SDK Manager d'Android Studio, ou en ligne de commande :

```bash
sdkmanager "cmake;3.30.5"
```

**Bâtir avec un JDK 17, pas le JBR d'Android Studio.** Le nouvel Android Studio embarque un JDK 25 ; AGP ne le supporte pas et l'échec est trompeur — la tâche `configureCMakeDebug` meurt sur `WARNING: A restricted method in java.lang.System has been called`, l'avertissement du JDK 25 polluant la sortie qu'AGP analyse. Gradle a déjà provisionné un Temurin 17 dans `~/.gradle/jdks/` :

```bash
JAVA_HOME="$HOME/.gradle/jdks/eclipse_adoptium-17-amd64-windows.2" ./gradlew assembleDebug
```

**Le chemin du SDK ne doit pas contenir d'espace, et c'est le piège le plus coûteux.** Le profil utilisateur de ce poste s'appelle `Alexandre SANCHEZ` ; CMake raccourcit alors le chemin du compilateur en 8.3, et `clang++.exe` devient `CLANG_~1.EXE`. Or **clang choisit son mode C ou C++ d'après le nom sous lequel on l'appelle** : sans le `++`, il lie en mode C, libc++ n'est jamais liée, et le build échoue sur des dizaines de symboles absents (`operator delete`, `std::__ndk1::basic_string`, `__cxa_throw`…) dans `:app:buildCMakeDebug` comme dans `:expo-modules-core:buildCMakeDebug`. Le NDK n'y est pour rien : lié à la main, il produit un `.so` correct.

La parade est une jonction sans espace vers le SDK, puis `android/local.properties` qui la désigne :

```bash
cmd /c 'mklink /J C:\AndroidSdk "%LOCALAPPDATA%\Android\Sdk"'
echo "sdk.dir=C:/AndroidSdk" > android/local.properties
```

**`expo prebuild` régénère `android/` et efface `local.properties`** : le fichier est à réécrire après chaque prebuild, sinon le build repart droit dans l'erreur libc++.

## Ce que le natif change par rapport au site

Deux verrous du navigateur tombent, et c'est ce qui justifie le portage :

- **Plus de CORS.** Les métadonnées Shoutcast v2 (`/stats?json=1`), inatteignables depuis une page web faute d'en-tête, deviennent lisibles. Déjà visible sur un point : les titres ICY du flux, que le natif lit sans aucune requête.
- **Le visualiseur FFT redevient possible.** Côté web, `createMediaElementSource()` coupe le son de tous ces flux cross-origin sans CORS (constaté le 14/09, noté « ne pas retenter »). La contrainte n'existe pas en natif.

Et une contrainte disparaît : HLS est géré nativement par ExoPlayer et AVPlayer. `vendor/hls.light.min.js` n'a pas d'équivalent ici — sur le web, la bibliothèque passe par shaka.

## Accessibilité

Le site expose de vrais `<button aria-pressed>` dans une liste sémantique, au prix d'une passe dédiée en septembre. `Pressable` ne rend qu'un `<div>` muet par défaut : chaque élément interactif porte donc `accessibilityRole` et `accessibilityState` explicites. Vérifié sur l'arbre d'accessibilité du build web — les lignes de station sortent en `button "Galaxy News Radio, FO3"`. À ne pas laisser filer en ajoutant des écrans.
