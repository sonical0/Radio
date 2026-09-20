package expo.modules.playerwidget

import android.content.Context
import android.media.AudioManager
import android.view.KeyEvent

/**
 * Les boutons du widget, en touches media.
 *
 * La session du lecteur traite play/pause et le zapping en natif : tout
 * repond meme quand le runtime JS ne tourne plus, exactement comme un casque
 * Bluetooth.
 *
 * Ca n'a pas toujours ete vrai. Tant que la file du lecteur ne contenait
 * qu'une piste, media3 abandonnait KEYCODE_MEDIA_NEXT avant meme d'atteindre
 * le lecteur, et le widget devait passer par l'application pour zapper. Depuis
 * que la file porte toute la bibliotheque (voir src/player/player.ts), le
 * chemin natif fonctionne et ce detour a ete retire.
 *
 * Limite : sans rien qui joue, il n'y a aucune session a qui parler, donc
 * aucun effet. Il n'y a alors aucune station a quitter non plus.
 */
object PlayerCommands {

  fun playPause(context: Context) = send(context, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE)

  fun next(context: Context) = send(context, KeyEvent.KEYCODE_MEDIA_NEXT)

  fun previous(context: Context) = send(context, KeyEvent.KEYCODE_MEDIA_PREVIOUS)

  private fun send(context: Context, code: Int) {
    val audio = context.getSystemService(AudioManager::class.java) ?: return
    // Deux evenements : une touche physique descend puis remonte, et une
    // session qui n'en recoit qu'un seul peut ignorer l'appui.
    audio.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, code))
    audio.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_UP, code))
  }
}
