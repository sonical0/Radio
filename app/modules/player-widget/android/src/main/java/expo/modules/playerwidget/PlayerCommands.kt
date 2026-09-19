package expo.modules.playerwidget

import android.content.Context
import android.media.AudioManager
import android.view.KeyEvent

/**
 * Play/pause, et rien d'autre.
 *
 * Une touche media va directement a la session du lecteur, qui traite
 * play/pause en natif : ca repond meme quand le runtime JS est mort, sans
 * permission et sans reveiller quoi que ce soit.
 *
 * Zapper ne peut pas emprunter ce chemin. Trois tentatives mesurees sur
 * emulateur le 20/09/2026, toutes sans effet : la touche KEYCODE_MEDIA_NEXT
 * (media3 la traduit en seekToNext(), que le lecteur ne surcharge pas), la
 * commande de session trackplayer.seek_to_next (son gestionnaire appelle le
 * lecteur brut et court-circuite le ForwardingPlayer, en acquittant
 * "succes"), et seekToNextMediaItem() sur un controleur (media3 l'abandonne
 * cote client des que la file n'a pas de piste suivante). La file n'en aura
 * jamais : une radio n'est pas une playlist. Le zapping passe donc par
 * WidgetBridge.
 */
object PlayerCommands {

  fun playPause(context: Context) {
    val audio = context.getSystemService(AudioManager::class.java) ?: return
    // Deux evenements : une touche physique descend puis remonte, et une
    // session qui n'en recoit qu'un seul peut ignorer l'appui.
    audio.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE))
    audio.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE))
  }
}
