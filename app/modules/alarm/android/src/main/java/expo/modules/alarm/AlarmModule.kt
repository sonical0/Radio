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
 * Le JS écrit la liste entière à chaque modification, le natif la relit et
 * recalcule ce qu'il arme. Pas d'API « ajouter une alarme » : une écriture
 * complète ne peut pas diverger de la liste affichée, là où une suite
 * d'ajouts et de retraits finit toujours par le faire.
 */
class AlarmModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext)

  override fun definition() = ModuleDefinition {
    Name("Alarm")

    /** La liste complète, en JSON : `[{ id, hour, minute, days, stationUrl, title, enabled }]`. */
    Function("setAlarms") { json: String ->
      AlarmStore.saveJson(context, json)
      AlarmScheduler.rescheduleAll(context)
    }

    Function("cancelAll") {
      AlarmScheduler.cancelAll(context)
    }

    /** L'instant de la prochaine sonnerie, ou 0. Le natif fait foi, pas le JS. */
    Function("next") {
      AlarmStore.pendingAt(context).toDouble()
    }

    /** L'identifiant de l'alarme qui sonnera, pour l'afficher. */
    Function("nextId") {
      AlarmStore.pendingId(context)
    }

    Function("isRinging") {
      AlarmService.ringing
    }

    /**
     * Les couleurs de l'habillage, pour que l'écran de réveil — écrit en
     * Kotlin, donc hors du thème React — ne jure pas avec un Pip-Boy réglé
     * en ambre. À repousser à chaque changement de palette.
     */
    Function("setPalette") { background: String, surface: String, base: String, dim: String ->
      AlarmPalette.save(context, background, surface, base, dim)
    }

    /** Report depuis l'application, équivalent du bouton de la notification. */
    Function("snooze") {
      context.startService(
        Intent(context, AlarmService::class.java).setAction(AlarmService.ACTION_SNOOZE),
      )
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
