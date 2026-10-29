package expo.modules.nav

import android.app.Notification
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Base64
import android.util.Log
import java.io.ByteArrayOutputStream

private const val TAG = "Nav"
private const val MAPS = "com.google.android.apps.maps"
private const val ICON_MAX_PX = 192

// Notification.EXTRA_SHORT_CRITICAL_TEXT (API 36), par sa clé : la constante
// n'existe pas sur les versions plus anciennes, la clé y est simplement absente.
private const val EXTRA_SHORT_CRITICAL_TEXT = "android.shortCriticalText"

/**
 * Le système nous montre toutes les notifications du téléphone ; on n'en garde
 * qu'une, la navigation en cours de Google Maps, et on oublie les autres sans
 * les lire. Rien n'est stocké : l'étape vit en mémoire, le temps du trajet.
 */
class NavListener : NotificationListenerService() {

  /** Les notifications de Maps déjà écartées, pour n'en journaliser qu'une ligne chacune. */
  private val ignored = mutableSetOf<String>()

  override fun onListenerConnected() {
    // Une navigation déjà lancée avant l'accord, ou avant le démarrage du
    // service, ne serait sinon vue qu'à sa prochaine mise à jour.
    val nav = try {
      activeNotifications?.firstOrNull { isNavigation(it) }
    } catch (e: Throwable) {
      Log.w(TAG, "notifications actives illisibles : " + e)
      null
    }
    Log.i(TAG, "accès accordé ; navigation en cours : " + (nav != null))
    NavState.update(nav?.let { read(it) }, nav?.key)
  }

  override fun onListenerDisconnected() {
    // Accès retiré : on ne sait plus rien, on ne prétend rien.
    Log.i(TAG, "accès retiré")
    NavState.update(null, null)
  }

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    if (!isNavigation(sbn)) {
      // Seul le paquet est journalisé, jamais le contenu, et seulement pour
      // Maps : c'est la preuve qu'une notification hors navigation est écartée.
      if (sbn.packageName == MAPS && ignored.add(sbn.key)) Log.i(TAG, "notification Maps ignorée (hors navigation)")
      return
    }
    NavState.update(read(sbn), sbn.key)
  }

  override fun onNotificationRemoved(sbn: StatusBarNotification) {
    ignored.remove(sbn.key)
    if (sbn.key == NavState.key) NavState.update(null, null)
  }

  /**
   * Le tri se fait sur l'enveloppe seule — paquet, catégorie, permanence —
   * avant toute lecture du contenu : une notification d'une autre appli, ou
   * de Maps hors navigation, n'est jamais ouverte.
   */
  private fun isNavigation(sbn: StatusBarNotification): Boolean {
    if (sbn.packageName != MAPS) return false
    val n = sbn.notification ?: return false
    return n.category == Notification.CATEGORY_NAVIGATION && sbn.isOngoing
  }

  private fun read(sbn: StatusBarNotification): NavStep {
    val n = sbn.notification
    val extras = n.extras
    fun text(key: String) = extras?.getCharSequence(key)?.toString().orEmpty()
    return NavStep(
      title = text(Notification.EXTRA_TITLE),
      text = text(Notification.EXTRA_TEXT),
      sub = text(Notification.EXTRA_SUB_TEXT),
      chip = text(EXTRA_SHORT_CRITICAL_TEXT),
      remaining = remaining(extras),
      icon = icon(n),
    )
  }

  /**
   * Maps ne donne pas la distance jusqu'au virage, mais sa barre de
   * progression compte les mètres du trajet : parcourus sur total.
   */
  private fun remaining(extras: Bundle?): Int? {
    if (extras == null) return null
    if (!extras.containsKey(Notification.EXTRA_PROGRESS) || !extras.containsKey(Notification.EXTRA_PROGRESS_MAX)) {
      return null
    }
    val max = extras.getInt(Notification.EXTRA_PROGRESS_MAX)
    if (max <= 0) return null
    return (max - extras.getInt(Notification.EXTRA_PROGRESS)).coerceAtLeast(0)
  }

  private fun icon(n: Notification): String? =
    try {
      val drawable = n.getLargeIcon()?.loadDrawable(this) ?: return null
      val source = (drawable as? BitmapDrawable)?.bitmap ?: run {
        val w = drawable.intrinsicWidth.coerceIn(1, ICON_MAX_PX)
        val h = drawable.intrinsicHeight.coerceIn(1, ICON_MAX_PX)
        Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).also {
          drawable.setBounds(0, 0, w, h)
          drawable.draw(Canvas(it))
        }
      }
      val scale = minOf(1f, ICON_MAX_PX.toFloat() / maxOf(source.width, source.height))
      val bitmap = if (scale < 1f) {
        Bitmap.createScaledBitmap(
          source,
          (source.width * scale).toInt().coerceAtLeast(1),
          (source.height * scale).toInt().coerceAtLeast(1),
          true,
        )
      } else {
        source
      }
      val out = ByteArrayOutputStream()
      bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
      Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    } catch (e: Throwable) {
      // Sans flèche, l'étape reste lisible : on n'abandonne que l'icône.
      Log.w(TAG, "icône illisible : " + e)
      null
    }
}
