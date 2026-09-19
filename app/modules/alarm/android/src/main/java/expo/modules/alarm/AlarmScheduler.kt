package expo.modules.alarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.util.Log
import java.util.Calendar

private const val TAG = "Alarm"
private const val REQUEST_CODE = 4242

/**
 * Pose et retire l'alarme auprès du système.
 *
 * `setAlarmClock()` plutôt que `setExactAndAllowWhileIdle()` : c'est la seule
 * API que Doze et les surcouches constructeur respectent sans condition, et
 * elle affiche l'icône de réveil dans la barre d'état — ce que l'utilisateur
 * attend pour croire que son réveil est armé. Elle accorde en prime à
 * l'application la permission temporaire de démarrer un service de premier
 * plan depuis l'arrière-plan, ce dont le déclenchement a besoin.
 *
 * **Une seule alarme est posée à la fois**, la plus proche. Android en
 * accepterait plusieurs, mais alors chacune aurait son `PendingIntent`, sa
 * durée de vie et ses occasions de diverger de la liste. Reposer la suivante
 * après chaque sonnerie est plus simple à tenir juste — au prix d'un
 * recalcul, qui coûte moins qu'une milliseconde.
 */
object AlarmScheduler {

  /**
   * Recalcule tout depuis la liste et arme la prochaine échéance. À appeler
   * après chaque modification côté JS, après chaque sonnerie, et au
   * redémarrage du téléphone.
   */
  fun rescheduleAll(context: Context, from: Long = System.currentTimeMillis()) {
    val manager = context.getSystemService(AlarmManager::class.java) ?: return

    var soonest: Pair<AlarmSpec, Long>? = null
    for (spec in AlarmStore.alarms(context)) {
      if (!spec.enabled) continue
      val at = nextOccurrence(spec, from) ?: continue
      if (soonest == null || at < soonest!!.second) soonest = spec to at
    }

    if (soonest == null) {
      manager.cancel(firePending(context))
      AlarmStore.clearPending(context)
      Log.i(TAG, "aucune alarme active : rien n'est armé")
      return
    }

    val (spec, at) = soonest!!
    AlarmStore.setPending(context, spec.id, at)

    val show = context.packageManager.getLaunchIntentForPackage(context.packageName)
    val showPending = show?.let {
      PendingIntent.getActivity(context, REQUEST_CODE + 1, it, flags())
    }

    manager.setAlarmClock(
      AlarmManager.AlarmClockInfo(at, showPending),
      firePending(context),
    )
    Log.i(TAG, "alarme armée pour " + at + " (" + spec.title + ")")
  }

  fun cancelAll(context: Context) {
    val manager = context.getSystemService(AlarmManager::class.java)
    manager?.cancel(firePending(context))
    AlarmStore.clearPending(context)
    Log.i(TAG, "alarmes annulées")
  }

  /**
   * Le prochain passage à l'heure dite, ou `null` pour une alarme sans
   * récurrence dont l'heure est passée — elle a déjà servi.
   *
   * Les secondes sont remises à zéro : une alarme à 7 h 00 posée à 7 h 00 min
   * 30 s doit sonner demain, pas dans une demi-minute. Le calcul se fait en
   * heure locale via `Calendar`, ce qui traverse correctement les changements
   * d'heure — un réveil à 7 h reste un réveil à 7 h le lendemain du passage à
   * l'heure d'hiver, ce qu'un simple « +24 h » ne donnerait pas.
   */
  fun nextOccurrence(spec: AlarmSpec, from: Long): Long? {
    val cal = Calendar.getInstance().apply {
      timeInMillis = from
      set(Calendar.HOUR_OF_DAY, spec.hour)
      set(Calendar.MINUTE, spec.minute)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }

    if (spec.days.isEmpty()) {
      if (cal.timeInMillis <= from) cal.add(Calendar.DAY_OF_YEAR, 1)
      return cal.timeInMillis
    }

    // Calendar.SUNDAY vaut 1 ; la liste du JS compte à partir de 0.
    for (offset in 0..7) {
      val candidate = (cal.clone() as Calendar).apply { add(Calendar.DAY_OF_YEAR, offset) }
      if (candidate.timeInMillis <= from) continue
      val weekday = candidate.get(Calendar.DAY_OF_WEEK) - 1
      if (spec.days.contains(weekday)) return candidate.timeInMillis
    }
    return null
  }

  private fun firePending(context: Context): PendingIntent {
    val intent = Intent(context, AlarmReceiver::class.java).setAction(AlarmReceiver.ACTION_FIRE)
    return PendingIntent.getBroadcast(context, REQUEST_CODE, intent, flags())
  }

  private fun flags() = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
}
