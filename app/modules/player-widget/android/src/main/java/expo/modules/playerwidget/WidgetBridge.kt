package expo.modules.playerwidget

/**
 * Le pont entre le widget et le JavaScript.
 *
 * Zapper de station n'est pas une notion que le lecteur connaisse : sa file ne
 * contient qu'une piste, et la station suivante se lit dans la bibliotheque,
 * cote JS. Trois chemins passant par la session media ont ete essayes et
 * mesures sur emulateur le 20/09/2026 -- touche media, commande personnalisee,
 * appel standard du controleur -- aucun ne peut aboutir : media3 abandonne
 * l'appel des que la file n'a pas de piste suivante.
 *
 * Le widget s'adresse donc directement a l'application. Ce relais est pose par
 * le module quand le runtime JS existe, et retire quand il disparait : sa
 * seule presence dit si quelqu'un peut repondre. Quand rien ne joue, personne
 * n'ecoute -- et il n'y a de toute facon aucune station a quitter.
 */
object WidgetBridge {
  @Volatile
  var handler: ((String) -> Unit)? = null

  /** Vrai si le runtime JS est la pour traiter la commande. */
  fun deliver(action: String): Boolean {
    val h = handler ?: return false
    return try {
      h(action)
      true
    } catch (_: Throwable) {
      false
    }
  }
}
