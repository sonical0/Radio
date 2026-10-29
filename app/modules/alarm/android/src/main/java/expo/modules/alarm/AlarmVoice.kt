package expo.modules.alarm

import android.content.Context
import android.media.AudioAttributes
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import java.util.Calendar
import java.util.Locale

private const val TAG = "AlarmVoice"

/**
 * La voix du réveil : l'heure annoncée, la météo en cache.
 *
 * Les deux réglages vivent en SharedPreferences pour la même raison que la
 * liste d'alarmes : au déclenchement, le runtime JS n'est pas forcément monté.
 *
 * Un seul moteur pour tout le processus. Son initialisation est asynchrone et
 * prend une à deux secondes : ce qu'on demande avant qu'il soit prêt attend
 * dans `queued`, et seul le dernier texte compte.
 */
object AlarmVoice {
  private const val PREFS = "fallout_radio_alarm_voice"
  private const val KEY_ANNOUNCE = "announce"
  private const val KEY_WEATHER = "weather"

  private val main = Handler(Looper.getMainLooper())
  private var tts: TextToSpeech? = null
  private var ready = false
  private var queued: Pending? = null
  private var counter = 0
  /** Les fins de phrase attendues, par identifiant d'énoncé. */
  private val callbacks = mutableMapOf<String, () -> Unit>()

  private class Pending(val text: String, val alarm: Boolean, val onDone: (() -> Unit)?)

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

  /**
   * « Il est 7 heures 30. » suivi de la météo s'il y en a une. Écrit en
   * toutes lettres plutôt que « 07:30 », que certains moteurs lisent
   * « zéro sept deux-points trente ».
   */
  fun announcement(context: Context, at: Long = System.currentTimeMillis()): String {
    val c = Calendar.getInstance().apply { timeInMillis = at }
    val hour = c.get(Calendar.HOUR_OF_DAY)
    val minute = c.get(Calendar.MINUTE)
    val hourText = when (hour) {
      0 -> "minuit"
      12 -> "midi"
      1 -> "1 heure"
      else -> "$hour heures"
    }
    val time = if (minute == 0) "Il est $hourText." else "Il est $hourText $minute."
    val weather = weather(context) ?: return time
    return "$time $weather"
  }

  /** Depuis l'application : la voix passe sur le canal de l'assistant, pas celui de l'alarme. */
  fun speak(context: Context, text: String) = say(context, text, alarm = false, onDone = null)

  /**
   * Pendant la sonnerie : canal d'alarme, pour être entendu téléphone en
   * silencieux, comme la radio qu'elle recouvre. `onDone` est rappelé sur le
   * fil principal, que la phrase ait été dite ou non — c'est lui qui remonte
   * le volume de la radio, il ne doit jamais manquer.
   */
  fun announce(context: Context, onDone: () -> Unit) =
    say(context, announcement(context), alarm = true, onDone = onDone)

  @Synchronized
  private fun say(context: Context, text: String, alarm: Boolean, onDone: (() -> Unit)?) {
    if (text.isBlank()) {
      onDone?.let { main.post { it() } }
      return
    }
    val engine = tts
    if (engine != null && ready) {
      utter(engine, Pending(text, alarm, onDone))
      return
    }
    // Un texte plus récent remplace celui qui attendait : on rend quand même
    // la main à celui qui attendait sa fin.
    queued?.onDone?.let { main.post { it() } }
    queued = Pending(text, alarm, onDone)
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
    engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
      override fun onStart(utteranceId: String?) = Unit
      override fun onDone(utteranceId: String?) = finished(utteranceId)
      @Deprecated("Deprecated in Java")
      override fun onError(utteranceId: String?) = finished(utteranceId)
      override fun onError(utteranceId: String?, errorCode: Int) = finished(utteranceId)
      override fun onStop(utteranceId: String?, interrupted: Boolean) = finished(utteranceId)
    })
    ready = true
    queued?.let { utter(engine, it) }
    queued = null
  }

  private fun utter(engine: TextToSpeech, pending: Pending) {
    val usage = if (pending.alarm) AudioAttributes.USAGE_ALARM else AudioAttributes.USAGE_ASSISTANT
    engine.setAudioAttributes(
      AudioAttributes.Builder()
        .setUsage(usage)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build(),
    )
    val id = "voice-" + (++counter)
    pending.onDone?.let { callbacks[id] = it }
    if (engine.speak(pending.text, TextToSpeech.QUEUE_FLUSH, null, id) != TextToSpeech.SUCCESS) {
      finished(id)
    }
  }

  @Synchronized
  private fun finished(utteranceId: String?) {
    val callback = callbacks.remove(utteranceId ?: return) ?: return
    main.post { callback() }
  }

  /** Coupe la voix et libère le moteur ; les fins attendues sont rappelées. */
  @Synchronized
  fun shutdown() {
    try {
      tts?.shutdown()
    } catch (_: Throwable) {
    }
    tts = null
    ready = false
    queued?.onDone?.let { main.post { it() } }
    queued = null
    callbacks.values.forEach { main.post { it() } }
    callbacks.clear()
  }
}
