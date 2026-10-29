package expo.modules.nav

import android.util.Log
import java.util.concurrent.CopyOnWriteArraySet

private const val TAG = "Nav"

/** Une étape, telle que la notification la donne. Les champs absents valent "". */
data class NavStep(
  val title: String,
  val text: String,
  val sub: String,
  /** La pastille de la barre d'état d'une Live Update (Android 16). */
  val chip: String,
  /** Mètres restants du trajet, ou null si la notification ne le dit pas. */
  val remaining: Int?,
  /** PNG base64 brut, sans préfixe `data:`. */
  val icon: String?,
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "title" to title,
    "text" to text,
    "sub" to sub,
    "chip" to chip,
    "remaining" to remaining,
    "icon" to icon,
  )
}

/**
 * Le point de rencontre entre le service, que le système lance et arrête à
 * son gré, et le module, qui n'existe que tant que le runtime JS tourne. L'un
 * écrit, l'autre lit et s'abonne ; aucun ne tient de référence sur l'autre.
 */
object NavState {
  @Volatile
  var current: NavStep? = null
    private set

  /** La clé de la notification d'où vient l'étape, pour reconnaître son retrait. */
  @Volatile
  var key: String? = null
    private set

  private val listeners = CopyOnWriteArraySet<(NavStep?) -> Unit>()

  fun addListener(l: (NavStep?) -> Unit) {
    listeners.add(l)
  }

  fun removeListener(l: (NavStep?) -> Unit) {
    listeners.remove(l)
  }

  /**
   * Maps republie sa notification à chaque mètre parcouru ou presque ; seuls
   * les vrais changements partent vers le JS.
   */
  @Synchronized
  fun update(step: NavStep?, fromKey: String?) {
    key = if (step == null) null else fromKey
    if (step == current) return
    // Maps republie parfois l'étape sans sa flèche, le temps de la redessiner
    // (démarrage, changement de densité), avec une distance périmée : on garde
    // la précédente. Seulement tant que la progression court : l'arrivée
    // (« Arriving at … ») vient elle aussi sans flèche, mais sans progression,
    // et doit remplacer le dernier virage. Une navigation qui n'aurait jamais
    // d'icône passe quand même.
    if (step != null && step.icon == null && step.remaining != null && current?.icon != null) {
      Log.i(TAG, "étape sans icône écartée : titre=" + step.title.length + " car., reste=" + step.remaining + " m")
      return
    }
    current = step
    Log.i(
      TAG,
      if (step == null) "étape : aucune"
      // Des longueurs, jamais le texte : la rue et l'heure d'arrivée sont
      // l'itinéraire de l'utilisateur, et ce journal sort d'un APK de release.
      else "étape : titre=" + step.title.length + " car., texte=" + step.text.length +
        " car., sub=" + step.sub.length + " car., chip=" + step.chip.length +
        ", reste=" + step.remaining + " m, icône=" + (step.icon?.length ?: 0),
    )
    for (l in listeners) l(step)
  }
}
