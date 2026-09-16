# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Pas de versions
numérotées ni de dépôt git pour l'instant (projet livré comme fichier unique) — ce fichier
n'est donc pas commit, il sert de suivi local daté.

Ordre : **entrée la plus récente en tête**. Plusieurs passes le même jour sont
suffixées `(2)`, `(3)`… la plus haute étant la plus récente (même convention que
`TANDEM_LOG.md`).

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
