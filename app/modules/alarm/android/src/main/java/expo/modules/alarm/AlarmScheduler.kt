package expo.modules.alarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.util.Log

private const val TAG = "Alarm"
private const val REQUEST_CODE = 4242

/**
 * Pose et retire l'alarme auprès du système.
 *
 * `setAlarmClock()` plutôt que `setExactAndAllowWhileIdle()` : c'est la seule
 * API que Doze et les surcouches constructeur respectent sans condition, et
 * elle affiche l'icône de réveil dans la barre d'état — ce que l'utilisateur
 * attend pour croire que son réveil est armé. Elle accorde en prime à
 * l'application une fenêtre pendant laquelle démarrer un service de premier
 * plan depuis l'arrière-plan est permis, ce dont le déclenchement a besoin.
 */
object AlarmScheduler {

  fun schedule(context: Context, atMillis: Long, url: String, title: String) {
    val manager = context.getSystemService(AlarmManager::class.java) ?: return
    AlarmStore.save(context, atMillis, url, title)

    // L'intent d'affichage est celui que le système ouvre quand on touche
    // l'icône de réveil : l'application elle-même, faute d'écran dédié avant
    // le jalon 3.
    val show = context.packageManager.getLaunchIntentForPackage(context.packageName)
    val showPending = show?.let {
      PendingIntent.getActivity(context, REQUEST_CODE + 1, it, flags())
    }

    manager.setAlarmClock(
      AlarmManager.AlarmClockInfo(atMillis, showPending),
      firePending(context),
    )
    Log.i(TAG, "alarme posée pour " + atMillis + " (" + title + ")")
  }

  fun cancel(context: Context) {
    val manager = context.getSystemService(AlarmManager::class.java)
    manager?.cancel(firePending(context))
    AlarmStore.clear(context)
    Log.i(TAG, "alarme annulée")
  }

  private fun firePending(context: Context): PendingIntent {
    val intent = Intent(context, AlarmReceiver::class.java).setAction(AlarmReceiver.ACTION_FIRE)
    return PendingIntent.getBroadcast(context, REQUEST_CODE, intent, flags())
  }

  private fun flags() = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
}
