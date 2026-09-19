package expo.modules.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

private const val TAG = "Alarm"

/**
 * Réarme après un redémarrage.
 *
 * Android efface toutes les alarmes posées quand le téléphone s'éteint, et
 * une mise à jour système qui redémarre la machine à 3 h du matin est le
 * scénario le plus banal qui soit. Sans ce receiver, le réveil disparaît en
 * silence — c'est le défaut classique du réveil fait maison, et il ne se voit
 * que le matin où l'on ne se lève pas.
 */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action ?: return
    if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) return
    Log.i(TAG, "réarmement après " + action)
    AlarmScheduler.rescheduleAll(context)
  }
}
