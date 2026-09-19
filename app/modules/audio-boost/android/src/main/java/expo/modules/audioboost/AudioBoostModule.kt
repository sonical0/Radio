package expo.modules.audioboost

import android.media.audiofx.LoudnessEnhancer
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val TAG = "AudioBoost"

/**
 * Amplification au-delà du maximum du lecteur.
 *
 * `setVolume()` est borné à 1 : une station diffusée quinze décibels sous les
 * autres ne peut pas être remontée par ce chemin — on ne peut qu'abaisser le
 * reste, ce qui rend toute l'application plus faible que le téléphone. Android
 * offre `LoudnessEnhancer`, un effet de sortie qui, lui, ajoute du gain.
 *
 * L'effet est attaché à la **session 0**, le mixage de sortie global : c'est le
 * seul identifiant de session dont on dispose, le lecteur ne publiant pas le
 * sien. Conséquence assumée, et la raison pour laquelle on ne l'active que le
 * temps d'une station qui en a besoin : tant qu'il tourne, il amplifie tout ce
 * qui sort du téléphone, y compris les notifications.
 *
 * Tout est enveloppé : un appareil peut refuser l'effet (constructeur,
 * politique audio), et dans ce cas la station reste faible plutôt que l'appli
 * ne tombe.
 */
class AudioBoostModule : Module() {
  private var enhancer: LoudnessEnhancer? = null

  override fun definition() = ModuleDefinition {
    Name("AudioBoost")

    Function("setBoostDb") { db: Double ->
      apply(db)
    }

    Function("isAvailable") {
      enhancer != null || canCreate()
    }

    OnDestroy { release() }
  }

  private fun canCreate(): Boolean =
    try {
      LoudnessEnhancer(0).also { it.release() }
      true
    } catch (_: Throwable) {
      false
    }

  private fun apply(db: Double) {
    if (db <= 0.0) {
      release()
      return
    }
    val fx = enhancer ?: try {
      LoudnessEnhancer(0).also { enhancer = it; Log.i(TAG, "effet créé sur la session 0") }
    } catch (e: Throwable) {
      // Certains appareils et la plupart des émulateurs n ont pas de moteur
      // d effets : la station reste faible, ce n est pas une panne.
      Log.w(TAG, "amplification indisponible : " + e)
      return
    }
    try {
      // Le gain se règle en millibels : 100 = 1 dB.
      fx.setTargetGain((db * 100).toInt())
      fx.enabled = true
      Log.i(TAG, "amplification à +" + db + " dB, active=" + fx.enabled)
    } catch (e: Throwable) {
      Log.w(TAG, "réglage refusé : " + e)
      release()
    }
  }

  private fun release() {
    try {
      enhancer?.enabled = false
      enhancer?.release()
    } catch (_: Throwable) {
    }
    enhancer = null
  }
}
