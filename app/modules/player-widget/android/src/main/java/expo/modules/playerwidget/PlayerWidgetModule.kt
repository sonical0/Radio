package expo.modules.playerwidget

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Ce que le JS a le droit de dire au widget : ce qui joue, et rien d'autre.
 *
 * Aucune commande dans ce sens-la. Les boutons du widget passent par la
 * session media (voir PlayerWidgetProvider), pas par le JS : un widget qui
 * devrait reveiller le runtime pour mettre en pause serait inutilisable
 * application fermee, c'est-a-dire la plupart du temps.
 */
class PlayerWidgetModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext)

  override fun definition() = ModuleDefinition {
    Name("PlayerWidget")

    Function("setState") { station: String, title: String, playing: Boolean ->
      WidgetState.save(context, station, title, playing)
      PlayerWidgetProvider.refresh(context)
    }
  }
}
