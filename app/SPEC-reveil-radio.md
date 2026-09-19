# Réveil radio — spec

> Validée le 19/09/2026. Cible : `react-native/dev`. Android seulement. Pas encore implémentée.

## Pourquoi

Un réveil qui joue Galaxy News Radio n'existe nulle part ailleurs, et c'est le seul usage où l'application bat le téléphone. Le socle est déjà là : lecture en arrière-plan, gains par station, un module natif local qui sert de patron.

**Fini quand** : téléphone posé à l'horizontale, écran éteint, application tuée depuis le sélecteur. À l'heure programmée, l'écran s'allume sur l'horloge, le son démarre et monte progressivement, et rien ne l'arrête sauf une action. Répété trois matins de suite sans y toucher.

## Ce qui est décidé

| Question | Réponse |
|---|---|
| Déclenchement visible | Écran de réveil **plein écran**, par-dessus le verrouillage |
| Repli si le flux ne répond pas | **Sonnerie d'alarme du système** (`RingtoneManager.TYPE_ALARM`) |
| Paysage | **Exclusivement l'écran horloge** — le reste de l'UI ne tourne jamais |
| Portée | Alarmes multiples, récurrentes par jour de semaine, montée de volume, snooze |
| Montée de volume | **30 s par défaut, réglable par alarme** |
| Snooze | **10 minutes, trois reports au maximum** |
| Arrêt automatique | **10 minutes** de sonnerie sans action |
| Échéance absolue | **30 minutes** après la première note, quoi qu'il arrive |

## Hors périmètre, explicitement

- iOS. Le portage n'existe pas, et `UIBackgroundModes` ne donne rien d'équivalent à `AlarmManager`.
- La cible web (`main`). Une page n'a pas de réveil.
- Le paysage sur les écrans existants : liste, réglages, annuaire, corbeille restent en portrait.
- Les alarmes uniques datées (« le 14 mars ») et les intitulés d'alarme.
- Le widget d'écran d'accueil, qui est l'autre chantier.

## Architecture : l'alarme joue son propre son

**L'alarme ne passe pas par `@rntp/player`.** Trois raisons lues dans le code :

1. `src/player/player.ts:32` — « à n'appeler qu'une fois, et sur Android seulement quand l'appli est au premier plan : le service de lecture ne peut pas démarrer en arrière-plan ». Une alarme démarre précisément sans premier plan.
2. Réveiller le runtime JS pour piloter le lecteur est le mécanisme qui a tué `react-native-track-player` v4 sur la nouvelle architecture (`HeadlessJsTaskService`, documenté dans `app/README.md` : « ne pas y revenir »).
3. `@rntp/player` v5 n'a **pas** de fondu d'entrée : `node_modules/@rntp/player/src/audio.ts:639` n'expose que `fadeOutSeconds`, et seulement pour la minuterie de veille. La montée de volume serait à écrire de toute façon.

Donc un module Expo local `modules/alarm/`, sur le patron de `modules/audio-boost/` (`expo-module.config.json`, `AlarmModule.kt`, `index.ts` en `requireOptionalNativeModule`), qui contient :

- **`AlarmScheduler`** — pose et retire les alarmes via `AlarmManager.setAlarmClock()`. Ce choix plutôt que `setExactAndAllowWhileIdle()` : c'est l'API que Doze respecte sans condition, et elle affiche l'icône de réveil dans la barre d'état, ce que l'utilisateur attend d'un réveil armé.
- **`AlarmReceiver`** — `BroadcastReceiver` réveillé à l'heure dite. Démarre le service, réarme l'occurrence suivante, et rien d'autre : son budget est de dix secondes.
- **`AlarmService`** — service de premier plan (`mediaPlayback`) qui joue le flux via **ExoPlayer sur `AudioAttributes.USAGE_ALARM`**. Le canal d'alarme ignore le mode silencieux et le volume média — c'est ce qui distingue un réveil d'une notification.
- **La montée de volume** — rampe interne au service, de 10 % à 100 % du volume cible, par pas de 500 ms. On ne touche pas au volume système, qu'on n'a pas le droit de laisser modifié.
- **Le repli** — si le flux n'a pas produit de son au bout de **10 secondes** (réseau coupé, station morte, DNS), bascule sur `RingtoneManager.getDefaultUri(TYPE_ALARM)` en boucle. Le réveil sonne toujours : c'est la seule garantie qui compte vraiment.

Le lecteur normal reste intact. Quand l'utilisateur arrête l'alarme et ouvre l'application, l'alarme relâche l'audio et `usePlayback` reprend la main sur la station s'il veut continuer d'écouter.

## Permissions ajoutées

| Permission | Pourquoi | Piège |
|---|---|---|
| `USE_EXACT_ALARM` | Poser une alarme exacte (Android 13+) | Réservée aux applis dont le réveil est une fonction principale — notre cas. Google Play le vérifie, sans effet ici puisque l'APK ne passe par aucun store. |
| `SCHEDULE_EXACT_ALARM` | Même chose sur Android 12 | À déclarer pour la 12, où elle peut être révoquée par l'utilisateur : le vérifier à l'exécution. |
| `USE_FULL_SCREEN_INTENT` | Écran de réveil par-dessus le verrouillage | Accordée d'office aux applis de réveil et d'appel depuis Android 14, mais vérifiable : dégrader en notification si elle manque. |
| `RECEIVE_BOOT_COMPLETED` | Réarmer après redémarrage | **Sans elle, toutes les alarmes disparaissent au reboot**, en silence. C'est le défaut classique du réveil fait maison. |
| `POST_NOTIFICATIONS` | Notification du service et de l'alarme | Android 13+, à demander à l'exécution. Jamais demandée jusqu'ici. |
| `WAKE_LOCK` | Tenir le CPU le temps que le son démarre | Implicite via le service, à déclarer explicitement. |

## L'écran horloge

`app.json` passe de `"orientation": "portrait"` à `"default"`, et **l'application décide elle-même** : un `useWindowDimensions()` dans `App.tsx` bascule sur `<AlarmClock />` quand la largeur dépasse la hauteur. Les écrans existants ne voient jamais le paysage, puisqu'ils ne sont pas rendus dans ce mode — aucune régression possible sur l'existant.

Contenu : l'heure en très grand (`FONT_DISPLAY`, palette courante), la date, la prochaine alarme (« RÉVEIL 07:00 · LUN-VEN »), la station qu'elle jouera, et l'accès à la liste des alarmes. L'écran reste allumé dans ce mode (`expo-keep-awake`) et s'atténue après une minute sans contact : c'est une horloge de chevet.

`src/ui/Clock.tsx` ne bouge pas — l'en-tête garde son horloge à secondes ; le nouvel écran a d'autres besoins.

## Données

Une clé de plus dans `src/store/storage.ts`, sur le modèle existant :

```ts
export const KEY_ALARMS = 'alarms';

/** Réglés une fois pour toutes, pas par alarme : un réveil se règle à l'heure, pas en options. */
export const SNOOZE_MINUTES = 10;
export const SNOOZE_MAX = 3;
export const AUTO_STOP_MINUTES = 10;
/** Plus rien ne sonne passé ce délai depuis la première note, reports compris. */
export const GIVE_UP_MINUTES = 30;
export const RAMP_SECONDS_DEFAULT = 30;

type Alarm = {
  id: string;
  hour: number;        // 0-23
  minute: number;      // 0-59
  days: number[];      // 0 = dimanche ... 6 = samedi ; [] = une seule fois
  stationUrl: string;  // doit exister dans la bibliothèque au déclenchement
  enabled: boolean;
  rampSeconds: number; // 30 par défaut, 0 = démarrage à plein volume
};
```

**Le compteur de reports vit dans le service, pas dans l'alarme** : il se remet à zéro à chaque déclenchement. Une alarme reportée trois fois n'en garde aucune trace le lendemain.

**Le natif doit lire ces alarmes sans le JS** : au redémarrage du téléphone, personne ne monte l'application. AsyncStorage est un SQLite dont le format interne n'est pas un contrat, donc le module natif tient **sa propre copie** dans des `SharedPreferences`, réécrite par le JS à chaque modification. Une seule direction, jamais de synchronisation à deux sens.

## Jalons

1. **Ça sonne.** Une alarme, une station, sans récurrence ni rampe : `AlarmScheduler` + `AlarmReceiver` + `AlarmService` + repli sonnerie. Vérifié application tuée, écran éteint. C'est 80 % du risque technique.
2. **Réarmement et récurrence.** Jours de semaine, occurrence suivante, `RECEIVE_BOOT_COMPLETED`.
3. **L'écran de réveil.** Plein écran par-dessus le verrouillage, ARRÊTER / SNOOZE (10 min, trois fois), arrêt automatique à 10 min, échéance absolue à 30 min, dégradation en notification si la permission manque.
4. **L'horloge de chevet.** Bascule paysage, habillage, prochaine alarme, liste des alarmes et son bouton `+`.
5. **Finitions.** Montée de volume et son réglage par alarme, gain par station appliqué au réveil.

## Modes d'échec, et ce qu'on en fait

| Échec | Conséquence | Parade |
|---|---|---|
| Flux mort à 7 h | Le réveil ne sonne pas | Repli sonnerie système à 10 s — **la garantie centrale** |
| Optimisation de batterie du constructeur (Xiaomi, Samsung, Oppo) | L'alarme ne part jamais | `setAlarmClock()` est la seule API exemptée ; prévoir un écran d'aide vers l'exclusion de batterie, et le dire dans le README |
| Reboot nocturne (mise à jour système) | Alarmes perdues | `RECEIVE_BOOT_COMPLETED`, jalon 2 |
| Permission plein écran refusée | Le son part, l'écran reste noir | Notification d'alarme à la place ; jamais d'échec silencieux |
| Station supprimée de la bibliothèque | Alarme orpheline | Repli sonnerie, et l'alarme se signale comme cassée dans la liste |
| Deux sources audio (alarme + lecteur) | Cacophonie | L'alarme arrête `@rntp/player` avant de jouer |

**Rollback** : tout est additif — un module local, un écran, une clé de stockage. Retirer `modules/alarm/` et la bascule paysage rend l'application d'aujourd'hui, à l'identique. Les alarmes stockées deviennent des octets inertes.

## Le cycle d'une sonnerie, minuté

C'est le point où les réglages se rencontrent, et il vaut d'être écrit une fois pour toutes :

1. L'heure arrive. Le son monte de 10 % à 100 % sur **30 s** (réglable par alarme, 0 = plein volume tout de suite).
2. Personne ne touche à rien : l'alarme se tait au bout de **10 minutes** de sonnerie.
3. SNOOZE : silence **10 minutes**, puis nouvelle sonnerie, rampe comprise. **Trois reports au maximum.**
4. **Et par-dessus tout ça, une échéance : 30 minutes après la première note, l'alarme s'arrête définitivement**, qu'elle sonne ou qu'elle soit en report. Un téléphone qui insiste une heure dans une maison vide n'a réveillé personne et a vidé sa batterie.

Les trois premières règles disent le rythme, la quatrième dit la fin. Elles ne sont pas redondantes : sans l'échéance, trois reports de dix minutes plus quatre sonneries de dix font soixante-dix minutes.

**Conséquence à assumer : les trois reports ne tiennent pas toujours dans la fenêtre.** Report immédiat dès la première note, l'alarme repart à T+10, T+20, T+30 — le troisième est coupé net par l'échéance. Laisser sonner, c'est pire : la première sonnerie mange dix minutes, et il ne reste la place que pour un report complet. Trois reste le plafond, pas une promesse.

**Ce que l'écran doit montrer**, sinon l'arrêt paraît arbitraire : le bouton SNOOZE disparaît dès que le prochain report dépasserait l'échéance, plutôt que d'accepter un report qui sera tronqué. Et le dernier report possible s'annonce comme tel (« DERNIER REPORT »).

L'échéance se matérialise côté natif par un `AlarmManager` de secours posé à T+30 au premier déclenchement : le service peut être tué et relancé entre-temps, un simple `Handler.postDelayed()` ne survivrait pas à ça.

## Ajouter une alarme

La liste vit dans l'écran horloge (mode paysage) : une ligne par alarme — heure, jours, station, interrupteur — et un bouton **`+`** en pied de liste, sur le modèle du `AddStation` existant en pied de la liste des stations. Créer une alarme demande trois choses et pas une de plus : l'heure, les jours, la station. La rampe est un réglage replié, à 30 s tant qu'on n'y touche pas.

Supprimer se fait par la même logique que les stations masquées : pas de confirmation modale, un geste réversible.
