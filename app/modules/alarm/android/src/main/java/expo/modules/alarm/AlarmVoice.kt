package expo.modules.alarm

import android.content.Context
import android.speech.tts.TextToSpeech
import android.util.Log
import java.util.Locale

private const val TAG = "AlarmVoice"

/**
 * La voix du réveil : l'heure annoncée, la météo en cache.
 *
 * Les deux réglages vivent en SharedPreferences pour la même raison que la
 * liste d'alarmes : au déclenchement, le runtime JS n'est pas forcément monté.
 */
object AlarmVoice {
  private const val PREFS = "fallout_radio_alarm_voice"
  private const val KEY_ANNOUNCE = "announce"
  private const val KEY_WEATHER = "weather"

  private var tts: TextToSpeech? = null
  private var ready = false
  /** Ce qu'on a demandé à dire avant que le moteur ait fini de s'initialiser. */
  private var queued: String? = null

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun setAnnounce(context: Context, enabled: Boolean) {
    prefs(context).edit().putBoolean(KEY_ANNOUNCE, enabled).apply()
  }

  fun announceEnabled(context: Context): Boolean = prefs(context).getBoolean(KEY_ANNOUNCE, false)

  fun setWeather(context: Context, text: String?) {
    val trimmed = text?.trim().orEmpty()
    prefs(context).edit().apply {
      if (trimmed.isEmpty()) remove(KEY_WEATHER) else putString(KEY_WEATHER, trimmed)
    }.apply()
  }

  /** La météo en cache, ou null : l'écran de sonnerie n'affiche rien dans ce cas. */
  fun weather(context: Context): String? = prefs(context).getString(KEY_WEATHER, null)

  @Synchronized
  fun speak(context: Context, text: String) {
    if (text.isBlank()) return
    val engine = tts
    if (engine != null && ready) {
      engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, "alarm")
      return
    }
    queued = text
    if (engine != null) return
    tts = TextToSpeech(context.applicationContext) { status -> onInit(status) }
  }

  @Synchronized
  private fun onInit(status: Int) {
    val engine = tts ?: return
    if (status != TextToSpeech.SUCCESS) {
      Log.w(TAG, "synthèse vocale indisponible : " + status)
      shutdown()
      return
    }
    val lang = engine.setLanguage(Locale.FRANCE)
    if (lang == TextToSpeech.LANG_MISSING_DATA || lang == TextToSpeech.LANG_NOT_SUPPORTED) {
      Log.w(TAG, "voix française absente")
    }
    ready = true
    queued?.let { engine.speak(it, TextToSpeech.QUEUE_FLUSH, null, "alarm") }
    queued = null
  }

  @Synchronized
  fun shutdown() {
    tts?.shutdown()
    tts = null
    ready = false
    queued = null
  }
}
