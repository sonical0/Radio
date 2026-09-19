# Fallout Radio — application React Native

Portage mobile du site. Le site en HTML pur reste sur `main` et n'est pas touché : on ajoute une cible, on ne migre pas.

**Version 1.1.1** (`versionCode` 5), APK signé, installé et testé sur téléphone.

**Deux branches, pas une.** `react-native/dev` porte le travail, `react-native/main` ne reçoit que ce qui a tourné sur un appareil. Git refuse une branche `react-native` à côté de `react-native/main` — un nom ne peut pas être à la fois une référence et un dossier de références — d'où ce préfixe plutôt qu'une branche parente. Les fichiers du site présents ici sont une copie de `main` : ils s'alignent par `cherry-pick`, **jamais par `git checkout main -- index.html`**, qui écrase au lieu de reporter (fait une fois, trois fonctions perdues et mises en ligne dans cet état).

## État : parité atteinte avec le site (jalons 1 à 5)

**Jalon 1 — la lecture.** Les stations jouent, la lecture **continue quand l app passe en arrière-plan**, avec notification média et contrôles de l écran verrouillé. Le titre y vient des métadonnées **ICY lues dans le flux** par le natif. Côté web, `navigator.mediaSession` est renseigné.

**Jalon 2 — la bibliothèque.** Liste groupée, gain par station (stations livrées comprises), corbeille, ajout manuel avec résolution de flux, import/export, le tout persisté sous les mêmes clés que le site.

**Jalon 3 — le confort de lecture.** Titre en cours de **toutes** les stations (jusqu à 40 par tour, sondage suspendu quand l appli n est pas à l écran), volume maître et sourdine persistés, suivant/précédent qui sautent les masquées et répondent aussi aux boutons de la notification, dernière station re-sélectionnée au lancement sans démarrer le son, minuterie de veille avec fondu, et reconnexion sur flux coupé.

Vérifié sur émulateur, réseau réellement coupé pour l occasion : la coupure affiche « ⟳ TAMPON… », les trois tentatives de reconnexion s enchaînent, puis le lecteur renonce sur « ⚠ FLUX INTERROMPU » — la politique du site — et un appui sur lecture répare. Volume et dernière station survivent à un arrêt forcé.

Deux défauts trouvés en testant, tous deux corrigés : une station restaurée s affichait « PAUSE » alors que rien n était chargé, et surtout **lecture ne la jouait pas** — le lecteur n a de média attaché qu après un `setMediaItem`, ce que la restauration ne fait volontairement pas.

**Non vérifié :** les dialogues d import/export (feuille de partage, sélecteur de fichier), et la cible web depuis le jalon 2 — seulement sa compilation.

**Jalon 4 — l annuaire Radio-Browser.** Recherche par nom puis repli sur le tag quand le nom ne donne rien (« jazz » est un genre, pas une station), résultats triés par popularité, fiche affichant pays · codec · débit · tags, et ajout en un appui. Le pays sert de groupe par défaut : une recherche ramène des stations de dix pays, un fourre-tout unique n aiderait personne. Les flux `http://` sont écartés — contenu mixte bloqué par le navigateur côté web, trafic en clair refusé par Android depuis l API 28 : même règle, deux raisons.

Vérifié sur l émulateur de bout en bout : recherche « jazz », ajout de *Jazz 24*, la station entre dans la bibliothèque sous un groupe « US », survit à un redémarrage et joue.

**Jalon 5 — l habillage Pip-Boy, et les raccourcis clavier.** Polices VT323 et Share Tech Mono (les mêmes que le site, mais en TTF : le natif ne lit pas le woff2 des `data:` URI de la page), trame de balayage, vacillement, visualiseur 34 barres, titre défilant, horloge, pastille qui pulse pendant la lecture. Les raccourcis (espace, ← →, ↑ ↓, M, S) n existent que sur la cible web, et la légende ne s affiche que là — un téléphone n a pas de clavier.

La trame mérite un mot : le site la fait en `repeating-linear-gradient`, que React Native n a pas, et empiler six cents vues d un pixel serait absurde. On carrelle donc une tuile de 4×4 px générée dans le dépôt (73 octets), de même période. Le vacillement reprend le profil du site — huit secondes de calme, un creux bref à 0,94 : c est l irrégularité qui fait tube.

Vérifié sur les deux cibles. Deux défauts trouvés en regardant l écran : l en-tête passait sous la barre d état Android (le `SafeAreaView` de React Native ne pose des marges que sur iOS — remplacé par `react-native-safe-area-context`), et le titre défilant restait invisible, faute de largeur dans sa rangée flex, donc mesuré à zéro et masqué par son propre `overflow`.

**Jalon 6 — la couleur d'écran, et ce que le téléphone a appris.** Un bouton ⚙ à gauche de l'horloge ouvre le choix du phosphore : vert, ambre, bleu, blanc. Les quatre palettes sont définies une fois dans `src/ui/theme.tsx`, contraste mesuré en commentaire, et le choix est persisté. La fonctionnalité a plu et **a été reportée sur le site** — c'est le seul trajet app → site à ce jour, tous les autres vont dans l'autre sens.

Le reste de ce jalon vient de l'APK installé, pas de l'émulateur. Sept défauts, tous invisibles au bureau :

- **Le clavier ne levait plus l'écran.** L'affichage bord à bord d'Android 15 neutralise `adjustResize` : la fenêtre ne rétrécit plus, le champ de saisie reste sous le clavier. On réserve donc la hauteur nous-mêmes sur `keyboardDidShow`, avec un `scrollToEnd` au focus et `keyboardShouldPersistTaps`.
- **Le titre de l'en-tête se coupait** en « FALLOUT RAD… ». Corps et interlettrage réduits (25/3 pour le titre, 20/1 pour l'horloge), vérifié à 360 dp — et non en tronquant, la première tentative, qui ne faisait qu'officialiser la coupure.
- **Mojave et New Vegas restaient trop basses**, deux fois de suite : les gains avaient été mesurés sur des échantillons trop courts. Re-mesure, puis amplification native (voir plus bas).
- **Le volume maître ne sert à rien sur téléphone**, les touches matérielles font déjà ce travail : la barre disparaît sur mobile et reste sur le web.
- **Le formulaire d'ajout** se replie, comme la corbeille — repris ensuite sur le site.
- **Une recherche d'annuaire ne se refermait pas** : un bouton l'efface, sur les deux cibles.
- **L'icône de l'application** est la favicon du site, adaptative et monochrome comprises.

## Ce que l'app fait et que le site ne peut pas

Deux verrous du navigateur tombent en natif, et ils sont désormais exploités tous les deux.

**Amplifier.** `setVolume()` est borné à 1 : une station diffusée quinze décibels sous les autres ne peut pas être remontée, on ne peut qu'abaisser le reste — ce qui rend toute l'appli plus faible que le téléphone. Le module local `modules/audio-boost` attache un `LoudnessEnhancer` et ajoute le gain manquant : +11 dB sur Mojave Music Radio, +13 sur Radio New Vegas, d'après la mesure. Il s'accroche à la **session 0**, le mixage de sortie, faute de session publiée par le lecteur : tant qu'il tourne il amplifie tout ce qui sort du téléphone, d'où son armement pour la seule station concernée et son relâchement à la pause, au stop et à chaque changement. Un appareil qui refuse l'effet laisse la station faible plutôt que de casser quoi que ce soit.

**Lire les métadonnées du flux.** Presque tous les Icecast et Shoutcast intercalent leur titre dans l'audio (ICY). Le lecteur natif les lit — c'est ce qui remplit la notification — et l'interface les affiche désormais pour la station écoutée, y compris pour une webradio venue de l'annuaire qui n'a aucun endpoint. À l'ajout, l'app interroge en plus l'hôte sur `/status-json.xsl` et `/stats?json=1`.

Le second point mérite un chiffre, parce qu'il justifie à lui seul le portage : **sondées depuis un navigateur, 0 station sur 12 répondent** — tous les serveurs Icecast testés omettent l'en-tête CORS. Depuis le natif, 3 sur 7 répondent. La même sonde a donc été écrite ici et **retirée du site**, où elle n'aurait fait qu'ajouter six secondes d'attente à chaque ajout pour rien.

## Gains et champ `boost`

Les gains sont mesurés : `ffmpeg -af ebur128`, **deux passes de 180 s** par station, moyennées, vers une cible de **-18 LUFS**. Des fenêtres plus courtes ne suffisent pas — Pirate Radio mesure de -8,8 à -25,2 LUFS selon le moment, et un échantillon de 40 s avait produit un gain trois fois trop sévère.

Ce qui dépasse la cible est atténué par `gain` (≤ 1). Ce qui est plus de 6 dB en dessous porte en plus un `boost` en décibels, appliqué par l'amplificateur natif. `stations.json` de la racine porte les deux champs ; le site ignore `boost`, faute de pouvoir amplifier.

## Lancer

```bash
npm install
npm run web        # navigateur
npm run android    # appareil ou émulateur ; dev build, pas Expo Go
```

`npm run ios` demande un Mac. EAS Build permettrait de s'en passer le jour où ça compte.

## Build release (APK signé)

```bash
cd android && ./gradlew assembleRelease
```

La signature est injectée par `plugins/withReleaseSigning.js`, un plugin de configuration : `expo prebuild` régénère `android/`, donc tout réglage écrit à la main dedans disparaîtrait à la passe suivante. Le plugin lit `keystore/credentials.properties` et pousse les valeurs dans `gradle.properties`.

**Le dossier `keystore/` est hors dépôt, et doit le rester.** Il contient le trousseau et son mot de passe. Android n'accepte une mise à jour que signée par la même clé : perdre ce fichier, c'est ne plus pouvoir mettre à jour l'app installée — il faudrait la désinstaller et repartir de zéro, en perdant les stations ajoutées. À sauvegarder ailleurs que sur ce seul disque.

### Le piège Windows : 260 caractères

Le build release échoue avec `ninja: error: mkdir(...): No such file or directory` sur un chemin interminable. CMake reflète le chemin source complet dans l'arborescence de ses fichiers objets, et le seul mot `RelWithDebInfo` suffit à faire déborder la limite de Windows. Le build debug, lui, passe : son dossier s'appelle `Debug`.

**Activer `LongPathsEnabled` dans le registre ne suffit pas** — vérifié : le drapeau n'agit que sur les programmes qui se déclarent *long path aware*, et ninja ne l'est pas. La parade retenue est de compiler depuis une copie à chemin court :

```powershell
robocopy "<projet>\app" C:\RB /E /XD "<projet>\app\.git" "<projet>\app\android\build" "<projet>\app\android\.gradle" "<projet>\app\android\app\build"
cd C:\RB\android ; ./gradlew assembleRelease
```

Exclure les dossiers par **chemin absolu**. Un `/XD build` tout court emporte aussi les `node_modules/*/build`, où les modules Expo rangent leur JS compilé — la copie paraît complète et le build échoue plus loin, sans rapport apparent.

## Le réveil radio

Spécifié dans [`SPEC-reveil-radio.md`](../SPEC-reveil-radio.md), livré en cinq jalons. Tout vit dans `modules/alarm/`, un module Expo local sur le patron de `modules/audio-boost/`.

**L'alarme ne passe pas par `@rntp/player`, elle a son propre ExoPlayer.** Trois raisons, et aucune n'est une préférence : le service de `@rntp/player` refuse de démarrer depuis l'arrière-plan (`src/player/player.ts`), réveiller le runtime JS pour le piloter est exactement ce qui a tué la v4 sur la nouvelle architecture, et la v5 n'a pas de fondu d'entrée — seulement `fadeOutSeconds` pour la minuterie de veille. Le son sort sur `USAGE_ALARM`, le canal d'alarme : il ignore le mode silencieux et son volume ne suit pas celui du média. C'est ce qui distingue un réveil d'une notification.

**`setAlarmClock()`, pas `setExactAndAllowWhileIdle()`** pour poser l'échéance principale. C'est la seule API que Doze et les surcouches constructeur respectent sans condition, elle affiche l'icône de réveil dans la barre d'état, et elle accorde la fenêtre pendant laquelle démarrer un service de premier plan depuis l'arrière-plan est permis.

**Une seule entrée `AlarmManager` à la fois**, la plus proche, recalculée après chaque sonnerie et à chaque modification. Android en accepterait plusieurs, mais chacune aurait son `PendingIntent` et son occasion de diverger de la liste.

**Les minuteries du matin — report et échéance — sont aussi des `AlarmManager`**, pas des `postDelayed()`. Le service meurt pendant un report : dix minutes où rien ne justifie un processus vivant, et où Android tue volontiers ce qui traîne. Un handler mourrait avec lui.

**La liste est dupliquée dans des `SharedPreferences`.** Au redémarrage du téléphone, personne n'a monté le runtime : le natif doit pouvoir relire les alarmes seul. Le format interne d'AsyncStorage (un SQLite) n'est pas un contrat. Le JS écrit la liste entière à chaque modification ; la seule écriture du natif est l'extinction d'une alarme sans récurrence après qu'elle a sonné.

**L'écran de réveil est en Kotlin, pas en React.** À 7 h du matin l'application est morte depuis huit heures : démarrer le runtime JS avant de pouvoir afficher un bouton ARRÊTER ajoute une à deux secondes pendant lesquelles le téléphone hurle sans rien proposer. Il emprunte les couleurs de la palette, que le thème dépose dans les préférences à chaque changement.

**Le repli sonnerie est la garantie centrale**, pas une finition : dix secondes sans son, ou la première erreur du lecteur, et on bascule sur `RingtoneManager.TYPE_ALARM`. Une station morte à 7 h ne doit pas valoir un réveil raté. Conséquence assumée : sur un réseau très lent, une station qui mettrait douze secondes à démarrer sonnera en sonnerie système.

**Les déclarations de composants vivent dans le manifeste du module** (`modules/alarm/android/src/main/AndroidManifest.xml`), pas dans `app.json` ni dans `android/`. C'est ce qui les rend insensibles à `expo prebuild`, qui effacerait une déclaration écrite à la main.

**Le paysage est un écran, pas une mise en page.** `app.json` autorise la rotation, et `App.tsx` rend `Bedside` à la place du reste quand la largeur dépasse la hauteur. Les écrans existants ne sont pas rendus en paysage, donc aucun n'a à gérer une largeur qu'il n'a jamais vue.

**Ce qui n'est pas fait :** le `boost` en décibels des stations faibles ne s'applique pas au réveil. `LoudnessEnhancer` s'attache à la session 0, c'est-à-dire à tout ce qui sort du téléphone (voir la section Gains) — acceptable le temps d'une écoute volontaire, douteux à 7 h du matin sur un appareil qu'on ne regarde pas. Seul le gain multiplicatif voyage avec l'alarme.

## Décisions à connaître avant de toucher aux dépendances

**Le lecteur est `@rntp/player` v5, pas `react-native-track-player` v4.** La v4 ne tourne pas sur la nouvelle architecture : elle compile (au prix de correctifs Kotlin), passe le parsing TurboModule (au prix de 37 autres), puis meurt à l'exécution sur `RuntimeException: You should not use ReactNativeHost directly in the New Architecture` — son `MusicService` repose sur `HeadlessJsTaskService`, qui n'existe plus. Ce n'est pas rattrapable par un patch, c'est le mécanisme même du service de lecture. Ne pas y revenir.

**La v5 supporte le web, contrairement à ce que son README laisse croire.** Le paquet embarque `WebTrackPlayer`, `MediaSessionController`, `SleepTimerController`, et déclare `shaka-player >= 4.12.0` en peer dependency — qu'il faut installer à la main, sinon le bundle web échoue sur `Unable to resolve "shaka-player/dist/shaka-player.ui"`. Un seul lecteur couvre donc le téléphone et le navigateur, et le lecteur web séparé qu'on envisageait est inutile.

**Licence :** la v5 est gratuite pour un usage personnel ou éducatif ; un usage commercial demande une licence (rntp.dev/pricing). Ce projet est perso, donc c'est bon — mais c'est à re-vérifier si le projet change de nature.

**API synchrone.** La v5 passe par JSI : `setupPlayer()`, `play()`, `setVolume()` ne renvoient pas de promesse. `useIsPlaying()` renvoie un booléen, pas un objet. Les commandes distantes se règlent par `setCommands()`, à part de `setupPlayer()`, et `handling: 'native'` fait répondre la notification et l'écran verrouillé même quand le runtime JS ne tourne plus — c'est précisément ce qu'on est venu chercher.

**`src/data/stations.json` est une copie de `stations.json` de la racine.** Metro ne sort pas de `app/`, et un lien symbolique ne survit ni à Windows ni à la synchro. **Celui de la racine fait foi** : c'est lui que sert le site, et c'est là que les gains ont été mesurés. La copie se recopie à la main après toute modification — les deux fichiers sont identiques, `git diff` entre branches le vérifie en une commande.

## Build Android : les obstacles d'environnement, tous documentés ici

Aucun ne se corrige dans le dépôt, et tous se reposeront à l'identique sur un autre poste Windows.

**CMake 3.30.5 est requis** (RN 0.86 le demande explicitement). Avec seulement la 3.22.1 installée, AGP retombe dessus sans un mot. À installer via le SDK Manager d'Android Studio, ou en ligne de commande :

```bash
sdkmanager "cmake;3.30.5"
```

**L'installer ne suffit pas : il faut la désigner.** Les deux versions cohabitent dans le SDK, et AGP prend la 3.22.1 — sa valeur par défaut — tant que rien ne dit le contraire. Le symptôme n'est pas un message sur CMake mais une bordée d'erreurs de lien au moment de `:app:buildCMakeRelWithDebInfo`, du type `ld.lld: error: undefined symbol: vtable for std::bad_variant_access`, et la ligne qui trahit la cause est enterrée dans la commande ninja affichée après coup (`Sdk\cmake\3.22.1\bin\ninja.exe`). Le réglage va dans `local.properties`, à côté de `sdk.dir` :

```
sdk.dir=C:/AndroidSdk
cmake.dir=C:/AndroidSdk/cmake/3.30.5
```

Purger `android/app/.cxx` après coup : la configuration précédente y est mise en cache, et un simple relancement reprendrait la 3.22.1.

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

**`expo prebuild` régénère `android/` et efface `local.properties`** : le fichier est à réécrire — ses **deux** lignes — après chaque prebuild, sinon le build repart droit dans l'erreur libc++ ou dans celle du lien. Vérifié le 19/09/2026 en montant la version à 1.2.0 : un prebuild est obligatoire pour que `app.json` atteigne `android/app/build.gradle` — sans lui l'APK sort avec l'ancien `versionName` sans que rien ne prévienne — et il a coûté les deux échecs ci-dessus à la suite.

## HLS, et le visualiseur

HLS est géré nativement par ExoPlayer et AVPlayer : `vendor/hls.light.min.js` n'a pas d'équivalent ici, et sur le web la bibliothèque passe par shaka.

Le visualiseur reste décoratif, ici comme sur le site — 34 barres animées, pas une FFT. Le natif permettrait une vraie analyse du signal, là où `createMediaElementSource()` coupe le son de ces flux sans CORS sur le web (constaté le 14/09, noté « ne pas retenter ») ; personne n'en a eu besoin jusqu'ici.

## Accessibilité

Le site expose de vrais `<button aria-pressed>` dans une liste sémantique, au prix d'une passe dédiée en septembre. `Pressable` ne rend qu'un `<div>` muet par défaut : chaque élément interactif porte donc `accessibilityRole` et `accessibilityState` explicites. Vérifié sur l'arbre d'accessibilité du build web — les lignes de station sortent en `button "Galaxy News Radio, FO3"`. À ne pas laisser filer en ajoutant des écrans.
