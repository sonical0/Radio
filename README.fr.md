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
  nom ou par genre, et ajoute une station en un clic.
- **Tes propres regroupements.** Un groupe est un libellé libre — un jeu, un genre, un
  pays — et non une liste figée.
- **Quatre couleurs d écran Pip-Boy** — vert, ambre, bleu ou blanc, par le bouton ⚙ à côté de l horloge. Le choix est retenu.
- **Gain par station**, pour qu'un flux plus fort que les autres ne t'arrache pas les
  oreilles au changement — sur les stations livrées aussi, sans toucher à `stations.json`.
- **Masque les stations que tu n'écoutes pas**, y compris celles livrées avec le site. Le
  masquage est réversible : une corbeille dépliable en bas de liste les rend une par une.
- **Minuterie de veille** avec fondu progressif, **touches multimédia** et contrôles depuis
  l'écran verrouillé (Media Session API), **raccourcis clavier**, et reconnexion automatique
  quand un flux tombe.
- **Import / export** de tes stations personnelles en JSON.
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

**Depuis l'interface** — colle l'URL d'un flux dans le formulaire d'ajout, ou passe par
l'annuaire. Les stations personnelles vivent dans le `localStorage` : elles survivent aux
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

Champs optionnels : `gain` (0–1, atténue un flux plus fort que les autres) et `hls`
(nécessaire uniquement quand l'URL d'un flux HLS ne se termine pas par `.m3u8`).

## Raccourcis clavier

| Touche | Action |
| --- | --- |
| <kbd>Espace</kbd> | Lecture / pause |
| <kbd>←</kbd> <kbd>→</kbd> | Station précédente / suivante |
| <kbd>↑</kbd> <kbd>↓</kbd> | Volume |
| <kbd>M</kbd> | Muet |
| <kbd>S</kbd> | Stop |

## Comment ça marche

Tout tient dans `index.html` — styles, balisage et logique, environ 108 Ko, sans autre
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

Fallout est une marque déposée de Bethesda Softworks. Ce projet est un travail de fan, sans
affiliation.
