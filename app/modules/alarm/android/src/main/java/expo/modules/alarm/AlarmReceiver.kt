package expo.modules.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

private const val TAG = "Alarm"

/**
 * Réveillé à l'heure dite, et rien de plus.
 *
 * Un `BroadcastReceiver` dispose d'une dizaine de secondes avant d'être tué :
 * il démarre le service et rend la main. Tout ce qui dure — ouvrir le flux,
 * attendre le réseau, sonner — appartient au service.
 */
class AlarmReceiver : BroadcastReceiver() {
  companion object {
    const val ACTION_FIRE = "expo.modules.alarm.FIRE"
  }

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != ACTION_FIRE) return
    // Tout lire avant d'effacer : l'alarme est consommée ici, et sans
    // récurrence (jalon 2) elle ne se réarme pas.
    val url = AlarmStore.url(context)
    val title = AlarmStore.title(context)
    AlarmStore.clear(context)
    Log.i(TAG, "déclenchement, flux = " + (if (url.isEmpty()) "(aucun)" else url))

    val service = Intent(context, AlarmService::class.java)
      .putExtra(AlarmService.EXTRA_URL, url)
      .putExtra(AlarmService.EXTRA_TITLE, title)
    context.startForegroundService(service)
  }
}
