package expo.modules.alarm

import android.content.Context

/** Dix minutes de silence entre deux sonneries. */
const val SNOOZE_MS = 10 * 60 * 1000L

/** Trois reports au maximum. */
const val SNOOZE_MAX = 3

/** Une sonnerie sans action se tait au bout de dix minutes. */
const val AUTO_STOP_MS = 10 * 60 * 1000L

/** Et plus rien ne sonne passé une demi-heure depuis la première note. */
const val GIVE_UP_MS = 30 * 60 * 1000L

/**
 * L'état d'un matin : depuis quand ça sonne, et combien de fois on a reporté.
 *
 * Il vit dans les `SharedPreferences` et non dans le service, parce que le
 * service meurt entre deux reports — dix minutes de silence, pendant
 * lesquelles rien ne justifie de garder un processus en vie. Ce qui doit
 * survivre à cette mort, c'est précisément le compte à rebours de la demi-heure
 * et le nombre de reports déjà pris.
 *
 * La session se ferme à l'arrêt : un compteur de reports ne se reporte pas au
 * lendemain.
 */
object AlarmSession {
  private const val PREFS = "fallout_radio_alarm_session"
  private const val KEY_START = "start"
  private const val KEY_SNOOZES = "snoozes"
  private const val KEY_URL = "url"
  private const val KEY_TITLE = "title"

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun open(context: Context, startedAt: Long, url: String, title: String) {
    prefs(context).edit()
      .putLong(KEY_START, startedAt)
      .putInt(KEY_SNOOZES, 0)
      .putString(KEY_URL, url)
      .putString(KEY_TITLE, title)
      .apply()
  }

  fun close(context: Context) {
    prefs(context).edit().clear().apply()
  }

  fun startedAt(context: Context): Long = prefs(context).getLong(KEY_START, 0L)

  fun snoozes(context: Context): Int = prefs(context).getInt(KEY_SNOOZES, 0)

  fun url(context: Context): String = prefs(context).getString(KEY_URL, "") ?: ""

  fun title(context: Context): String = prefs(context).getString(KEY_TITLE, "") ?: "Réveil"

  fun countSnooze(context: Context) {
    prefs(context).edit().putInt(KEY_SNOOZES, snoozes(context) + 1).apply()
  }

  /** L'instant où l'on renonce, quoi qu'il arrive. */
  fun deadline(context: Context): Long = startedAt(context) + GIVE_UP_MS

  /**
   * Un report n'est proposé que s'il tient entier dans la demi-heure : mieux
   * vaut retirer le bouton que d'accorder un répit qui serait coupé net.
   */
  fun canSnooze(context: Context, now: Long = System.currentTimeMillis()): Boolean {
    if (startedAt(context) == 0L) return false
    if (snoozes(context) >= SNOOZE_MAX) return false
    return now + SNOOZE_MS < deadline(context)
  }

  /** Vrai quand le report proposé est le dernier : l'écran doit le dire. */
  fun lastSnooze(context: Context, now: Long = System.currentTimeMillis()): Boolean {
    if (!canSnooze(context, now)) return false
    if (snoozes(context) + 1 >= SNOOZE_MAX) return true
    return now + 2 * SNOOZE_MS >= deadline(context)
  }
}
