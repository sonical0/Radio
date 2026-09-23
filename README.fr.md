[English](./README.md) · **Français**

# Fallout Radio

Un lecteur de radio en ligne au look Pip-Boy. Les onze stations des jeux Fallout sont
livrées avec, n'importe quel flux web s'y ajoute, et un annuaire d'environ 50 000 stations
est intégré à la recherche.

Pas d'étape de build, pas de gestionnaire de paquets, pas de framework. On sert le dossier,
ça tourne.

**▶ [sonical0.github.io/Radio](https://sonical0.github.io/Radio/)**

![Le lecteur réglé sur Diamond City Radio, avec le titre en cours affiché pour chaque station](docs/screenshot.png)

## Fonctionnalités

- **Les onze stations Fallout** — Fallout 3, New Vegas, 4 et 76 — avec le titre en cours
  pour chacune.
- **N'importe quel flux.** MP3, AAC, Ogg Vorbis, Opus et FLAC se lisent tels quels. Les
  playlists M3U et PLS sont résolues vers une URL directe. HLS (`.m3u8`) fonctionne aussi,
  c'est ce que diffusent la plupart des grandes radios.
- **Métadonnées sans configuration.** Colle l'URL d'un flux AzuraCast et le titre apparaît
  tout seul : l'endpoint de l'API est déduit de l'URL. Les serveurs Icecast se renseignent
  à la main.
- **Un annuaire intégré.** Cherche sur [Radio-Browser](https://www.radio-browser.info/) par
  nom ou par genre, ou parcours-le par pays (épingle ceux que tu reviens chercher) ou par
  genre, trié par écoutes, votes, tendance, nom ou au hasard — et ajoute une station en un
  clic.
- **Tes propres regroupements.** Un groupe est un libellé libre — un jeu, un genre, un
  pays — et non une liste figée.
- **Gain par station**, mesuré et non estimé : la sonie de chaque station a été relevée à
  `ffmpeg -af ebur128`, et les gains les ramènent à une cible commune.
- **Cherche dans ta liste.** Passé huit stations visibles, un champ de filtre apparaît
  au-dessus de la liste : il cherche dans les noms et les groupes, sans se soucier des
  accents ni de la casse. Il ne filtre que l'affichage — les flèches continuent de parcourir
  toute la bibliothèque.
- **Les titres passés.** La page interroge déjà les métadonnées de toutes les stations
  visibles toutes les trente secondes ; elle les garde désormais, horodatés et cherchables.
  600 titres au total, 200 par station, dans un volet dépliable sous la liste. Rien ne sort
  du navigateur, et l'effacement demande confirmation.
- **Masque les stations que tu n'écoutes pas**, y compris celles livrées avec le site. Le
  masquage est réversible : une corbeille dépliable en bas de liste les rend une par une.
- **La couleur de l'écran au choix.** Le bouton ⚙ à gauche de l'horloge fait passer le
  phosphore du vert à l'ambre, au bleu ou au blanc, comme sur un Pip-Boy — ou, comme le
  permet Fallout 4, à n'importe quelle teinte au curseur, dont toute la palette est déduite
  en restant aussi lisible que les écrans fixes. Le choix est
  mémorisé et réappliqué par un script du `<head>`, avant le premier rendu : la page ne
  clignote jamais dans la mauvaise couleur.
- **Minuterie de veille** avec fondu progressif, **touches multimédia** et contrôles depuis
  l'écran verrouillé (Media Session API), **raccourcis clavier**, et reconnexion automatique
  quand un flux tombe.
- **Import / export** de tes stations personnelles en JSON, dans le même fichier que
  l'application Android. Les réveils qu'elle y met traversent la page sans être lus ni
  perdus : exporter depuis le navigateur ne mutile pas la sauvegarde du téléphone. Le même
  bouton accepte aussi une playlist `.m3u` ou `.pls` d'un autre lecteur (VLC, Winamp,
  foobar2000…), noms, logos et groupes compris.
- **Une application Android**, en React Native, qui partage cette liste de stations. Elle fait
  deux choses que cette page ne peut pas : amplifier les stations diffusées trop bas pour être
  rattrapées en baissant les autres, et lire le titre dans le flux lui-même. Le réveil radio
  et le widget d'écran d'accueil lui sont propres, et le resteront : un onglet fermé ne sonne
  pas.
  [Télécharger l'APK](https://github.com/sonical0/Radio/releases) — le code et son propre
  README sont sur la branche `react-native/main`.
- **Rendu identique hors ligne.** Polices, favicon et bibliothèque HLS sont tous servis
  depuis le dossier : rien n'est récupéré sur un CDN au chargement.

## Démarrage rapide

```bash
python3 -m http.server 8080
# → http://localhost:8080
```

N'importe quel serveur de fichiers statiques convient. En revanche, ouvrir `index.html`
directement depuis le disque ne marche **pas** : `stations.json` est chargé en `fetch`, ce
que `file://` bloque.

### Docker

```bash
docker compose up -d --build
# → http://localhost:8080
```

nginx-unprivileged, exécuté en utilisateur non-root, avec gzip et en-têtes de sécurité.
Voir [DOCKER.md](./DOCKER.md).

## Ajouter des stations

**Depuis l'interface** — déplie *Ajouter une station* en bas de liste et colle l'URL d'un
flux, ou passe par l'annuaire. Le formulaire est replié par défaut : on s'en sert de loin en
loin, et c'est la liste des stations qu'on vient voir. Les stations personnelles vivent dans le `localStorage` : elles survivent aux
rechargements et ne quittent jamais ton navigateur.

**En dur** — ajoute une entrée à `stations.json` :

```json
{ "group": "FO4", "name": "Ma station", "url": "https://exemple.org/listen/mienne/radio.mp3" }
```

Les métadonnées sont généralement automatiques. Pour les forcer, ou pour viser un serveur
Icecast :

```json
{ "meta": { "type": "icecast", "url": "https://exemple.org/status-json.xsl" } }
```

Champs optionnels : `gain` (0–1, atténue un flux plus fort que les autres), `hls`
(nécessaire uniquement quand l'URL d'un flux HLS ne se termine pas par `.m3u8`) et `boost`
(en décibels, **ignoré ici** — un navigateur ne sait pas amplifier au-delà du maximum ;
l'application mobile, si).

## Raccourcis clavier

| Touche | Action |
| --- | --- |
| <kbd>Espace</kbd> | Lecture / pause |
| <kbd>←</kbd> <kbd>→</kbd> | Station précédente / suivante |
| <kbd>↑</kbd> <kbd>↓</kbd> | Volume |
| <kbd>M</kbd> | Muet |
| <kbd>S</kbd> | Stop |

## Comment ça marche

Tout tient dans `index.html` — styles, balisage et logique, environ 140 Ko, sans autre
dépendance que la bibliothèque HLS embarquée. Quelques décisions méritent d'être connues :

**Pas de Web Audio API.** Ce serait la façon évidente d'amplifier un flux trop discret
au-delà de `volume = 1`, et ça casse silencieusement toutes les stations :
`createMediaElementSource()` fait passer l'élément dans un graphe qui ne reçoit que du
silence pour ces flux cross-origin sans CORS. Ce sont donc les stations fortes qui sont
baissées, station par station.

**hls.js est figé et servi en local**, jamais depuis un CDN, pour que la page rende et joue
à l'identique hors ligne et sur un réseau isolé. Il passe avant le support HLS natif du
navigateur même quand celui-ci est annoncé : certains moteurs répondent `"maybe"` à
`canPlayType()` avec un support seulement partiel, et hls.js remonte des erreurs que la
logique de reconnexion sait traiter. La lecture native reste le chemin d'iOS, où MSE
n'existe pas.

**Les métadonnées butent sur CORS, pas sur l'ambition.** AzuraCast et Icecast sont les deux
seules familles à envoyer l'en-tête de façon fiable depuis un navigateur. Shoutcast v2 n'en
envoie aucun, et la plupart des opérateurs Icecast coupent leur endpoint de statut — d'où le
rôle central d'AzuraCast, déduit directement de l'URL du flux.

**La liste de stations est une vraie liste.** Chaque ligne est un `<li>` contenant un
`<button>`, et non un `<li role="button">` : ce dernier aplatit son sous-arbre et masque aux
lecteurs d'écran le curseur de gain et le bouton de suppression qu'il contient.

Les notes destinées aux contributeurs sont dans [CLAUDE.md](./CLAUDE.md) ; l'historique
complet est dans [CHANGELOG.md](./CHANGELOG.md).

## Navigateurs

Chrome, Edge, Firefox et Safari, sur ordinateur comme sur mobile. HLS passe par hls.js
partout sauf sur iOS, qui le lit nativement.

## Branches

Cette branche, `main`, est toute la cible navigateur : la page, la liste de stations, et le
Docker qui les sert. C'est elle que déploie GitHub Pages, et elle n'a aucune étape de build.

`react-native/main` et `react-native/dev` portent l'application Android, respectivement
stable et en cours. Elles gardent une copie des fichiers du site pour que les deux cibles
partagent une seule liste de stations, et leur README décrit l'application, pas cette page.

Il a existé une branche `dockerized`. Elle a été supprimée le 19/09/2026 : tous les fichiers
Docker vivent ici, et elle avait pris du retard sur chacun d'eux — elle servait un
`index.html` d'avant HLS, l'annuaire et le sélecteur de couleur, ce qui est pire que pas de
branche du tout.

## Licence

[MIT](./LICENSE) — pour le code du projet.

Le code tiers embarqué conserve ses propres conditions : `vendor/hls.light.min.js` est
[hls.js](https://github.com/video-dev/hls.js) sous Apache-2.0, avec son avis de licence dans
`vendor/hls.js-LICENSE.txt`.

## Crédits

- Flux et API de métadonnées : [fallout.radio](https://fallout.radio/)
- Annuaire de stations : [Radio-Browser](https://www.radio-browser.info/)
- Polices : [VT323](https://fonts.google.com/specimen/VT323) et
  [Share Tech Mono](https://fonts.google.com/specimen/Share+Tech+Mono), SIL Open Font License

## Flux

Ce projet ne diffuse ni n'héberge aucun audio. C'est un lecteur : il ouvre des URL publiques
servies par [fallout.radio](https://fallout.radio/), plus celles que l'utilisateur ajoute. Les
musiques des jeux appartiennent à Bethesda Softworks et à leurs ayants droit respectifs, et
leur diffusion relève de qui opère ces flux, pas de ce dépôt — qui contient des URL et aucun
fichier audio. Si une station se tait, elle s'est tue à la source.

## Données

Pas de compte, pas d'analytics, pas de cookie, pas de serveur à moi. Tout ce que tu
configures — stations, groupes, gains, couleur d'écran —, les titres passés et le temps d'écoute de chaque station restent dans le stockage local de ton
navigateur et n'est envoyé nulle part, à une exception près : l'adresse du flux d'une station
que tu as ajoutée toi-même est cherchée une fois dans l'annuaire Radio-Browser quand tu
l'écoutes, pour en trouver l'image. L'export est un fichier que tu télécharges toi-même.
Quatre tiers voient en revanche ton adresse IP pendant que tu utilises la page : le serveur
de la station que tu écoutes (fallout.radio, ou celle que tu as ajoutée), le site qui héberge
l'image de cette station quand l'annuaire en a une, l'API Radio-Browser quand tu cherches
dans l'annuaire ou écoutes l'une de ses stations (elle compte les écoutes, une par adresse et
par jour), et GitHub Pages, qui sert la page. Leurs politiques s'appliquent. Ce projet n'en a
pas, puisqu'il ne collecte rien.

Fallout est une marque déposée de Bethesda Softworks. Ce projet est un travail de fan, sans
affiliation.
