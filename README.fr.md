[English](./README.md) · **Français**

# Fallout Radio — application Android

Le portage React Native du [lecteur web](https://github.com/sonical0/Radio/tree/main) : les
onze stations des jeux Fallout, les flux que tu ajoutes, et un annuaire de ~50 000 autres —
qui continuent de jouer en arrière-plan, avec les contrôles de l'écran verrouillé.

**▶ [Télécharger l'APK](https://github.com/sonical0/Radio/releases)** — version 1.1.1, signée,
installée et utilisée sur téléphone. Android seulement ; iOS demanderait un Mac pour compiler.

## Ce qu'elle fait et que la page ne peut pas

**Elle amplifie.** Un navigateur ne dépasse pas `volume = 1` : une station diffusée quinze
décibels sous les autres ne peut être rattrapée qu'en *baissant tout le reste*, ce qui rend le
lecteur entier plus faible que le téléphone. Un module natif local ajoute le gain manquant :
+11 dB sur Mojave Music Radio, +13 sur Radio New Vegas, mesurés l'un et l'autre.

**Elle lit le titre dans le flux.** Presque tous les serveurs Icecast et Shoutcast intercalent
le morceau en cours dans l'audio lui-même (ICY). Le lecteur natif le lit : même une webradio
prise dans l'annuaire, sans le moindre endpoint de métadonnées, affiche ce qui passe. Depuis un
navigateur, la même sonde répond sur **0 station sur 12** — l'en-tête CORS n'y est tout
simplement pas. En natif, 3 sur 7 répondent.

Pour le reste, la parité avec le site est atteinte : groupes, gain par station, corbeille,
ajout manuel, import/export, minuterie de veille, recherche dans l'annuaire, et l'habillage
Pip-Boy avec ses quatre couleurs d'écran.

## Compiler soi-même

```bash
cd app
npm install
npm run android    # appareil ou émulateur ; dev build, pas Expo Go
npm run web        # le même code dans un navigateur
```

L'APK signé sort de `cd android && ./gradlew assembleRelease`. Le trousseau est
volontairement hors du dépôt : cette commande réclame le tien.

**Lire [`app/README.md`](./app/README.md) avant de toucher aux dépendances ou au build.**
C'est la vraie documentation de cette branche : ce qu'a livré chaque jalon, pourquoi le lecteur
est `@rntp/player` v5 et non `react-native-track-player` v4, comment les gains ont été
mesurés, et les trois pièges Windows qui ont coûté le plus cher — le chemin du SDK qui ne doit
pas contenir d'espace, le JDK 17 obligatoire, et la limite des 260 caractères que
`LongPathsEnabled` ne lève **pas**.

## Ce qu'il y a d'autre sur cette branche

`index.html`, `stations.json`, `Dockerfile` et le reste du site sont ici en **copie de
`main`**, tenue alignée pour que les deux cibles partagent une seule liste de stations. Ils
sont documentés sur `main`, pas ici, et ils voyagent d'une branche à l'autre par
`cherry-pick` — jamais en recopiant un fichier depuis une autre branche, ce qui a déjà annulé
en silence trois fonctionnalités du site.

`react-native/dev` porte le travail ; `react-native/main` ne reçoit que ce qui a tourné sur
un vrai appareil.

## Licence

[MIT](./LICENSE) pour le code de ce projet. `@rntp/player` est gratuit pour un usage
personnel ou éducatif et demande une licence pour un usage commercial — ce projet est perso,
c'est la seule raison pour laquelle il est en règle.

## Flux

Ce projet ne diffuse ni n'héberge aucun audio. C'est un lecteur : il ouvre des URL publiques
servies par [fallout.radio](https://fallout.radio/), plus celles que l'utilisateur ajoute. Les
musiques des jeux appartiennent à Bethesda Softworks et à leurs ayants droit respectifs, et
leur diffusion relève de qui opère ces flux, pas de ce dépôt — qui contient des URL et aucun
fichier audio. Si une station se tait, elle s'est tue à la source.

## Données

Pas de compte, pas d'analytics, pas de cookie, pas de serveur à moi. Tout ce que tu
configures — stations, groupes, gains, couleur d'écran — reste dans le stockage de
l'application sur l'appareil et n'est envoyé nulle part ; l'export est un fichier que tu
partages toi-même. L'application demande trois permissions, `FOREGROUND_SERVICE`,
`FOREGROUND_SERVICE_MEDIA_PLAYBACK` et `MODIFY_AUDIO_SETTINGS`, toutes les trois pour jouer
du son en arrière-plan — ni contacts, ni position, ni stockage. Deux tiers voient en revanche
ton adresse IP pendant que tu t'en sers : le serveur de la station que tu écoutes
(fallout.radio, ou celle que tu as ajoutée), et l'API Radio-Browser quand tu cherches dans
l'annuaire. Le téléphone leur parle directement, rien ne passe par moi. Leurs politiques
s'appliquent. Ce projet n'en a pas, puisqu'il ne collecte rien.

Fallout est une marque de Bethesda Softworks. Projet de fan, sans affiliation.
