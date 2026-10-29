package expo.modules.nav

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val TAG = "Nav"

/**
 * La façade JavaScript des étapes de navigation : l'étape en cours, un
 * évènement à chaque changement, et l'accès aux notifications que
 * l'utilisateur doit accorder lui-même.
 */
class NavModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext)

  private val relay: (NavStep?) -> Unit = { step ->
    sendEvent("onStep", mapOf("step" to step?.toMap()))
  }

  override fun definition() = ModuleDefinition {
    Name("Nav")

    Events("onStep")

    OnStartObserving { NavState.addListener(relay) }

    OnStopObserving { NavState.removeListener(relay) }

    OnDestroy { NavState.removeListener(relay) }

    Function("step") {
      NavState.current?.toMap()
    }

    /**
     * Relu dans les réglages à chaque appel : l'accord se donne hors de
     * l'appli, et doit se voir au retour sans la relancer.
     */
    Function("hasAccess") {
      val enabled = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners")
        ?: return@Function false
      val mine = component()
      enabled.split(':').any { ComponentName.unflattenFromString(it) == mine }
    }

    /**
     * La page de détail mène droit à l'interrupteur (Android 11 et plus) ;
     * certaines surcouches ne l'ont pas, d'où le repli sur la liste.
     */
    Function("openAccessSettings") {
      val detail = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS)
          .putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, component().flattenToString())
      } else {
        null
      }
      val list = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
      listOfNotNull(detail, list).any { intent ->
        try {
          context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
          true
        } catch (e: Throwable) {
          Log.w(TAG, "réglage introuvable : " + intent.action + " : " + e)
          false
        }
      }
      Unit
    }
  }

  private fun component() = ComponentName(context, NavListener::class.java)
}
