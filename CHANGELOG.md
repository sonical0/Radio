# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Les entrées sont
datées plutôt que numérotées : le site n'a pas de version, il est déployé en continu. Seule
l'application Android en a une, taguée dans le dépôt (`v1.0.1` à `v1.4.0`) et publiée en
release.

Ordre : **entrée la plus récente en tête**. Plusieurs passes le même jour sont
suffixées `(2)`, `(3)`… la plus haute étant la plus récente (même convention que
`TANDEM_LOG.md`).

## 2026-09-23 (6) — site, la couleur d'écran libre

### Ajouté
- **Un cinquième écran, LIBRE**, avec un curseur de teinte : le Pip-Boy de Fallout 4 laisse
  régler sa couleur, ce que les quatre écrans fixes ne permettaient pas. La page se recolore
  pendant le geste ; le choix s'écrit quand on lâche le curseur.
- **Toute la palette est calculée depuis la teinte**, avec les exigences des écrans fixes. La
  luminosité est montée jusqu'au contraste visé plutôt que fixée : à luminosité égale, un bleu
  pur est trois fois plus sombre à l'œil qu'un vert, et un Pip-Boy bleu nuit serait illisible.
  Texte principal à 11:1 (le niveau de l'ambre, l'écran fixe le moins contrasté), texte
  secondaire à 5,5:1 — vérifié sur les 360 teintes.
- Réappliquée avant le premier rendu, comme les écrans fixes : la palette calculée est
  stockée entière, et le script de l'en-tête la recopie sans refaire le calcul, en contrôlant
  chaque nom et chaque valeur.

### Vérifié
- Edge sans interface : choix de LIBRE, teintes 0 et 240, rechargement (couleur posée dès
  l'analyse du document, sans passage par le vert), retour à l'ambre (variables retirées),
  stockage corrompu (valeur injectée ignorée, page intacte), panneau à 360 px ; aucune erreur.
- La capture a trouvé un défaut, corrigé : le curseur restait à 90 px de large, la règle
  globale des curseurs l'emportant sur sa classe.
- Premier réglage du contraste principal à 13:1, redescendu à 11 après mesure des écrans
  fixes (11,2 à 19,2:1) : à 13, les rouges et les bleus tournaient au pastel.

## 2026-09-23 (5) — site, le temps d'écoute

Repris de l'écran STATS de [kleeamp](https://github.com/cliamp/kleeamp).

### Ajouté
- **Un volet « Temps d'écoute »** sous l'historique des titres, sur le même patron : replié, il
  n'affiche que le total du jour. Ouvert : totaux du jour, de 7 et de 31 jours ; un
  histogramme des 31 derniers jours (aujourd'hui en surbrillance, chaque barre donne sa date et
  sa durée au survol, un résumé pour les lecteurs d'écran) ; les huit stations les plus
  écoutées sur la période.
- **Compté seulement quand le son sort** : ni en pause, ni pendant un tampon vide, ni pendant
  une reconnexion. Le temps est mesuré à l'horloge et non au nombre de pas, parce qu'un onglet
  en arrière-plan voit ses minuteries ralenties ; un écart de plus de 65 s (ordinateur mis en
  veille) est plafonné.
- Stocké dans ce navigateur seulement (`listenStats`), sur 31 jours glissants, et **pas dans
  l'export** : c'est l'historique du navigateur, pas une partie de la bibliothèque. Le nom de la
  station est gardé au moment de l'écoute, pour qu'une station supprimée reste lisible.
  Effacement en deux temps, comme l'historique.

### Vérifié
- Edge sans interface piloté par `puppeteer-core`, avec 31 jours d'historique fictif : entrée
  hors fenêtre et date invalide écartées au chargement ; environ 16 s de lecture réelle
  comptées 15,5 s, rien pendant 11 s de pause ; volet rendu (31 barres, trois stations dont une
  supprimée) à 700 et 360 px sans débordement ; écriture différée vidée ; effacement en deux
  appuis ; aucune erreur de script.
- La mesure a trouvé un défaut, corrigé : comptées au seul pas de 5 s, ces 16 s n'en faisaient
  que 10 — la seconde de départ et la fin avant la pause se perdaient. Les évènements `playing`,
  `pause` et `waiting` de l'élément bornent désormais le chronomètre.

## 2026-09-23 (4) — site, la pochette aussi dans la page

### Ajouté
- La pochette validée pour la Media Session s'affiche aussi **à côté du nom de la station**,
  sur une plaque carrée de 52 px. Elle n'apparaissait que dans les contrôles média du système.
- **Repassée à la couleur de l'écran** : une image en couleurs jurerait au milieu d'un Pip-Boy
  monochrome. Niveaux de gris, puis la teinte d'accent en `multiply` : les clairs prennent la
  couleur de l'écran, les sombres virent au noir. Le fond de plaque est teinté lui aussi, pour
  qu'un logo sombre sur fond transparent ne se perde pas dans le noir. Image entière dans la
  plaque (`contain`) : beaucoup sont des bandeaux, qu'un recadrage carré couperait.
- Seulement pour la station sélectionnée. Afficher celles de toute la liste ferait contacter
  l'hôte de chaque station sans qu'on l'écoute.

### Vérifié
- Edge sans interface piloté par `puppeteer-core` : captures du bloc dans les quatre couleurs
  d'écran, plaque cachée pour une station sans image, réaffichée aussitôt au retour sur une
  station déjà validée, cachée à l'arrêt ; aucun débordement à 360 px, aucune erreur de script.

## 2026-09-23 (3) — site, parcourir l'annuaire par pays et par genre

Chercher suppose de savoir quoi taper. Repris de [cliamp](https://github.com/bjarneo/cliamp)
(`docs/radio.md`), adapté à une page.

### Ajouté
- **◉ PAYS** : les 244 pays de l'annuaire avec leur nombre de stations, **en français**
  (`Intl.DisplayNames` ; l'API les donne en anglais), filtrables à la frappe sans accent ni
  casse (« emirats » trouve les Émirats arabes unis). ☆/★ épingle un pays, qui remonte en tête
  et le reste d'une visite à l'autre.
- **# GENRES** : les 500 tags les plus portés, du plus au moins courant, filtrables de même.
  Choisir « rock » ne ramène pas « classic rock » (`tagExact`) ; les doublons de casse et les
  tags vides sont écartés — l'index est rempli par les contributeurs, pas par une taxonomie.
- **TRI** : plus écoutées (défaut, l'ordre d'avant), plus votées, tendance, par nom, au
  hasard. Il vaut pour la recherche comme pour le parcours, relance la dernière requête quand
  il change, et se retient. Chaque ordre porte son sens : le nom de A à Z, les compteurs du
  plus grand au plus petit.
- Parcourir ramène 40 stations au lieu des 15 d'une recherche : on choisit parmi beaucoup,
  la liste défile. En tête des résultats, ce qui a été demandé : « Norvège · par nom · 40 ».
- **Repli de miroir** : toutes les requêtes passent par `rbFetch()`, qui retente sur
  `de1.api.radio-browser.info` quand le nom tournant `all.api` ne répond pas, et s'en
  souvient. Un seul miroir figure encore sur `/json/servers` : le repli ne couvre que la panne
  du nom tournant lui-même, pas celle du service.

### Vérifié
- Chromium, page servie en local : liste des pays en français, filtre sans accent, épinglage
  persistant, Norvège (40 stations, `countrycode=NO`), passage au tri par nom (requête relancée
  en `order=name&reverse=false`), genres (« jazz », `tagExact=true`), Échap qui referme et rend
  le focus au bouton, recherche avec `all.api` bloqué (servie par `de1`). Aucune erreur de
  script.
- Mise en page mesurée dans une iframe à 300, 360 et 700 px : aucun débordement horizontal.
  La mesure a trouvé un défaut, corrigé : sur téléphone, « TRI » restait en bout de ligne et
  son menu passait seul à la ligne suivante. Les deux sont maintenant groupés
  (`.rb-order-wrap`) et passent à la ligne ensemble.

## 2026-09-23 (2) — site, la pochette des stations de l'annuaire

### Ajouté
- **Une station ajoutée depuis l'annuaire garde sa fiche** : `uuid` (le `stationuuid` de
  Radio-Browser) et `favicon`, validés par `normalizeStation()`, persistés et exportés. Jusqu'ici
  on ne gardait que le nom, l'URL et le pays.
- **Pochette dans la Media Session** : notification, écran verrouillé, contrôles média du
  navigateur. Le favicon n'est retenu que s'il se charge vraiment et fait au moins 64 px — une
  bonne part de l'annuaire, ce sont des `.ico` de 16 px ou des liens morts ; sinon l'icône
  Pip-Boy reste. Il est proposé **seul** : à côté de l'icône SVG de 512 px, le navigateur
  prendrait toujours la plus grande. Chargé en même temps que le son, jamais avant.
- **Les écoutes sont signalées à Radio-Browser** (`/json/url/{uuid}`), une fois par station et
  par chargement de page : c'est le compteur par lequel l'annuaire trie — celui-là même que la
  recherche utilise — et l'usage qu'il demande à ses clients.
- **Rattrapage des stations ajoutées avant** : une station custom sans `uuid` est cherchée une
  fois par son URL de flux (`/json/stations/byurl`) quand on l'écoute, et sa fiche est
  enregistrée si l'annuaire la connaît.

### Changé
- La CSP ouvre `img-src` à `https:` (balise de la page et `nginx.conf`), pour ces pochettes
  seulement. Polices et icône restent embarquées.
- La section vie privée des deux README le dit : l'URL d'une station ajoutée à la main part
  une fois vers Radio-Browser, et l'hôte de l'image voit l'adresse IP.

### Pas porté
- L'`og:image` et l'`apple-touch-icon` de la page d'accueil, que cherche kleeamp : un
  navigateur ne peut pas lire une page tierce sans en-tête CORS.
- L'application ignore encore ces deux champs : une sauvegarde qui passe par elle les perd, et
  le rattrapage les rend à la prochaine écoute.

### Vérifié
- Chromium, page servie en local : ajout depuis l'annuaire (fiche stockée), lecture (pochette
  120×120 de la station dans la Media Session, écoute signalée une fois), station sans fiche
  (retrouvée par son URL, fiche enregistrée, pochette affichée), favicon `.ico` trop petit
  (écarté, icône Pip-Boy conservée).

## 2026-09-23 — site, une reconnexion qui ne renonce plus au premier tunnel

Même politique que l'application le même jour (branche `react-native/dev`).

### Modifié
- **Les essais s'espacent au lieu de s'arrêter après trois** : 1, 2, 4, 8, 15 s, puis toutes
  les 30 s tant que l'utilisateur n'a pas arrêté. Le statut de la station numérote l'essai
  (« ⚠ RECONNEXION… 4 ») pour qu'une attente longue ne passe pas pour un gel.
- **La nature de l'erreur décide du nombre d'essais** (`retryBudget()`). Réseau ou inconnue :
  sans fin. `source` (404, mais aussi 502 passager) : trois. Décodeur en panne ou lecture
  refusée par le navigateur : aucun. Les erreurs fatales de hls.js sont typées de même.
- **Hors ligne, tout compte comme réseau.** Un flux injoignable s'y signale en code 4, comme un
  format illisible : sans cette règle, une coupure réseau aurait épuisé le budget `source` et
  abandonné au bout de trois essais.
- Une même coupure remonte souvent deux fois (rejet de `play()`, puis `error` de l'élément) :
  tant qu'un essai est en attente, le verdict le plus sévère l'emporte.
- **Chien de garde de 20 s sur le tampon** : un flux qui garde la connexion ouverte sans plus
  rien livrer reste en `waiting` sans erreur ; il est désormais relancé.
- **Essai immédiat au retour du réseau** (évènement `online`), au lieu d'attendre la fin d'un
  délai qui peut atteindre 30 s.

### Corrigé
- **Changer de station avant que la précédente ait démarré effaçait la nouvelle.** Le rejet
  `AbortError` du premier `play()`, interrompu par le second chargement, passait pour une panne :
  la nouvelle station jouait, mais l'écran affichait « <ancienne> — UNAVAILABLE » et plus rien
  n'était sélectionné. Reproduit 3 fois sur 3 sur la version précédente, 0 sur 3 après.

### Vérifié
- Chromium, page servie en local, pannes simulées en remplaçant l'URL d'une station en cours
  de lecture : `source` en ligne → trois essais (1, 2, 4 s) puis « FLUX INTERROMPU » ; hors
  ligne → essais sans abandon, puis reprise 0,7 s après `online` au lieu d'attendre 8 s ;
  `currentTime` figé en `waiting` → reconnexion à 20 s, lecture reprise 2 s plus tard ;
  changement rapide de station, comparé à la version précédente.

## 2026-09-22 — le site rattrape l'application

L'application a pris trois versions d'avance en trois jours (v1.2.0 à v1.4.0). Ce qui, de
ces ajouts, tient dans un navigateur est porté ici ; ce qui n'y tient pas est dit plus bas
plutôt que tenté à moitié.

### Ajouté — la recherche dans la liste de stations
- Un champ de filtre au-dessus de la liste, révélé à partir de **huit stations visibles**.
  Il cherche dans les noms et les groupes, accents et casse neutralisés (`normalizeSearch()`) :
  « crème » se trouve en tapant « creme ».
- **Il ne filtre que l'affichage.** `stepStation()` continue de parcourir toute la
  bibliothèque, donc le zapping ne s'arrête pas aux résultats d'une recherche qu'on a oublié
  d'effacer. Même choix que dans l'application.
- Le champ vit **hors de `#stations-wrap`**, que `buildStationList()` vide à chaque frappe :
  à l'intérieur, il perdait le focus à la première lettre. Il reste affiché tant qu'une
  recherche est en cours, même sous le seuil — sinon une recherche ramenant moins de huit
  stations deviendrait impossible à effacer.
- Le `<datalist>` des groupes du formulaire d'ajout et le seuil d'affichage se lisent sur la
  bibliothèque entière, pas sur la liste filtrée.

### Ajouté — l'historique des titres
- Ce que chaque station a joué, horodaté et cherchable, dans un volet dépliable sous la
  liste, sur le patron de la corbeille. **600 titres au total, 200 par station** — mêmes
  plafonds et **même clé de stockage (`titleHistory`) que l'application**, le second
  empêchant une station bavarde d'évincer toutes les autres.
- Le crochet est posé sur `applyMeta()`, point de passage unique de tous les titres captés :
  le sondage groupé comme le rattrapage d'une seule station. La page sondait déjà toutes les
  stations visibles toutes les trente secondes et jetait tout au titre suivant.
- Les écritures sont différées de 3 s et vidées quand l'onglet part (`pagehide`) ou passe en
  arrière-plan : un tour de sondage rapporte jusqu'à quarante titres, qui feraient quarante
  écritures.
- Le volet est construit une fois et seul son contenu est re-rendu — le recréer le replierait
  et viderait son champ de recherche toutes les trente secondes — et **replié, il ne rend que
  son compteur**. Les lignes sont construites en DOM, jamais en `innerHTML` : ces titres
  viennent de serveurs tiers.
- **L'effacement se confirme.** C'est la seule action de la page qui détruise quelque chose
  d'irrécupérable ; la corbeille, elle, rend les stations.

### Changé — le fichier de sauvegarde passe en v2
- L'application y a mis les réveils le 20/09 : `{ version, stations, alarms }` au lieu du
  simple tableau. La page écrit désormais cette forme et **relit les deux**, plus l'objet
  isolé qu'elle acceptait déjà. Une sauvegarde faite sur le téléphone s'ouvre ici, et
  l'inverse.
- **Les réveils traversent la page sans être lus.** Elle n'en a pas et n'en aura pas, mais
  les conserver sous la clé de l'application (`alarms`), fusionnés par `id`, évite qu'un
  export fait depuis le navigateur ampute la sauvegarde de qui s'en sert pour changer de
  téléphone.

### Pas porté, et pourquoi
- **Le réveil radio.** Il n'a de valeur que par ses garanties : sonner application fermée et
  écran éteint, ignorer le mode silencieux, se réarmer après un redémarrage, retomber sur la
  sonnerie système quand la station est morte. Un navigateur n'en offre aucune — un onglet
  fermé ne sonne pas, et la politique d'autoplay peut refuser le son. Un réveil qui échoue
  une nuit sur dix est pire que pas de réveil.
- **Le widget d'écran d'accueil** et **l'amplification en dB** : hors de portée d'une page,
  pour les raisons déjà écrites ici les 19 et 20/09.
- La **vérification de mise à jour** n'a pas d'objet : la page est servie, pas installée.

### Vérifié
- Chromium, page servie en local : filtrage (1 résultat sur « diamond », 0 et son message sur
  une chaîne absente, insensibilité à la casse), focus rendu au champ après effacement,
  historique (doublon consécutif ignoré, recherche sans accent, effacement en deux temps,
  persistance après rechargement), import v1 puis v2 sans doublon de station ni de réveil, et
  export relu : `version: 2`, 2 stations, 2 réveils transportés. Aucune erreur de console.

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
