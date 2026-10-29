package expo.modules.alarm

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.view.WindowManager
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
      AlarmStore.saveFromJs(context, json)
      AlarmScheduler.rescheduleAll(context)
    }

    /**
     * La liste telle que le natif la tient : les deux écritures qu'il fait
     * seul — un réveil unique éteint après sa sonnerie, un saut consommé —
     * doivent revenir au JS, sinon sa prochaine poussée les annulerait.
     */
    Function("alarms") {
      AlarmStore.consumeSkips(context)
      AlarmStore.rawJson(context)
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

    /**
     * Garder l'écran allumé pendant que l'horloge de chevet est affichée.
     *
     * `expo-keep-awake` ferait la même chose, mais c'est une dépendance de
     * plus à installer et à tenir à jour pour deux appels à `addFlags`, dans
     * un module natif qu'on a déjà.
     */
    Function("setKeepAwake") { on: Boolean ->
      val activity = appContext.currentActivity ?: return@Function
      activity.runOnUiThread {
        if (on) {
          activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
          activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
      }
    }

    /** Dit un texte en français, depuis l'application (essai de la voix, par exemple). */
    Function("speak") { text: String ->
      AlarmVoice.speak(context, text)
    }

    /**
     * Luminosité de la fenêtre seule, de 0 à 1 ; une valeur négative rend la
     * main au système. Pas de permission WRITE_SETTINGS : on ne touche pas au
     * réglage du téléphone, qui reviendrait à sa valeur à la sortie de l'appli.
     */
    Function("setWindowBrightness") { level: Double ->
      val activity = appContext.currentActivity ?: return@Function
      activity.runOnUiThread {
        val params = activity.window.attributes
        params.screenBrightness =
          if (level < 0) WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE else level.toFloat().coerceIn(0f, 1f)
        activity.window.attributes = params
      }
    }

    /** La météo en cache, que la sonnerie affiche et annonce. Vide ou null = rien. */
    Function("setWeatherSummary") { text: String? ->
      AlarmVoice.setWeather(context, text)
    }

    /** Annoncer l'heure à la sonnerie, une fois la radio partie. */
    Function("setAnnounceTime") { enabled: Boolean ->
      AlarmVoice.setAnnounce(context, enabled)
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
