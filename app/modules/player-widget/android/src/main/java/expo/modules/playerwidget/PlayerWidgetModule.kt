package expo.modules.playerwidget

import android.content.Context
import android.os.Bundle
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

    Events("onWidgetCommand")

    // Le relais n'existe que tant que le module vit, c'est-a-dire tant que le
    // runtime JS vit : le widget s'en sert pour savoir s'il y a quelqu'un a
    // qui parler.
    OnCreate {
      WidgetBridge.handler = { action ->
        sendEvent("onWidgetCommand", Bundle().apply { putString("action", action) })
      }
    }

    OnDestroy { WidgetBridge.handler = null }

    Function("setState") { station: String, title: String, playing: Boolean ->
      WidgetState.save(context, station, title, playing)
      PlayerWidgetProvider.refresh(context)
    }
  }
}
