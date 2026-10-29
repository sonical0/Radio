package expo.modules.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

private const val TAG = "Alarm"

private val REARM_ACTIONS = setOf(
  Intent.ACTION_BOOT_COMPLETED,
  Intent.ACTION_MY_PACKAGE_REPLACED,
  Intent.ACTION_TIMEZONE_CHANGED,
  Intent.ACTION_TIME_CHANGED,
)

/**
 * Réarme après un redémarrage.
 *
 * Android efface toutes les alarmes posées quand le téléphone s'éteint, et
 * une mise à jour système qui redémarre la machine à 3 h du matin est le
 * scénario le plus banal qui soit. Sans ce receiver, le réveil disparaît en
 * silence — c'est le défaut classique du réveil fait maison, et il ne se voit
 * que le matin où l'on ne se lève pas.
 *
 * Réarme aussi quand le fuseau ou l'heure du téléphone changent : l'alarme est
 * posée à un instant absolu, calculé dans le fuseau du moment. Sans ce
 * recalcul, un réveil à 7 h posé à Paris sonnerait à 7 h heure de Paris
 * après un vol pour Montréal.
 */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action ?: return
    if (action !in REARM_ACTIONS) return
    Log.i(TAG, "réarmement après " + action)
    AlarmScheduler.rescheduleAll(context)
  }
}
