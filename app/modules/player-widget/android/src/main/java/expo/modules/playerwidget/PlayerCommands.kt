package expo.modules.playerwidget

import android.content.ComponentName
import android.content.Context
import android.media.AudioManager
import android.os.Bundle
import android.util.Log
import android.view.KeyEvent
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaController
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.MoreExecutors

private const val TAG = "PlayerWidget"

/** Le service de lecture de `@rntp/player`, à qui la session appartient. */
private const val PLAYER_SERVICE = "com.doublesymmetry.trackplayer.TrackPlayerPlaybackService"

/**
 * Les commandes personnalisées que ce service expose. Elles sont déclarées
 * dans `TrackPlayerPlaybackService.kt` et traitées par `onCustomCommand` :
 * elles appellent `seekToNextMediaItem()`, qui est le point où le lecteur
 * relaie l'appui au JavaScript.
 */
private const val COMMAND_SEEK_TO_NEXT = "trackplayer.seek_to_next"
private const val COMMAND_SEEK_TO_PREVIOUS = "trackplayer.seek_to_previous"

/**
 * Comment le widget parle au lecteur.
 *
 * **Deux chemins, parce qu'une touche média et un bouton de notification ne
 * se valent pas.** Play/pause part en `dispatchMediaKeyEvent()` : c'est une
 * commande que la session déclare toujours disponible, elle répond même
 * quand l'application est morte, et elle ne démarre rien qui ne tourne déjà.
 *
 * Next et Previous, eux, **ne peuvent pas passer par une touche média**.
 * media3 traduit `KEYCODE_MEDIA_NEXT` par sa gestion par défaut, qui vérifie
 * d'abord que la commande « piste suivante » est disponible — et elle ne
 * l'est pas : la file ne contient qu'une seule piste, parce qu'une radio
 * n'est pas une playlist. La touche est donc rejetée avant d'atteindre le
 * code du lecteur. Le bouton de la notification, lui, envoie une commande de
 * session personnalisée, qui court-circuite cette vérification. Le widget
 * fait pareil : il se connecte à la session et envoie la même commande.
 *
 * Conséquence : zapper demande une session vivante, donc une lecture en
 * cours. Sans rien qui joue, il n'y a de toute façon aucune station à
 * quitter.
 */
@UnstableApi
object PlayerCommands {

  fun playPause(context: Context) {
    val audio = context.getSystemService(AudioManager::class.java) ?: return
    // Deux évènements : une touche physique descend puis remonte, et une
    // session qui n'en reçoit qu'un seul peut ignorer l'appui.
    audio.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE))
    audio.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE))
  }

  fun next(context: Context, onDone: () -> Unit) = send(context, COMMAND_SEEK_TO_NEXT, onDone)

  fun previous(context: Context, onDone: () -> Unit) =
    send(context, COMMAND_SEEK_TO_PREVIOUS, onDone)

  /**
   * La connexion est asynchrone et le `BroadcastReceiver` ne vit que le temps
   * de son `onReceive` : l'appelant tient la main avec `goAsync()` et c'est
   * `onDone` qui la relâche, dans tous les cas de figure — succès, session
   * absente, ou exception.
   */
  private fun send(context: Context, command: String, onDone: () -> Unit) {
    val token = SessionToken(context, ComponentName(context.packageName, PLAYER_SERVICE))
    val future = MediaController.Builder(context, token).buildAsync()
    future.addListener(
      {
        var controller: MediaController? = null
        try {
          controller = future.get()
          controller.sendCustomCommand(SessionCommand(command, Bundle.EMPTY), Bundle.EMPTY)
        } catch (e: Throwable) {
          // Rien ne joue, donc aucune session à joindre : ce n'est pas une
          // panne, il n'y a simplement pas de station à quitter.
          Log.i(TAG, "session injoignable pour " + command + " : " + e)
        } finally {
          try {
            controller?.release()
          } catch (_: Throwable) {
          }
          onDone()
        }
      },
      MoreExecutors.directExecutor(),
    )
  }
}
