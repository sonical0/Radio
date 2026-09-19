package expo.modules.playerwidget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.widget.RemoteViews
import androidx.media3.common.util.UnstableApi

/**
 * Le widget d'écran d'accueil.
 *
 * **Il ne parle pas à `@rntp/player`, il parle à sa session média** — par deux
 * chemins distincts, pour une raison expliquée dans `PlayerCommands` : une
 * touche média suffit pour play/pause, mais elle est rejetée pour Next et
 * Previous, dont la commande n'est pas « disponible » sur une file d'une
 * seule piste. Ceux-là passent par la commande de session personnalisée, la
 * même que le bouton de la notification.
 *
 * L'affichage, lui, vient de ce que le JS a laissé dans les préférences à sa
 * dernière exécution : nom de la station, titre en cours, état de lecture. Ce
 * sont des informations qui peuvent être périmées si le service a été tué de
 * l'extérieur — d'où le parti pris de ne jamais afficher un état de lecture
 * inventé, mais celui qu'on a reçu, et de le corriger dès que l'application
 * ou le service en publie un nouveau.
 */
@UnstableApi
class PlayerWidgetProvider : AppWidgetProvider() {
  companion object {
    const val ACTION_PLAY_PAUSE = "expo.modules.playerwidget.PLAY_PAUSE"
    const val ACTION_NEXT = "expo.modules.playerwidget.NEXT"
    const val ACTION_PREVIOUS = "expo.modules.playerwidget.PREVIOUS"

    /** Redessine tous les widgets posés. Appelé à chaque changement d'état. */
    fun refresh(context: Context) {
      val manager = AppWidgetManager.getInstance(context) ?: return
      val ids = manager.getAppWidgetIds(ComponentName(context, PlayerWidgetProvider::class.java))
      if (ids.isEmpty()) return
      for (id in ids) manager.updateAppWidget(id, build(context))
    }

    private fun build(context: Context): RemoteViews {
      val state = WidgetState.read(context)
      val palette = WidgetPalette.read(context)
      val views = RemoteViews(context.packageName, R.layout.player_widget)

      views.setTextViewText(R.id.widget_station, state.station.ifEmpty { "FALLOUT RADIO" })
      views.setTextViewText(R.id.widget_title, state.title)
      views.setTextColor(R.id.widget_station, palette.base)
      views.setTextColor(R.id.widget_title, palette.dim)
      views.setInt(R.id.widget_root, "setBackgroundColor", palette.surface)

      views.setImageViewResource(
        R.id.widget_play,
        if (state.playing) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
      )

      views.setOnClickPendingIntent(R.id.widget_play, command(context, ACTION_PLAY_PAUSE, 1))
      views.setOnClickPendingIntent(R.id.widget_next, command(context, ACTION_NEXT, 2))
      views.setOnClickPendingIntent(R.id.widget_previous, command(context, ACTION_PREVIOUS, 3))

      // Toucher le texte ouvre l'application : le geste attendu, et le seul
      // moyen de changer de station autrement qu'en zappant.
      val open = context.packageManager.getLaunchIntentForPackage(context.packageName)
      if (open != null) {
        views.setOnClickPendingIntent(
          R.id.widget_text,
          PendingIntent.getActivity(
            context,
            4,
            open,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
          ),
        )
      }
      return views
    }

    private fun command(context: Context, action: String, code: Int): PendingIntent =
      PendingIntent.getBroadcast(
        context,
        code,
        Intent(context, PlayerWidgetProvider::class.java).setAction(action),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
  }

  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    for (id in ids) manager.updateAppWidget(id, build(context))
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    when (intent.action) {
      ACTION_PLAY_PAUSE -> {
        PlayerCommands.playPause(context)
        // Le retour d'écran est immédiat : attendre que le JS republie
        // l'état donnerait un bouton qui ne réagit pas quand l'application
        // est fermée. L'état réel corrigera au prochain envoi.
        WidgetState.togglePlaying(context)
        refresh(context)
      }
      ACTION_NEXT -> withSession(context) { done -> PlayerCommands.next(context, done) }
      ACTION_PREVIOUS -> withSession(context) { done -> PlayerCommands.previous(context, done) }
    }
  }

  /**
   * Joindre la session est asynchrone, et un `BroadcastReceiver` est tué dès
   * la fin de `onReceive` : `goAsync()` tient le processus le temps de la
   * connexion, et `finish()` le relâche dès la commande partie.
   */
  private fun withSession(context: Context, block: (done: () -> Unit) -> Unit) {
    val pending = goAsync()
    block {
      try {
        pending.finish()
      } catch (_: Throwable) {
      }
    }
  }
}

/** Ce que le JS publie pour le widget : de quoi dessiner, rien de plus. */
object WidgetState {
  private const val PREFS = "fallout_radio_widget"

  data class State(val station: String, val title: String, val playing: Boolean)

  fun save(context: Context, station: String, title: String, playing: Boolean) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putString("station", station)
      .putString("title", title)
      .putBoolean("playing", playing)
      .apply()
  }

  fun read(context: Context): State {
    val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    return State(
      station = p.getString("station", "") ?: "",
      title = p.getString("title", "") ?: "",
      playing = p.getBoolean("playing", false),
    )
  }

  fun togglePlaying(context: Context) {
    val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    p.edit().putBoolean("playing", !p.getBoolean("playing", false)).apply()
  }
}

/**
 * Les couleurs du Pip-Boy, écrites par le thème pour l'écran de réveil.
 *
 * Un seul écrivain — `ThemeProvider` via le module `alarm` — et deux lecteurs.
 * Dupliquer l'envoi côté JS aurait donné deux copies à garder d'accord pour
 * la même information.
 */
object WidgetPalette {
  private const val PREFS = "fallout_radio_alarm_palette"

  data class Colors(val surface: Int, val base: Int, val dim: Int)

  fun read(context: Context): Colors {
    val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    return Colors(
      surface = parse(p.getString("surface", null), Color.parseColor("#071007")),
      base = parse(p.getString("base", null), Color.parseColor("#39ff6a")),
      dim = parse(p.getString("dim", null), Color.parseColor("#24a34a")),
    )
  }

  private fun parse(value: String?, fallback: Int): Int =
    try {
      if (value.isNullOrEmpty()) fallback else Color.parseColor(value)
    } catch (_: Throwable) {
      fallback
    }
}
