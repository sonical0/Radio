package expo.modules.alarm

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import java.util.Calendar

/**
 * L'écran de réveil, celui qui s'allume par-dessus le verrouillage.
 *
 * Il est écrit en Kotlin et non en React, pour une raison simple : à 7 h du
 * matin l'application est morte depuis huit heures, et démarrer le runtime JS
 * avant de pouvoir afficher un bouton ARRÊTER ajoute une seconde ou deux
 * pendant lesquelles le téléphone hurle sans rien proposer. Ici, la fenêtre
 * est posée par le même processus qui joue le son.
 *
 * Il emprunte les couleurs de l'habillage — le JS les dépose dans les
 * `SharedPreferences` à chaque changement de palette — plutôt que de figer un
 * vert qui jurerait avec un Pip-Boy réglé en ambre.
 */
class AlarmActivity : Activity() {
  private val handler = Handler(Looper.getMainLooper())
  private lateinit var clock: TextView
  private var snooze: Button? = null

  private val tick = object : Runnable {
    override fun run() {
      // Le service décide de la fin ; l'écran ne fait que suivre. S'il s'est
      // tu (arrêt, dix minutes, demi-heure), la fenêtre se referme.
      if (!AlarmService.ringing) {
        finish()
        return
      }
      clock.text = now()
      handler.postDelayed(this, 1000)
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    showOverLockScreen()
    setContentView(buildUi())
    handler.post(tick)
  }

  /**
   * Les quatre réglages qui font qu'une fenêtre apparaît sur un téléphone
   * verrouillé et écran éteint. `setShowWhenLocked` et `setTurnScreenOn`
   * remplacent depuis Android 8.1 les drapeaux de fenêtre, dépréciés mais
   * conservés ici pour les versions antérieures.
   */
  @Suppress("DEPRECATION")
  private fun showOverLockScreen() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
      )
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  }

  private fun buildUi(): ViewGroup {
    val palette = AlarmPalette.read(this)
    val mono = Typeface.create(Typeface.MONOSPACE, Typeface.NORMAL)

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setBackgroundColor(palette.background)
      setPadding(48, 48, 48, 48)
    }

    root.addView(
      TextView(this).apply {
        text = "RÉVEIL"
        setTextColor(palette.dim)
        textSize = 20f
        letterSpacing = 0.3f
        typeface = mono
        gravity = Gravity.CENTER
      },
    )

    clock = TextView(this).apply {
      text = now()
      setTextColor(palette.base)
      textSize = 72f
      typeface = mono
      gravity = Gravity.CENTER
    }
    root.addView(clock)

    root.addView(
      TextView(this).apply {
        text = AlarmSession.title(this@AlarmActivity)
        setTextColor(palette.dim)
        textSize = 18f
        typeface = mono
        gravity = Gravity.CENTER
        setPadding(0, 8, 0, 40)
      },
    )

    root.addView(
      button("ARRÊTER", palette) {
        send(AlarmService.ACTION_STOP)
        finish()
      },
    )

    // Le bouton n'existe que si le report tient dans la demi-heure : proposer
    // un répit qu'on couperait serait pire que ne rien proposer.
    if (AlarmSession.canSnooze(this)) {
      val last = AlarmSession.lastSnooze(this)
      snooze = button(if (last) "DERNIER REPORT · 10 MIN" else "REPORT · 10 MIN", palette) {
        send(AlarmService.ACTION_SNOOZE)
        finish()
      }
      root.addView(snooze)
    }

    return root
  }

  private fun button(label: String, palette: AlarmPalette.Colors, onClick: () -> Unit): Button =
    Button(this).apply {
      text = label
      setTextColor(palette.base)
      setBackgroundColor(palette.surface)
      textSize = 20f
      typeface = Typeface.create(Typeface.MONOSPACE, Typeface.NORMAL)
      setPadding(24, 24, 24, 24)
      layoutParams = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT,
      ).apply { topMargin = 16 }
      setOnClickListener { onClick() }
    }

  private fun send(action: String) {
    startService(Intent(this, AlarmService::class.java).setAction(action))
  }

  private fun now(): String {
    val c = Calendar.getInstance()
    return String.format("%02d:%02d", c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE))
  }

  /** Le bouton retour ne doit pas faire disparaître un réveil qui sonne. */
  @Deprecated("Deprecated in Java")
  override fun onBackPressed() {
    // Volontairement vide.
  }

  override fun onDestroy() {
    handler.removeCallbacks(tick)
    super.onDestroy()
  }
}

/** Les couleurs de l'habillage, déposées par le JS à chaque changement de palette. */
object AlarmPalette {
  private const val PREFS = "fallout_radio_alarm_palette"

  data class Colors(val background: Int, val surface: Int, val base: Int, val dim: Int)

  fun save(context: Context, background: String, surface: String, base: String, dim: String) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putString("bg", background)
      .putString("surface", surface)
      .putString("base", base)
      .putString("dim", dim)
      .apply()
  }

  fun read(context: Context): Colors {
    val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    return Colors(
      background = parse(p.getString("bg", null), Color.BLACK),
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
