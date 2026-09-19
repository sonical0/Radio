package expo.modules.alarm

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * La façade JavaScript du réveil.
 *
 * Volontairement mince : une alarme à la fois, posée par son instant absolu.
 * La récurrence, le snooze et l'écran de réveil viendront par-dessus (jalons 2
 * et 3) sans changer cette surface — le JS dira toujours « réveille-moi à cet
 * instant-là avec ce flux ».
 */
class AlarmModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext)

  override fun definition() = ModuleDefinition {
    Name("Alarm")

    /** `atMillis` est un instant epoch ; `Date.now()`-compatible côté JS. */
    Function("schedule") { atMillis: Double, url: String, title: String ->
      AlarmScheduler.schedule(context, atMillis.toLong(), url, title)
    }

    Function("cancel") {
      AlarmScheduler.cancel(context)
    }

    /** L'instant de l'alarme armée, ou 0. Le natif fait foi, pas le JS. */
    Function("next") {
      AlarmStore.at(context).toDouble()
    }

    Function("isRinging") {
      AlarmService.ringing
    }

    /** Arrêt depuis l'application, équivalent du bouton de la notification. */
    Function("stopRinging") {
      context.startService(
        Intent(context, AlarmService::class.java).setAction(AlarmService.ACTION_STOP),
      )
    }

    /**
     * Sur Android 12, l'utilisateur peut refuser les alarmes exactes ; à partir
     * de la 13, `USE_EXACT_ALARM` les accorde aux applications de réveil. Le JS
     * a besoin de le savoir pour prévenir plutôt que de poser une alarme qui ne
     * sonnera jamais.
     */
    Function("canScheduleExact") {
      val manager = context.getSystemService(AlarmManager::class.java)
      when {
        manager == null -> false
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> manager.canScheduleExactAlarms()
        else -> true
      }
    }
  }
}
