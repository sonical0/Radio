package expo.modules.alarm

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

private const val TAG = "Alarm"

/** Une alarme, telle que le JS l'écrit et telle que le natif la relit seul. */
data class AlarmSpec(
  val id: String,
  val hour: Int,
  val minute: Int,
  /** Jours de la semaine, 0 = dimanche. Vide = une seule fois. */
  val days: Set<Int>,
  val url: String,
  val title: String,
  val enabled: Boolean,
  /** Durée de la montée de volume, en secondes. 0 = plein volume tout de suite. */
  val rampSeconds: Int,
  /** Le gain de la station, mesuré côté JS : on ne réveille pas plus fort qu'en écoute. */
  val gain: Double,
)

/**
 * La copie que le natif sait lire sans le JS.
 *
 * La bibliothèque d'alarmes vit côté JavaScript dans AsyncStorage, mais au
 * déclenchement — et surtout au redémarrage du téléphone — personne n'a monté
 * le runtime : il faut une source lisible depuis un `BroadcastReceiver`. Le
 * format interne d'AsyncStorage (un SQLite) n'est pas un contrat, donc on tient
 * ici une copie, en JSON, réécrite par le JS à chaque modification.
 *
 * Une seule direction : le JS écrit la liste, le natif la lit. La seule chose
 * que le natif écrit lui-même est la consommation d'une alarme sans
 * récurrence, qu'il éteint après l'avoir fait sonner — sans quoi elle
 * sonnerait de nouveau demain.
 */
object AlarmStore {
  private const val PREFS = "fallout_radio_alarm"
  private const val KEY_ALARMS = "alarms"
  private const val KEY_PENDING_ID = "pendingId"
  private const val KEY_PENDING_AT = "pendingAt"

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun saveJson(context: Context, json: String) {
    prefs(context).edit().putString(KEY_ALARMS, json).apply()
  }

  fun alarms(context: Context): List<AlarmSpec> {
    val raw = prefs(context).getString(KEY_ALARMS, null) ?: return emptyList()
    return try {
      val array = JSONArray(raw)
      (0 until array.length()).mapNotNull { i -> parse(array.optJSONObject(i)) }
    } catch (e: Throwable) {
      // Une liste illisible ne doit pas empêcher le téléphone de démarrer :
      // on préfère aucune alarme à un plantage au boot.
      Log.w(TAG, "liste d'alarmes illisible : " + e)
      emptyList()
    }
  }

  private fun parse(o: JSONObject?): AlarmSpec? {
    if (o == null) return null
    val id = o.optString("id")
    if (id.isEmpty()) return null
    val daysArray = o.optJSONArray("days")
    val days = buildSet {
      if (daysArray != null) {
        for (i in 0 until daysArray.length()) add(daysArray.optInt(i))
      }
    }
    return AlarmSpec(
      id = id,
      hour = o.optInt("hour"),
      minute = o.optInt("minute"),
      days = days,
      url = o.optString("stationUrl"),
      title = o.optString("title", "Réveil"),
      enabled = o.optBoolean("enabled", true),
      rampSeconds = o.optInt("rampSeconds", 30),
      gain = o.optDouble("gain", 1.0),
    )
  }

  /** Éteint une alarme sans récurrence après qu'elle a sonné. */
  fun disable(context: Context, id: String) {
    val raw = prefs(context).getString(KEY_ALARMS, null) ?: return
    try {
      val array = JSONArray(raw)
      for (i in 0 until array.length()) {
        val o = array.optJSONObject(i) ?: continue
        if (o.optString("id") == id) o.put("enabled", false)
      }
      saveJson(context, array.toString())
    } catch (e: Throwable) {
      Log.w(TAG, "impossible d'éteindre " + id + " : " + e)
    }
  }

  fun byId(context: Context, id: String): AlarmSpec? = alarms(context).firstOrNull { it.id == id }

  fun setPending(context: Context, id: String, atMillis: Long) {
    prefs(context).edit()
      .putString(KEY_PENDING_ID, id)
      .putLong(KEY_PENDING_AT, atMillis)
      .apply()
  }

  fun clearPending(context: Context) {
    prefs(context).edit().remove(KEY_PENDING_ID).remove(KEY_PENDING_AT).apply()
  }

  fun pendingId(context: Context): String = prefs(context).getString(KEY_PENDING_ID, "") ?: ""

  /** L'instant de la prochaine sonnerie, ou 0 si rien n'est armé. */
  fun pendingAt(context: Context): Long = prefs(context).getLong(KEY_PENDING_AT, 0L)
}
