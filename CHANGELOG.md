# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Les entrées sont
datées plutôt que numérotées : le site n'a pas de version, il est déployé en continu. Seule
l'application Android en a une, taguée dans le dépôt (`v1.0.1` à `v1.3.5`) et publiée en
release.

Ordre : **entrée la plus récente en tête**. Plusieurs passes le même jour sont
suffixées `(2)`, `(3)`… la plus haute étant la plus récente (même convention que
`TANDEM_LOG.md`).

## 2026-09-23 (3) — app, jalon 7 : l'application rattrape le site

Le site a pris neuf entrées dans la journée, l'application deux. Ce jalon porte les six qui
avaient un sens sur un téléphone ; les deux autres — la passe QA et les noms de station en
entier — sont des corrections de CSS et de mise en page propres au navigateur.

### Ajouté — la fiche Radio-Browser et la pochette
- **Une station ajoutée depuis l'annuaire garde sa fiche** : `uuid` et `favicon`, validés par
  `normalizeStation()`, persistés et exportés. Jusqu'ici l'application ne gardait que le nom,
  l'URL et le pays — et le CHANGELOG du site notait qu'une sauvegarde passant par elle les
  perdait. Ce n'est plus le cas.
- **Pochette dans la notification et sur l'écran verrouillé**, posée par `updateMetadata()` sur
  la seule piste écoutée : la file contient toute la bibliothèque, et sonder chaque favicon
  ferait contacter l'hôte de chaque station sans qu'on l'écoute.
- **La même pochette dans la page**, sur une plaque de 52 px à gauche des deux lignes de
  l'en-tête. Niveaux de gris, puis la teinte d'accent en `multiply` : les clairs prennent la
  couleur de l'écran, les sombres virent au noir. `filter` et `mixBlendMode` de React Native
  0.76+ font ce que le site fait en CSS ; la plaque porte `isolation: 'isolate'`, sans quoi le
  `multiply` d'Android déborderait sur ce qu'il y a derrière.
- `Image.getSize` remplace le `new Image()` du site : il charge et rend les dimensions d'un
  seul geste, donc il valide le lien **et** le seuil de 64 px. Il n'a pas de délai propre — un
  hôte muet laisserait la promesse en suspens — d'où le nôtre, à 8 s.
- **Les écoutes sont signalées à Radio-Browser** (`/url/{uuid}`), une fois par station et par
  lancement, et **les stations ajoutées avant** sont retrouvées par leur URL de flux
  (`/stations/byurl`) à la première écoute. Les trois gestes partent au démarrage d'une
  station, y compris quand l'ordre vient de la notification, du casque ou du widget — c'est
  `MediaItemTransition` qui les déclenche, pas le bouton de l'écran.

### Ajouté — parcourir l'annuaire par pays et par genre
- **◉ PAYS** : les pays de l'annuaire avec leur nombre de stations, **en français**,
  filtrables à la frappe sans accent ni casse. ☆/★ épingle un pays, qui remonte en tête et le
  reste d'un lancement à l'autre.
- **# GENRES** : les 500 tags les plus portés. `tagExact` : « rock » ne ramène pas « classic
  rock » ; les doublons de casse et les tags vides sont écartés.
- **TRI** : plus écoutées (défaut), plus votées, tendance, par nom, au hasard — un groupe de
  boutons radio, React Native n'ayant pas de menu déroulant. Il vaut pour la recherche comme
  pour le parcours, relance la dernière requête et se retient. Parcourir ramène 40 stations
  contre 15 pour une recherche.
- **Repli de miroir** : toutes les requêtes passent par `rbFetch()`, qui retente sur
  `de1.api.radio-browser.info` quand `all.api` ne répond pas, et s'en souvient. L'application
  tapait `all.api` en dur : le nom tournant en panne, plus rien ne répondait.

### Ajouté — le temps d'écoute
- **Un volet « Temps d'écoute »** sous l'historique, sur le même patron : replié, il n'affiche
  que le total du jour. Ouvert : totaux du jour, de 7 et de 31 jours, un histogramme des 31
  derniers jours (aujourd'hui en surbrillance, résumé pour les lecteurs d'écran), et les huit
  stations les plus écoutées.
- **Compté seulement quand le son sort** : ni pause, ni tampon vide, ni reconnexion — les trois
  cas que `streamState` porte déjà. Mesuré à l'horloge et non au nombre de pas ; un écart de
  plus de 65 s (téléphone endormi, processus suspendu) est plafonné. Le nettoyage de l'effet
  solde le temps jusqu'à l'instant de l'arrêt, sans quoi jusqu'à cinq secondes se perdraient
  au début et à la fin de chaque écoute.
- Stocké sous `listenStats` sur 31 jours glissants, **hors export** — c'est l'histoire de cet
  appareil, pas une partie de la bibliothèque. L'écriture différée est vidée au passage en
  arrière-plan, le moment où le processus peut être tué.

### Ajouté — la couleur d'écran libre
- **Un cinquième écran, LIBRE**, avec un curseur de teinte. La page se recolore pendant le
  geste ; le choix s'écrit quand on lâche. Le calcul est celui du site : la luminosité est
  montée jusqu'au contraste visé plutôt que fixée, texte principal à 11:1, secondaire à 5,5:1.
- Le calcul vit dans `src/ui/palette.ts`, qui ne dépend de rien de React Native : isolé, il se
  vérifie sur les 360 teintes sans monter l'application.

### Ajouté — import de playlists M3U et PLS
- **Le bouton IMPORTER accepte aussi une playlist** `.m3u` ou `.pls` d'un autre lecteur, en
  plus de la sauvegarde JSON. C'est le contenu qui décide (`[playlist]`, `#EXTM3U`),
  l'extension ne fait que départager.
- Mêmes analyseurs que le site : `#EXTINF` avec `tvg-logo` et `group-title`, `#EXTGRP` de VLC,
  virgule entre guillemets qui ne coupe pas le nom, `FileN`/`TitleN` rapprochés par numéro.
  Mêmes garde-fous : contrôle d'hôte, doublons ignorés, 200 entrées au plus, master HLS refusé,
  playlist imbriquée résolue et comptée à part si elle ne l'a pas pu.
- Le sélecteur de fichiers n'est plus restreint au JSON. Les M3U et PLS arrivent sous des types
  très variables selon l'application qui les a écrites, souvent `application/octet-stream` : un
  filtre par type les aurait rendues invisibles dans le sélecteur.

### Corrigé
- **Une PLS servie en `audio/x-scpls` était prise pour un flux direct**, et toute M3U servie en
  `audio/x-mpegurl` déclarée HLS sans être lue. Même défaut que le site, trouvé le même jour :
  `resolveStreamUrl()` décidait sur le type avant d'avoir lu. Les types de playlist sont
  désormais lus d'abord. Touchait le formulaire d'ajout depuis toujours.
- **`sanitizeHue()` rendait 0 — du rouge — au lieu du défaut** pour une valeur absente :
  `Number(null)` vaut 0, qui est fini et dans la plage. Le type est vérifié avant la valeur.
  Trouvé par la mesure sur les 360 teintes, pas à l'œil.

### Mesuré — `Intl.DisplayNames` n'existe pas sur Hermes
Le site traduit les noms de pays avec `Intl.DisplayNames`. Sondé sur l'émulateur (RN 0.86,
Hermes) : `Intl` est un objet, `Intl.DisplayNames` est `undefined`, et le constructeur lève.
La liste s'affichait « Albania », « United Arab Emirates ». La table française est donc
calculée une fois par Node, qui a l'ICU complet, et embarquée — `src/data/countries.fr.json`,
279 codes, 5 Ko. `Intl.DisplayNames` reste consulté d'abord, pour la cible web où il existe.
(`String.prototype.normalize`, lui, est bien là : le filtre sans accent fonctionne.)

### Vérifié
- 19 tests des analyseurs de playlist hors application (en-têtes, BOM, CRLF, attributs, virgule
  entre guillemets, `#EXTGRP`, PLS dans le désordre, noms et groupes de repli, master HLS).
- Palette sur les **360 teintes** : aucune couleur invalide, pire contraste principal 11,00:1,
  pire contraste secondaire 5,50:1 — les deux cibles, atteintes exactement.
- Émulateur API 36, APK debug, de bout en bout : LIBRE choisi puis teinte portée à 57°, toute
  la page recolorée, choix retrouvé après redémarrage ; parcours des pays en français, filtre
  « emirats » → « Émirats arabes unis », résultat « Émirats arabes unis · plus écoutées · 40 » ;
  tri passé à « par nom », requête relancée ; genres chargés et ordonnés par nombre de stations.
- Station de l'annuaire ajoutée : `uuid` **et** `favicon` relus dans le stockage, pochette FIP
  affichée dans la page et dans la notification média.
- Playlist de six entrées importée : « 3 importée(s) · 1 déjà présente(s) · 2 refusée(s) —
  adresse locale ou invalide », groupes « Jazz, et autres » (virgule gardée) et « Ambiance »
  (`#EXTGRP`), et la PLS SomaFM imbriquée résolue en `ice6.somafm.com/groovesalad-128-mp3` —
  aucune entrée « non vérifiée », donc la correction du type `audio/x-scpls` tient.
- Temps d'écoute : 1 min compté, retrouvé après un arrêt forcé de l'application, arrêté net à
  la pause.
- Deux défauts trouvés en regardant l'écran, corrigés : les lignes de parcours tombaient sur la
  police système au lieu de celle du Pip-Boy, et la plaque de pochette, posée dans la seule
  ligne STATION, en décalait le libellé au lieu d'encadrer les deux lignes comme sur le site.

### Non vérifié
Le repli de miroir : il demande que `all.api` tombe, ce qu'on ne peut pas provoquer depuis
l'émulateur. Le code est celui du site, dont le repli a été vérifié en bloquant le nom tournant
dans le navigateur.

## 2026-09-23 (2) — app, l'APK se construit en CI

### Ajouté — `.github/workflows/android.yml`
- **Build release à chaque push** sur `react-native/**`, sous Linux : aucun des pièges Windows
  (espace dans le chemin du SDK, 260 caractères, JDK 25), et `expo prebuild --clean` à chaque
  fois — le manifeste périmé qui a produit deux APK faux le 19/09 ne peut plus se produire.
  CMake 3.30.5 et `cmake.dir` posés comme sur le poste. Release plutôt que debug : seul le
  release embarque le bundle JS et passe par la signature.
- **Sans secrets, une clé jetable** : le build va au bout et l'APK sort en artefact, nommé
  `-cle-jetable` pour qu'on ne le prenne pas pour une version installable.
- **Un tag `v*` crée une release en brouillon** signée de la vraie clé (secrets obligatoires).
  Brouillon parce que l'app surveille l'API des releases : rien n'est annoncé aux téléphones
  avant qu'on ait écrit les notes et publié à la main.
- **Refusé plutôt que découvert sur le téléphone** : version de l'APK différente d'`app.json`,
  tag différent de la version, signature de debug, clé différente de la dernière release
  publiée, `versionCode` qui ne la dépasse pas, release déjà existante.

### À faire une fois
- Poser les quatre secrets de signature (`app/README.md`, section « La CI »). Tant qu'ils
  manquent, les push construisent avec la clé jetable et les tags échouent — volontairement.

### Vérifié
- YAML validé, les neuf scripts passent `bash -n`, et le piège `yes | sdkmanager` sous
  `pipefail` (échec 141) mesuré puis contourné. **Pas encore exécuté sur GitHub** : il le sera
  au premier push de cette branche.

## 2026-09-23 — app, une reconnexion qui ne renonce plus au premier tunnel

### Modifications
- **La reconnexion espace ses essais au lieu de s'arrêter après trois.** 1, 2, 4, 8, 15 s,
  puis toutes les 30 s tant que l'utilisateur n'a pas arrêté : trois essais à 2 s d'écart
  s'épuisaient bien avant la fin d'une coupure réelle. Le libellé affiche le numéro de
  l'essai (« ⟳ RECONNEXION… 4 ») pour qu'une attente longue ne passe pas pour un gel.
- **La nature de l'erreur décide du nombre d'essais.** Réseau ou inconnue : sans fin.
  `source` (404, mais aussi 502 passager) : trois. Décodeur, sortie audio ou lecture refusée
  par le navigateur : aucun, réessayer n'y changerait rien. Sur le web, une même coupure
  remonte deux fois (rejet de `play()` classé `unknown`, puis l'erreur de l'élément) : le
  verdict le plus sévère l'emporte, et un abandon n'est plus relancé par l'erreur en double.
- **Chien de garde de 20 s sur le tampon.** Un flux qui garde la connexion ouverte sans plus
  rien livrer laisse le lecteur en tampon sans erreur ; il est désormais rechargé. Recharger
  reconstruit la file : `retry()` n'est qu'un `prepare()`, sans effet sur un lecteur en tampon.
- **Essai immédiat au retour du réseau** (événement `online` sur le web) et au retour de
  l'appli au premier plan sur le téléphone, faute de module réseau natif.

### Corrections
- L'horloge de chevet n'affichait jamais « … CONNEXION » : elle comparait l'état du flux à
  `'loading'`, qui n'existe pas. Elle suit maintenant le tampon et la reconnexion.

Vérifié sur la cible web (station à domaine `.invalid`, erreurs forcées) : trois essais puis
abandon sur `source`, délais croissants sans abandon sur `network`, arrêt qui coupe les
essais, essai immédiat sur `online`. **Non vérifié** : le chien de garde de tampon, et tout le
comportement sur Android — pas de SDK sur le poste de développement.

## 2026-09-22 — app v1.4.1, zapper depuis l'horloge de chevet

### Ajouts
- **Deux boutons de station de part et d'autre de la lecture/pause sur l'horloge de chevet.**
  L'écran de chevet savait lancer et arrêter la station déjà choisie, mais en changer imposait de
  retourner le téléphone en portrait, où vit la liste. La file du lecteur est la même des deux
  côtés : `◀◀` et `▶▶` y déplacent l'index, exactement comme `PREV`/`NEXT` en portrait.
- Les trois boutons passent à la ligne plutôt que d'être coupés quand la colonne de gauche est
  trop étroite — « ▶ AUCUNE STATION » et ses deux flèches dépassent sur un écran court.

## 2026-09-20 (2) — app v1.4.0, zapping partout et historique des titres

### Réparation — zapper fonctionne enfin hors de l'application
- **La file du lecteur contient toutes les stations visibles**, la station choisie servant d'index
  de départ, avec `RepeatMode.All`. Elle n'en contenait qu'une : sans piste suivante, aucun appui
  sur ⏭ ne pouvait aboutir, ni depuis la notification, ni le casque, ni l'écran verrouillé.
- Les commandes repassent en `handling: 'native'`, et `MediaItemTransition` remonte le résultat
  d'où qu'il vienne. Les écouteurs `RemoteNext`/`RemotePrevious` étaient morts et sont retirés.
- Le pont Kotlin du widget vers le JS disparaît avec : il n'existait que pour contourner ça.
- Limites assumées : le gain par station ne suit le zapping que si l'application tourne, et la
  file se reconstruit au choix explicite d'une station, pas à chaque modification de la liste.

### Ajouts
- **Historique des titres** : ce que chaque station a joué, horodaté, cherchable. 600 entrées au
  total, 200 par station. Effacement avec confirmation.
- **Bouton lecture/pause sur l'horloge de chevet**, avec un état « connexion » distinct.
- **Titre en cours sur l'horloge de chevet** : elle nommait la station sans dire le morceau.
- **Recherche dans la liste de stations**, au-delà de huit stations visibles ; filtre d'affichage
  seulement, le zapping continue de parcourir toute la bibliothèque.
- **Les réveils entrent dans la sauvegarde** (format v2, l'import relit aussi la v1). Une alarme
  importée arrive éteinte.

## 2026-09-20 — app v1.3.5, widget d'écran d'accueil

### Application — un lecteur sur l'écran d'accueil
- Widget 4×1 : station en cours, titre, lecture/pause et zapping, aux couleurs du Pip-Boy.
  `RemoteViews` et non Glance, qui embarquerait tout le runtime Compose pour quatre boutons.
- Play/pause part en touche média : la session répond même application fermée.
- **Zapper ne peut pas passer par la session média.** Trois chemins mesurés sur émulateur,
  tous sans effet : la touche `KEYCODE_MEDIA_NEXT` (traduite en `seekToNext()`, non surchargée),
  la commande `trackplayer.seek_to_next` (appelle le lecteur brut et acquitte quand même), et
  `seekToNextMediaItem()` sur un contrôleur (abandonné côté client, file d'une seule piste).
- Le widget s'adresse donc à l'application, qui seule connaît la station suivante. Conséquence :
  le bouton ⏭ de la notification reste inopérant, pour la même raison de fond.
- Corrigé au passage : un `BroadcastReceiver` ne peut pas se lier à un service, ce qui faisait
  tomber l'application à chaque appui sur une flèche (`ReceiverCallNotAllowedException`).

## 2026-09-19 (5) — app v1.3.0, réveil radio

### Application — le téléphone posé à l'horizontale devient un radio-réveil
- Alarmes récurrentes par jour de semaine, qui déclenchent la station choisie application
  fermée et écran éteint. Module Expo local `modules/alarm/`, sur le patron de `audio-boost`.
- L'alarme a son propre ExoPlayer sur `USAGE_ALARM` : le service de `@rntp/player` ne démarre
  pas depuis l'arrière-plan, réveiller le JS est ce qui a tué la v4, et la v5 n'a pas de
  fondu d'entrée. Le canal d'alarme ignore en prime le mode silencieux.
- **Repli sur la sonnerie système** après dix secondes sans son : une station morte à 7 h ne
  vaut pas un réveil raté. C'est la garantie centrale, pas une finition.
- Écran de réveil plein écran par-dessus le verrouillage, écrit en Kotlin pour ne pas
  attendre le runtime JS ; il emprunte les couleurs de la palette courante.
- Report de 10 minutes, trois au maximum, et **échéance absolue à 30 minutes** depuis la
  première note : le bouton disparaît plutôt que d'accorder un répit qui serait coupé.
- Réarmement après redémarrage du téléphone (`RECEIVE_BOOT_COMPLETED`), sans quoi les alarmes
  disparaîtraient en silence à la première mise à jour système nocturne.
- Montée de volume de 30 s par défaut (0, 15, 30 ou 60), calculée sur l'horloge, et gain de
  station appliqué au réveil comme à l'écoute.
- Le paysage est un écran à part, pas une mise en page : les écrans existants n'y sont pas
  rendus, donc aucun n'a à gérer une largeur qu'il n'a jamais vue.
- Neuf permissions au total, dont six pour le réveil, listées dans la section « Données » des
  README. Aucune ne touche aux données personnelles.

## 2026-09-19 (4) — app v1.2.0

### Application — l'app dit quand une version est sortie
- Installée depuis une page de release, l'app vieillissait en silence : aucun store ne la
  surveille. Une fois par jour au plus, et seulement sur Android, elle interroge l'API des
  releases GitHub et compare le tag à `expo.version`. Une ligne sous l'en-tête propose
  d'ouvrir la page — pas d'installation depuis l'appli, qui coûterait la permission
  `REQUEST_INSTALL_PACKAGES` pour un appui économisé.
- Un échec n'est pas daté : un téléphone démarré hors ligne réessaie à l'ouverture suivante
  au lieu de rester muet un jour entier. La dernière release connue est persistée, donc le
  bandeau s'affiche avant même la réponse du réseau.
- Une version écartée le reste jusqu'à la suivante, ou jusqu'à une vérification demandée à la
  main depuis les réglages — qui affichent aussi la version installée.
- Les sections « Données » des README gagnent le tiers que cela ajoute : `api.github.com`.

## 2026-09-19 (3)

### Documentation — un README par cible, au lieu du même partout
- Les trois branches portaient **le même README**, si bien que rien ne disait au lecteur sur
  quelle cible il venait de tomber. `main` décrit désormais le navigateur et le Docker qui le
  sert ; `react-native/main` et `/dev` décrivent l'application — APK d'abord, build ensuite —
  et renvoient à `app/README.md` plutôt que de le recopier.
- Les fichiers du site présents sur la branche app restent documentés sur `main` : ce sont des
  copies, et leur README disait deux fois la même chose dans deux langues.
- Côté site, trois fonctionnalités livrées sans une ligne de documentation la reçoivent enfin :
  le sélecteur de couleur, le formulaire d'ajout replié, et le champ `boost` — avec ce qu'il
  fait ici, c'est-à-dire rien. La taille annoncée passe de 108 à 126 Ko, elle avait trois
  fonctionnalités de retard.
- Côté app, un **jalon 6** regroupe le sélecteur de couleur et les sept défauts remontés du
  téléphone ; ils partagent une origine qui méritait d'être écrite : aucun n'était visible sur
  l'émulateur. Deux notes pourries sont tranchées au passage — la copie de `stations.json`
  (la racine fait foi) et une section finale qui revendiquait un visualiseur FFT que l'app n'a
  jamais eu.

### Supprimé — la branche `dockerized`
- Elle était en retard sur **chacun** des fichiers qu'elle était censée servir : `vendor/`
  absent du `Dockerfile`, CSP d'avant hls.js dans `nginx.conf`, `.dockerignore` vide, et un
  `index.html` d'avant HLS, l'annuaire et le sélecteur de couleur.
- Tout le Docker vit sur `main` (`Dockerfile`, `docker-compose.yml`, `nginx.conf`,
  `DOCKER.md`) et n'a jamais eu besoin d'une branche. Une branche de déploiement qui déploie
  la semaine dernière est un piège, pas un raccourci.
- Le commit est conservé en tag local `archive/dockerized`, non poussé.

### Publié — l'APK 1.1.1 en release GitHub
- Quatre tags posés sur les commits de montée de version (`v1.0.1`, `v1.0.2`, `v1.1.0`,
  `v1.1.1`), et une release pour la dernière, avec l'APK signé de 80,3 Mo en pièce jointe.
- Les trois versions antérieures gardent leur tag sans binaire : les recompiler supposerait de
  repasser par la copie à chemin court, pour un intérêt nul.
- Les deux README pointent maintenant la page des releases plutôt qu'un dossier de code : qui
  lit ça veut installer, pas compiler.

## 2026-09-19 (2)

### Essayé puis retiré — la détection automatique des métadonnées
- L application mobile interroge l hôte d une station ajoutée sur `/status-json.xsl` (Icecast)
  et `/stats?json=1` (Shoutcast) quand rien n est déclaré, ce qui donne un titre aux webradios
  de l annuaire. La même sonde a été écrite ici, puis **retirée après mesure**.
- **Zéro station sur douze répond depuis le navigateur** : tous les serveurs Icecast testés
  omettent l en-tête CORS. Depuis le natif, trois sur sept répondent. Garder la sonde n aurait
  fait qu ajouter six secondes d attente à chaque ajout, pour rien.
- Shoutcast reste hors de portée ici pour la même raison, et le restera : c est un des deux
  verrous qui justifiaient le portage natif, avec l amplification.

### Documentation
- Les deux README mentionnent l application mobile et ce qu elle fait que cette page ne peut
  pas : amplifier les stations trop faibles, et lire le titre dans le flux lui-même.

## 2026-09-19

### Corrigé — les gains, mesurés cette fois sur des fenêtres assez longues
- Les gains posés la veille venaient d échantillons de 40 et 100 s. Trop court : **Pirate Radio
  mesure de -8,8 à -25,2 LUFS selon le moment**, son contenu variant énormément. Le 0,17 qu on
  lui avait donné était trois fois trop sévère.
- Deux passes de **180 s** par station, moyennées : les écarts entre passes tombent sous 5 dB,
  et **Radio New Vegas ressort stable à -30,6** sur quatre mesures — elle est bien diffusée
  faible, ce n est pas un artefact de mesure.
- Nouvelle cible : **-18 LUFS**, le niveau du gros du peloton, pour que la page sonne comme le
  reste de la machine au lieu d être uniformément faible. Seules les cinq stations au-dessus
  sont atténuées (Pirate 0,45, Diamond City 0,55, Black Mountain 0,67, Galaxy 0,69,
  Mysterious 0,77) ; les six autres gardent 1.
- Le champ **`boost`** apparaît sur deux stations. **Le site l ignore volontairement** — on ne
  peut pas amplifier dans un navigateur — il sert à l application mobile, qui le peut en natif.
  Il vit ici pour que les deux cibles gardent une seule source de vérité. Détail dans `CLAUDE.md`.

### Corrigé — l annuaire ne liste plus deux fois le même flux
- Radio-Browser publie une fiche par nom donné par les contributeurs : la même URL revenait
  plusieurs fois dans les résultats. Déduplication sur l URL, la première fiche gagne.

## 2026-09-18 (4)

### Changé — les gains des stations sont mesurés, plus estimés
- Radio New Vegas et Mojave Music Radio s entendaient nettement moins que les autres, et les
  gains livrés aggravaient l affaire : les fortes à 0,63, ces deux-là à 1, soit quatre
  décibels de correction pour un écart qui s est révélé être de vingt-deux.
- Les onze flux ont été mesurés à la sonie **EBU R128** (ffmpeg `ebur128`), deux passes de 40
  et 100 s, moyennées. L éventail va de **-10,6 LUFS** (Pirate Radio) à **-32,7** (Mojave).
- Les gains visent désormais une **cible de -26 LUFS** : ce qui est au-dessus est atténué
  d autant, ce qui est en dessous garde 1 — on ne peut pas amplifier au-delà du maximum.
  Aligner sur la plus faible aurait mis presque tout au plancher de 0,1.
- Pirate Radio passe de 0,63 à **0,17**, Diamond City à **0,24**, Galaxy News à **0,29**.
  Classical Radio, mesurée à -30 LUFS, remonte de 0,63 à **1** : elle était faible aussi,
  personne ne l avait signalé.
- Il reste un écart : Mojave est encore ~7 dB sous la cible, faute de pouvoir l amplifier.
  Le curseur par station sert à ça, et son réglage est retenu.

### Ajouté — effacer les résultats de l annuaire
- Un bouton **✕ EFFACER** apparaît à côté de « CHERCHER » dès qu il y a quelque chose à
  l écran. Chercher à vide vidait déjà la liste, mais rien ne le disait.

## 2026-09-18 (3)

### Changé — « Ajouter une station » se replie
- Le formulaire d ajout est passé en `<details>`, replié par défaut, comme la corbeille :
  quatre champs et trois boutons repoussaient l annuaire hors de l écran pour un geste rare.
- **L annuaire reste hors du `<details>`** : les deux partagent un cadre mais ne sont pas la
  même chose, et replier l ajout ne doit pas emporter la recherche.
- Le chevron ▸/▾ vient d un `::before` sur le `<summary>`, et le marqueur natif est masqué
  (`list-style: none`) pour garder la ligne de tirets du reste de l interface.

## 2026-09-18 (2)

### Ajouté — la couleur de l'écran se choisit
- **Bouton ⚙ à gauche de l'horloge**, ouvrant un panneau « RÉGLAGES » où l'on choisit parmi
  les quatre écrans de Pip-Boy : **vert** (inchangé), **ambre**, **bleu**, **blanc**. Le choix
  est retenu dans `localStorage.themePalette` — même clé que l'application mobile, qui a reçu
  la fonctionnalité en premier.
- **Trois blocs `:root[data-theme="…"]`** redéfinissent les variables existantes. Les noms
  restent `--green-*` même en ambre : les renommer toucherait toute la feuille pour aucun
  gain, et le nom d'une variable n'est pas ce que l'utilisateur voit.
- **Nouvelle variable `--accent-rgb`**, la teinte principale en composantes. Six `rgba()`
  étaient écrits en dur (`rgba(57,255,106,…)`) pour les halos du titre, l'ombre de l'en-tête
  et les fonds de ligne survolée : une couleur hexadécimale ne peut pas les servir, et sans
  cette variable ils seraient restés verts sur fond ambre.
- **Le thème est appliqué avant le premier rendu**, par un court script en `<head>` — sinon la
  page s'afficherait en vert le temps du chargement avant de virer.
- **Contraste mesuré, pas choisi à l'œil** : chaque palette garde son `--green-dim` entre
  5,5 et 8,0 : 1 sur son propre `--bg3`, au niveau du vert d'origine (5,9 : 1). Le texte
  secondaire reste lisible quelle que soit la couleur.
- Panneau accessible : `role="dialog"`, options en `role="radio"` avec `aria-checked`, focus
  porté sur l'option cochée à l'ouverture et rendu au bouton ⚙ à la fermeture. Chaque option
  est affichée dans sa teinte **et** nommée — une couleur seule ne dit rien à qui ne la
  distingue pas.
- **Échap referme**, et tant que le panneau est ouvert les raccourcis globaux se taisent :
  taper « s » dans une boîte de dialogue ne doit pas couper la radio.

## 2026-09-18

### Changé — gain et masquage pour toutes les stations, corbeille
- **Le curseur de gain n'est plus réservé aux stations custom.** Chaque ligne en porte un,
  y compris les onze stations de `stations.json`. Le fichier n'est pas réécrit : l'écart
  est stocké à part, dans `localStorage.builtinStationPrefs`, indexé par URL de flux —
  la seule clé stable, l'ordre du fichier pouvant changer d'une version à l'autre.
  **Seuls les écarts sont persistés** : ramener un gain à sa valeur d'origine efface
  l'entrée au lieu d'y figer une valeur, donc une future modification de `stations.json`
  reste visible pour l'utilisateur qui n'y avait pas touché.
- **Le ✕ masque au lieu de supprimer**, pour toutes les stations. Une station masquée reste
  dans le tableau `stations` (les index, et donc `current` et les id DOM `st-N`, ne se
  décalent plus à chaque masquage) mais sort de la liste, du sondage des métadonnées, de
  l'export et de la navigation ←/→ (`stepStation()`).
- **Corbeille dépliable** en bas de la liste, affichée seulement quand elle n'est pas vide :
  chaque station masquée y est restaurable une par une. Son état d'ouverture est mémorisé
  (`trashOpen`), sinon elle se replierait à chaque restauration, qui re-rend la liste.
- **La suppression définitive n'existe que dans la corbeille, et seulement pour les stations
  custom** : une station livrée est relue dans `stations.json` au prochain chargement, la
  « supprimer » n'aurait de sens que jusqu'au rechargement.
- **Ré-ajouter une station masquée la réaffiche** au lieu d'échouer en doublon invisible —
  vrai pour le formulaire, l'annuaire et l'import de fichier.
- Masquer la station en cours de lecture l'arrête (`stopRadio()`), et la dernière station
  mémorisée n'est pas restaurée si elle a été masquée entre-temps.

## 2026-09-17

### Ajouté — HLS, métadonnées génériques, annuaire, groupes libres
- **Flux HLS (`.m3u8`)** lisibles, via `hls.js` 1.7.3 build *light* (Apache-2.0) figé dans
  `vendor/` et servi en local, jamais depuis un CDN : la page doit continuer à rendre et à
  jouer à l'identique hors ligne et sur un réseau isolé. +377 Ko sur disque, +116 Ko sur le
  réseau une fois gzippé. Seuls Safari et iOS lisent HLS nativement dans `<audio>`.
- `attachStream()` / `detachStream()` deviennent le **point de passage unique** du flux : les
  quatre endroits qui faisaient `audio.src = …` à la main (`playStation`, `togglePlay`,
  `handleStreamDrop`, `stopRadio`) passent par là, sinon changer de station laisserait
  l'instance hls.js précédente attachée et les deux flux se disputeraient l'élément.
- **hls.js passe avant la lecture native** même quand celle-ci est annoncée :
  `canPlayType('application/vnd.apple.mpegurl')` répond `"maybe"` sur des moteurs Chromium au
  support partiel, ce qui ne vaut pas garantie — et hls.js remonte des erreurs exploitables
  par `handleStreamDrop()`. Le chemin natif reste celui d'iOS, où MSE n'existe pas.
- **Métadonnées génériques** : `apiId` (un entier, forcément relatif à l'instance AzuraCast de
  fallout.radio) est remplacé par `meta: { type, url }`, avec deux familles reconnues —
  AzuraCast et Icecast `status-json.xsl`.
- **Détection automatique AzuraCast** : une URL `https://<hôte>/listen/<shortcode>/…` suffit,
  `/api/nowplaying/<shortcode>` accepte le shortcode aussi bien que l'id numérique. Coller
  l'URL d'un flux AzuraCast fait donc apparaître le titre en cours sans rien configurer.
- **Annuaire Radio-Browser** intégré au panneau d'ajout : ~50 000 stations, sans clé d'API.
  Recherche par nom, repli sur le tag quand le nom ne donne rien (« jazz » est un genre).
- **Groupes libres** : `game` devient `group`, un libellé quelconque (un jeu, un genre, un
  pays). Ancien nom encore lu, jamais réécrit. Regroupement insensible à la casse, `<datalist>`
  des groupes existants dans le formulaire, mise en capitales déléguée au CSS.
- Champ **« Métadonnées (optionnel) »** dans le formulaire, pour les flux qu'aucune détection
  ne couvre. Le type est déduit de l'URL (`status-json.xsl` → Icecast, sinon AzuraCast).

### Corrigé — une URL `.m3u8` créait une station morte
`resolveStreamUrl()` traitait tout `.m3u` comme une playlist et gardait la première ligne non
commentée. Un master HLS commence lui aussi par `#EXTM3U`, mais ses lignes sont des variantes
ou des **segments de quelques secondes** : la station était créée, jouait dix secondes, puis
mourait. Le test HLS (extension, `#EXT-X-`, type MIME `*mpegurl`) passe maintenant **avant** la
branche M3U — et avant le raccourci « le type commence par `audio/` », puisqu'un master est
servi en `audio/x-mpegurl`.

### Corrigé — `stopRadio()` provoquait une erreur média
`audio.src = ''` se résout en URL de la page, que le navigateur tente de décoder puis signale
en `error` — donc en tentative de reconnexion. `detachStream()` fait `removeAttribute('src')`
puis `load()`, et `setUI(-1)` passe avant le détachement.

### Modifié
- CSP : `media-src` accepte `blob:` et `data:`, `worker-src 'self' blob:` est ajouté. hls.js
  attache un MediaSource via un blob URL, démultiplexe dans un worker construit depuis un blob,
  et repasse par une URL `data:` au détachement (une violation CSP par changement de station
  sinon). Même changement dans `index.html` et `nginx.conf`.
- L'annuaire n'affiche pas les flux `http://` quand la page est servie en `https:` : c'est du
  contenu mixte, la station serait ajoutée puis resterait muette. Il demande donc `RB_LIMIT × 4`
  fiches et filtre avant d'en garder 15.
- Plafond `MAX_META_POLL = 40` sur la sonde périodique : l'annuaire permet d'accumuler des
  dizaines de stations, chaque tour partirait sinon en autant de requêtes. Au-delà, une station
  n'est interrogée que lorsqu'on la sélectionne (`refreshOne`).
- `normalizeStation()` / `serializeStation()` : tout ce qui entre dans `stations` (stations.json,
  localStorage, import, annuaire) passe par une normalisation unique, et ce qui ressort est déjà
  à la forme courante. Le champ `group` n'est plus obligatoire — sans lui, la station atterrit
  dans `DIVERS` au lieu d'être refusée.
- `Dockerfile` copie `vendor/`.

### Vérifié (navigateur, flux réels)
- FIP en HLS (`stream.radiofrance.fr/fip/fip_hifi.m3u8`) : lu via hls.js, `currentSrc` en
  `blob:`, statut ON AIR, **zéro violation CSP**. Bascule HLS → MP3 puis stop : instance hls.js
  détruite, aucune erreur média.
- Détection auto : `demo.azuracast.com/listen/azuratest_radio/radio.mp3` ajouté sans champ
  métadonnées → titre « Eve — Amaris » affiché.
- Annuaire : « jazz » → 15 résultats, ajout classé par code pays.
- Aller-retour export → import : `group`, `hls` et `meta` préservés. Import d'un export au
  format hérité (`game` + `apiId`) : converti correctement.
- Les 11 stations Fallout : 11/11 métadonnées, groupes et accessibilité de la liste inchangés.

### Écarté
- **Shoutcast v2** (`/stats?json=1`) : aucun en-tête CORS, inatteignable depuis un navigateur.
- **Icecast `status-json.xsl` en détection automatique** : sur six serveurs publics testés, un
  seul répondait encore (404, 403, ou page HTML de donation). Reste disponible en saisie manuelle.
- **Podcasts / RSS** : les flux n'autorisent quasiment jamais CORS, il faudrait un proxy —
  donc un serveur, que ce projet n'a pas.
- **YouTube / Twitch** : iframe obligatoire, incompatible avec le modèle `<audio>`.
- **Favicons de l'annuaire** : `img-src 'self' data:` les bloquerait, et élargir la CSP pour
  des icônes ne vaut pas le coup.

## 2026-09-15 (3)

### Corrigé — accessibilité de la liste de stations
- Le `<li>` portait `role="button"`, ce qui **aplatissait son sous-arbre** : le curseur de gain
  et le bouton supprimer n'étaient pas exposés aux lecteurs d'écran (un `button` a des enfants
  présentationnels par spec ARIA), et le `<ul>` perdait ses sémantiques de liste. L'action est
  désormais un vrai `<button class="station-btn">` portant le nom de la station ; le `<li>`
  redevient un `listitem` et les contrôles sont ses frères, donc réellement atteignables.
- Cible de clic : `.station-btn::after` (inset 0) étend la zone cliquable à toute la ligne sans
  agrandir l'élément focalisable ; `.station-gain`/`.del-btn` repassent au-dessus via `z-index`.
  Le `stopPropagation` du curseur de gain devient inutile et a été retiré.
- Focus clavier **visible** : `:focus-visible::after` trace un liseré vert sur toute la ligne.
  Auparavant la liste n'avait aucun style de focus et dépendait de l'outline par défaut.
- Symboles décoratifs isolés dans des spans `aria-hidden` : "■ ON AIR" s'annonce "ON AIR",
  "── FO3 ──" s'annonce "FO3". Les libellés d'état sont centralisés dans `STATION_STATUS` +
  `setStationStatus()`, au lieu d'être réécrits à la main en six endroits.
- Chaque `<section>` de groupe est nommée par son titre (`aria-labelledby`) : le jeu est annoncé
  à l'entrée du groupe, le nom accessible du bouton reste donc exactement le texte visible
  (WCAG 2.5.3). Le morceau en cours est rattaché via `aria-describedby`.
- `#np-station` passe en `aria-live="polite"` : "FLUX INTERROMPU" et "UNAVAILABLE" sont
  désormais annoncés, alors qu'ils changeaient silencieusement.
- Le point pulsé (`.station-dot`) et le statut visuel sont `aria-hidden` — redondants avec
  `aria-pressed`.

## 2026-09-15 (2)

### Ajouté
- **Gain éditable en UI pour les stations custom** : curseur inline sur chaque ligne
  (10 %–100 %), appliqué **en direct** si la station est en cours de lecture — régler un gain
  sans entendre le flux revient à deviner. Persisté sur `change` uniquement (une écriture
  `localStorage` par geste, pas par pixel de glissement). Le curseur stoppe la propagation de
  `click`/`keydown`/`pointerdown` : sans ça, le régler déclencherait la lecture de la ligne.
  Les gains des stations intégrées restent dans `stations.json`, non éditables depuis l'UI.

### Corrigé
- `importStations()` perdait le champ `gain` : une station exportée avec un gain réglé
  revenait à 1 après réimport. Le gain est désormais conservé (et normalisé).
- Un `gain` non numérique ou hors plage (localStorage corrompu, fichier d'import bricolé)
  produisait `audio.volume = NaN`, ce qui lève une `TypeError` et coupe la lecture.
  `sanitizeGain()` le ramène à 1 au chargement, à l'import et à la lecture, plutôt que de
  rejeter la station. `effectiveVolume()` garde aussi contre un volume maître non fini.

## 2026-09-15

### Corrigé
- `resolveStreamUrl()` résout les entrées M3U/PLS **relatives** contre l'URL de la playlist
  (`new URL(entrée, urlPlaylist)`) ; auparavant `File1=/live.mp3` était stocké tel quel et
  donnait une URL de flux invalide.
- `resolveStreamUrl()` repasse l'URL **résolue** par `isPrivateHost()` + contrôle de protocole.
  La garde SSRF ne couvrait que l'URL saisie : une playlist distante pouvait faire pointer le
  lecteur vers `http://127.0.0.1:…`. Le cas est désormais refusé avec un message explicite
  (`blocked: true` remonté à `addStation()`).
- `stalled` ne déclenche plus une reconnexion immédiate : délai de grâce de `STALL_GRACE_MS`
  (3 s) puis vérification que `currentTime` n'a pas avancé. L'événement se déclenche sur une
  simple lenteur réseau — la coupure "corrective" était souvent pire que le symptôme.
- Le message d'erreur de `exportStations()` ("Aucune station custom à exporter") s'efface après
  3 s comme tous les autres, au lieu de rester affiché indéfiniment.
- Le visualiseur ne tourne plus en onglet masqué (34 écritures DOM toutes les 110 ms) : garde
  `document.hidden` dans `startVis()`, arrêt/reprise sur `visibilitychange`. Le polling API
  était déjà coupé, pas le visualiseur.

### Ajouté
- **Media Session API** : touches média du clavier, boutons de casque, contrôles sur l'écran de
  verrouillage et dans le centre de notifications de l'OS. Métadonnées = titre du morceau en
  cours + nom de la station + pochette (favicon SVG). Handlers play/pause/stop/prev/next.
- **Raccourcis clavier globaux** : `Espace` lecture/pause, `←`/`→` station, `↑`/`↓` volume,
  `M` muet, `S` stop. Ignorés dans les champs de saisie, sur `Espace` avec un bouton focalisé
  (déjà activé par le navigateur) et sur tout événement déjà `defaultPrevented` par la liste de
  stations. Pense-bête affiché en bas de page.
- **Minuterie de veille** : bouton cyclant désactivée → 15 → 30 → 60 → 90 min, décompte affiché,
  fondu de sortie sur les 20 dernières secondes puis `stopRadio()`. `cancelSleepTimer()` restaure
  le volume corrigé par le gain (un fondu interrompu ne laisse pas le son atténué).
- **Dernière station mémorisée** (`localStorage.lastStationUrl`) : resélectionnée au chargement
  avec métadonnées et badge, sans lancer la lecture. Nouvelle classe `.selected`, distincte de
  `.playing` dont le point pulsé laisserait croire que le flux tourne.
- **État "mise en mémoire tampon"** : l'événement `waiting` affiche "⟳ TAMPON…" et fige le
  visualiseur, au lieu de laisser les barres s'agiter pendant un silence.

### Modifié
- `nowPlayingData` est indexé par **URL de flux** et non plus par position dans `stations`.
  `deleteStation()` n'a plus à réindexer toute la map à chaque suppression ; accès via `npFor(idx)`.
- Polices (VT323, Share Tech Mono — sous-ensemble latin) et favicon embarqués en `data:` URI.
  L'app ne fait plus aucune requête vers `fonts.googleapis.com`, `fonts.gstatic.com` ni
  `img.icons8.com` : rendu identique hors ligne, en LAN isolé et en ouverture `file://`.
  `index.html` passe de 31 Ko à 84 Ko (les woff2 sont déjà compressés, gzip n'y gagne rien).
  Le favicon SVG remplace le PNG icons8 — le CHANGELOG du 14/09 l'annonçait déjà mais le HTML
  pointait toujours vers icons8.
- `nginx.conf` : CSP resserrée (plus aucun hôte tiers, `font-src 'self' data:`,
  `img-src 'self' data:`) et `Cache-Control: no-cache` ajouté — sans revalidation, un rebuild
  de l'image laissait un `index.html` périmé en cache navigateur.

### Non fait (délibérément)
- **Visualiseur réel via `AnalyserNode`** : écarté définitivement. Les flux sont cross-origin
  sans en-tête CORS, donc `createMediaElementSource()` ne reçoit que du silence et coupe la
  sortie audio de toutes les stations (constaté le 14/09). C'est structurel, pas un bug
  d'implémentation. Le visualiseur aléatoire reste le bon compromis.
- **Gain éditable en UI** pour les stations custom : hors périmètre de cette passe.

## 2026-09-14 (2)

### Ajouté puis corrigé — équilibrage de volume par station
- Première tentative : boost via `GainNode` (Web Audio API, `createMediaElementSource`) pour
  amplifier "Mojave Music Radio"/"Radio New Vegas" au-delà de 100%. **Cassait le son de toutes
  les stations** — `createMediaElementSource()` reroute *tout* l'élément `<audio>` vers le graphe
  Web Audio ; une seule erreur de routage coupe la sortie de façon silencieuse (pas d'exception,
  juste plus aucun son). Repéré uniquement en usage réel — les vérifications mécaniques
  (`currentTime` qui avance, `paused: false`) ne garantissent pas un son audible.
- **Solution retenue** : plutôt qu'amplifier les 2 stations faibles au-delà du plafond natif de
  `audio.volume` (1.0), atténuation des **9 autres** stations (`gain: 0.63` dans `stations.json`,
  Mojave/Radio New Vegas restent à `gain` implicite 1). Effet perceptif équivalent (écart de
  volume comblé) sans jamais sortir de l'API `audio.volume` native, donc sans risque de casser
  le routage audio. `effectiveVolume(idx)` calcule `master × gain`, utilisé dans `playStation()`,
  la reprise de `togglePlay()`, la reconnexion, et `setVolume()` (qui capture aussi le volume
  maître réel pour le mute, pas le volume effectif post-gain).

### Non fait (délibérément, hors scope automatique)
- **README humain** : non créé — `CLAUDE.md` (destiné aux agents IA) reste la seule doc technique ; un README pour lecteurs humains est une décision de contenu/portée à valider avec l'utilisateur avant rédaction.
- **Initialisation d'un dépôt git** : non faite — changement structurel du projet (historique, `.gitignore`, remote éventuel) qui mérite une décision explicite plutôt qu'une init silencieuse.

## 2026-09-14

### Ajouté
- Conteneurisation Docker (`Dockerfile`, `docker-compose.yml`, doc `DOCKER.md`).
- Export/import JSON des stations custom (boutons "Exporter"/"Importer", validation de schéma).
- Reconnexion automatique sur flux mort (3 tentatives, message "FLUX INTERROMPU" en dernier recours).
- Accessibilité clavier de la liste de stations (`tabindex`, `role="button"`, `aria-pressed`, Enter/Espace).
- Structure HTML sémantique (`<header>/<main>/<section>/<ul>/<li>`).
- `nginx.conf` avec en-têtes de sécurité (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) + gzip.
- `HEALTHCHECK` Docker (`wget` sur `127.0.0.1`).
- Garde SSRF côté client (`isPrivateHost()`) sur l'ajout/import de stations.
- Labels accessibles sur le formulaire d'ajout et le slider de volume.

### Modifié
- `togglePlay()` gère désormais le rejet de promesse sur la reprise de lecture.
- `resolveStreamUrl()` a un timeout de 6s (`AbortSignal.timeout`) au lieu de pouvoir bloquer indéfiniment.
- `fetchNowPlaying()` et le chargement de `stations.json` ont un timeout (8s) et vérifient `r.ok`.
- `refreshNowPlaying()` ignore les ticks en onglet caché ou poll déjà en cours, reprend au retour visible.
- Stations custom identifiées par un flag `isCustom` explicite plutôt que par position dans le tableau (`STATIONS.length`).
- `lang="fr"` (contenu de l'UI en français).
- `CLAUDE.md` corrigé : `STATIONS` est chargé depuis `stations.json` au runtime, pas un tableau codé en dur.

### Sécurité
- Validation de schéma des stations custom au chargement depuis `localStorage`.
- Image Docker pinnée `nginx:1.27-alpine` (au lieu de `nginx:alpine` flottant).

### Ajouté (constats mineurs)
- Favicon (SVG data-URI, radiation) + meta description/theme-color/Open Graph.
- `aria-live="polite"` sur le ticker now-playing et les messages d'ajout/erreur.
- `prefers-reduced-motion` : désactive scintillement CRT, scroll du ticker, animation streaming, pulsation du point.
- Bouton mute dédié (🔊/🔇), volume persisté entre sessions (`localStorage`).
- `.dockerignore`.

### Modifié (constats mineurs)
- `--green-dim` éclairci (`#1a8c3a` → `#24a34a`) pour repasser le seuil de contraste WCAG AA (~5.9:1 sur `--bg3`, contre ~4.48:1 avant).
- Logique UI dédupliquée entre `setUI()`/`togglePlay()`/l'événement `playing` via `applyPlayingState()`/`applyPausedState()`.
- Magic numbers nommés (`POLL_INTERVAL_MS`, `VIS_BAR_COUNT`, `VIS_UPDATE_INTERVAL_MS`, `TICKER_SCROLL_THRESHOLD`).
- Image Docker basculée sur `nginxinc/nginx-unprivileged:1.27-alpine` (process nginx tourne en `uid=101` non-root, port interne 8080) ; `docker-compose.yml` durci (`read_only`, `tmpfs`, `cap_drop: [ALL]`, `no-new-privileges`).
