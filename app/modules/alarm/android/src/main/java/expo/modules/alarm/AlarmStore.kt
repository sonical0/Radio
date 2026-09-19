package expo.modules.alarm

import android.content.Context

/**
 * La copie que le natif sait lire sans le JS.
 *
 * La bibliothèque d'alarmes vit côté JavaScript dans AsyncStorage, mais au
 * déclenchement — et plus tard au redémarrage du téléphone — personne n'a monté
 * le runtime : il faut une source lisible depuis un `BroadcastReceiver`. Le
 * format interne d'AsyncStorage (un SQLite) n'est pas un contrat, donc on tient
 * ici une copie dans des `SharedPreferences`, réécrite par le JS à chaque
 * modification. Une seule direction : le natif lit, il n'écrit que l'état de la
 * sonnerie en cours.
 */
object AlarmStore {
  private const val PREFS = "fallout_radio_alarm"
  private const val KEY_AT = "at"
  private const val KEY_URL = "url"
  private const val KEY_TITLE = "title"

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun save(context: Context, atMillis: Long, url: String, title: String) {
    prefs(context).edit()
      .putLong(KEY_AT, atMillis)
      .putString(KEY_URL, url)
      .putString(KEY_TITLE, title)
      .apply()
  }

  fun clear(context: Context) {
    prefs(context).edit().clear().apply()
  }

  /** L'instant prévu, ou 0 si aucune alarme n'est armée. */
  fun at(context: Context): Long = prefs(context).getLong(KEY_AT, 0L)

  fun url(context: Context): String = prefs(context).getString(KEY_URL, "") ?: ""

  fun title(context: Context): String =
    prefs(context).getString(KEY_TITLE, "") ?: "Réveil"
}
