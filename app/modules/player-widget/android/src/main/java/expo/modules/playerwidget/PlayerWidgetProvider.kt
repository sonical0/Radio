package expo.modules.playerwidget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.media.AudioManager
import android.view.KeyEvent
import android.widget.RemoteViews

/**
 * Le widget d'écran d'accueil.
 *
 * **Il ne parle pas à `@rntp/player`, il parle à la session média.** Le lecteur
 * configure ses commandes distantes en `handling: 'native'` (voir
 * `src/player/player.ts`), donc la session répond aux touches média même quand
 * le runtime JS ne tourne plus — c'est exactement ce que fait un casque
 * Bluetooth. `dispatchMediaKeyEvent()` suffit donc, sans permission, sans
 * couplage au lecteur, et sans réveiller la moindre ligne de JavaScript.
 *
 * L'affichage, lui, vient de ce que le JS a laissé dans les préférences à sa
 * dernière exécution : nom de la station, titre en cours, état de lecture. Ce
 * sont des informations qui peuvent être périmées si le service a été tué de
 * l'extérieur — d'où le parti pris de ne jamais afficher un état de lecture
 * inventé, mais celui qu'on a reçu, et de le corriger dès que l'application
 * ou le service en publie un nouveau.
 */
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
    val key = when (intent.action) {
      ACTION_PLAY_PAUSE -> KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
      ACTION_NEXT -> KeyEvent.KEYCODE_MEDIA_NEXT
      ACTION_PREVIOUS -> KeyEvent.KEYCODE_MEDIA_PREVIOUS
      else -> return
    }
    sendMediaKey(context, key)

    // Le retour d'écran est immédiat sur le bouton lecture : attendre que le
    // JS republie l'état donnerait un bouton qui ne réagit pas quand
    // l'application est fermée. L'état réel corrigera au prochain envoi.
    if (key == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE) {
      WidgetState.togglePlaying(context)
    }
    refresh(context)
  }

  private fun sendMediaKey(context: Context, code: Int) {
    val audio = context.getSystemService(AudioManager::class.java) ?: return
    // Deux évènements : une touche physique descend puis remonte, et une
    // session qui n'en reçoit qu'un seul peut ignorer l'appui.
    audio.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, code))
    audio.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_UP, code))
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
