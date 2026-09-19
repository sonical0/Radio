package expo.modules.alarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent

/**
 * Les deux minuteries d'un matin : le report, et la limite.
 *
 * Toutes deux passent par `AlarmManager` et non par un `Handler`, parce que le
 * service meurt entre les sonneries — dix minutes de silence pendant
 * lesquelles rien ne justifie de garder un processus vivant, et pendant
 * lesquelles Android tue volontiers ce qui traîne. Un `postDelayed()` mourrait
 * avec lui, et le réveil ne reprendrait jamais.
 */
private const val REQUEST_SNOOZE = 4243
private const val REQUEST_DEADLINE = 4244

object AlarmSnooze {
  fun arm(context: Context, atMillis: Long, url: String, title: String, sessionStart: Long) {
    val manager = context.getSystemService(AlarmManager::class.java) ?: return
    manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMillis, pending(context, url, title, sessionStart))
  }

  fun cancel(context: Context) {
    val manager = context.getSystemService(AlarmManager::class.java)
    manager?.cancel(pending(context, "", "", 0L))
  }

  private fun pending(context: Context, url: String, title: String, sessionStart: Long): PendingIntent {
    val intent = Intent(context, AlarmReceiver::class.java)
      .setAction(AlarmReceiver.ACTION_SNOOZE_FIRE)
      .putExtra(AlarmService.EXTRA_URL, url)
      .putExtra(AlarmService.EXTRA_TITLE, title)
      .putExtra(AlarmService.EXTRA_SESSION_START, sessionStart)
    return PendingIntent.getBroadcast(
      context,
      REQUEST_SNOOZE,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }
}

object AlarmDeadline {
  fun arm(context: Context, atMillis: Long) {
    val manager = context.getSystemService(AlarmManager::class.java) ?: return
    manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMillis, pending(context))
  }

  fun cancel(context: Context) {
    val manager = context.getSystemService(AlarmManager::class.java)
    manager?.cancel(pending(context))
  }

  private fun pending(context: Context): PendingIntent {
    val intent = Intent(context, AlarmReceiver::class.java).setAction(AlarmReceiver.ACTION_GIVE_UP)
    return PendingIntent.getBroadcast(
      context,
      REQUEST_DEADLINE,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }
}
