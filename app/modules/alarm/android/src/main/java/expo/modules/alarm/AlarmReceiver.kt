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
 * il démarre le service, réarme la suite, et rend la main. Tout ce qui dure —
 * ouvrir le flux, attendre le réseau, sonner — appartient au service.
 */
class AlarmReceiver : BroadcastReceiver() {
  companion object {
    const val ACTION_FIRE = "expo.modules.alarm.FIRE"
  }

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != ACTION_FIRE) return

    val id = AlarmStore.pendingId(context)
    val spec = AlarmStore.byId(context, id)
    if (spec == null) {
      // La liste a changé entre la pose et le déclenchement : ne pas sonner
      // pour une alarme que l'utilisateur a supprimée.
      Log.w(TAG, "déclenchement sans alarme correspondante (" + id + ")")
      AlarmScheduler.rescheduleAll(context)
      return
    }

    Log.i(TAG, "déclenchement de " + spec.id + ", flux = " + (if (spec.url.isEmpty()) "(aucun)" else spec.url))

    context.startForegroundService(
      Intent(context, AlarmService::class.java)
        .putExtra(AlarmService.EXTRA_URL, spec.url)
        .putExtra(AlarmService.EXTRA_TITLE, spec.title),
    )

    // Une alarme sans récurrence est consommée ; une alarme récurrente
    // repose son occurrence suivante. Dans les deux cas c'est le recalcul
    // complet qui tranche, pour qu'il n'existe qu'un seul chemin.
    if (spec.days.isEmpty()) AlarmStore.disable(context, spec.id)
    AlarmScheduler.rescheduleAll(context)
  }
}
