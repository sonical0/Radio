package expo.modules.alarm

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes as SystemAudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer

private const val TAG = "Alarm"
private const val CHANNEL_ID = "alarm"
private const val NOTIFICATION_ID = 42

/** Au-delà, personne n'est là : le téléphone se tait plutôt que de vider sa batterie. */
private const val AUTO_STOP_MS = 10 * 60 * 1000L

/** Ce qu'on laisse au flux pour produire du son avant de le déclarer mort. */
private const val STREAM_GRACE_MS = 10 * 1000L

/**
 * La sonnerie.
 *
 * Ce service ne touche pas à `@rntp/player` : son service de lecture refuse de
 * démarrer depuis l'arrière-plan (voir `src/player/player.ts`), et réveiller le
 * runtime JS pour le piloter est exactement ce qui a tué la v4 de
 * `react-native-track-player` sur la nouvelle architecture. L'alarme a donc son
 * propre ExoPlayer, sur `USAGE_ALARM` — le canal d'alarme, celui qui sonne même
 * quand le téléphone est en silencieux et dont le volume ne suit pas le média.
 *
 * Deux garanties, dans cet ordre d'importance :
 *
 * 1. **Ça sonne.** Si le flux n'a pas produit de son au bout de dix secondes,
 *    on bascule sur la sonnerie d'alarme du système. Une station morte à 7 h ne
 *    doit pas valoir un réveil raté.
 * 2. **Ça s'arrête.** Dix minutes sans action et le service se termine.
 */
class AlarmService : Service() {
  companion object {
    const val EXTRA_URL = "url"
    const val EXTRA_TITLE = "title"
    const val ACTION_STOP = "expo.modules.alarm.STOP"

    /** Lu par le JS pour savoir s'il doit afficher un écran de sonnerie. */
    @Volatile
    var ringing: Boolean = false
      private set
  }

  private val handler = Handler(Looper.getMainLooper())
  private var player: ExoPlayer? = null
  private var ringtone: MediaPlayer? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var fellBack = false

  private val stopSelfRunnable = Runnable {
    Log.i(TAG, "dix minutes sans action : arrêt")
    stopSelf()
  }

  private val fallbackRunnable = Runnable { fallbackToRingtone("le flux n'a rien produit en 10 s") }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopSelf()
      return START_NOT_STICKY
    }

    val url = intent?.getStringExtra(EXTRA_URL).orEmpty()
    val title = intent?.getStringExtra(EXTRA_TITLE).orEmpty().ifEmpty { "Réveil" }

    startForeground(NOTIFICATION_ID, notification(title))
    ringing = true

    // Le verrou couvre le temps d'ouvrir le flux : sans lui, l'appareil peut se
    // rendormir entre le réveil du receiver et la première note.
    acquireWakeLock()

    if (url.isEmpty()) {
      fallbackToRingtone("aucun flux enregistré")
    } else {
      startStream(url)
      handler.postDelayed(fallbackRunnable, STREAM_GRACE_MS)
    }

    handler.postDelayed(stopSelfRunnable, AUTO_STOP_MS)
    // Ne pas relancer tout seul : une alarme ressuscitée par le système à une
    // heure quelconque serait pire que pas d'alarme du tout.
    return START_NOT_STICKY
  }

  private fun startStream(url: String) {
    val attrs = AudioAttributes.Builder()
      .setUsage(C.USAGE_ALARM)
      .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
      .build()

    val exo = ExoPlayer.Builder(this).build().apply {
      // `handleAudioFocus = true` : si un appel arrive, on se tait plutôt que
      // de hurler par-dessus.
      setAudioAttributes(attrs, true)
      setMediaItem(MediaItem.fromUri(url))
      addListener(object : Player.Listener {
        override fun onPlaybackStateChanged(state: Int) {
          if (state == Player.STATE_READY) {
            // Le flux vit : le repli n'a plus lieu d'être.
            handler.removeCallbacks(fallbackRunnable)
            Log.i(TAG, "flux prêt, la radio sonne")
          }
        }

        override fun onPlayerError(error: PlaybackException) {
          fallbackToRingtone("erreur de lecture : " + error.errorCodeName)
        }
      })
      playWhenReady = true
      prepare()
    }
    player = exo
  }

  /**
   * La garantie centrale. `TYPE_ALARM` est toujours présent, ne pèse rien dans
   * l'APK, et c'est le son que l'utilisateur reconnaît déjà comme une alarme.
   */
  private fun fallbackToRingtone(why: String) {
    if (fellBack) return
    fellBack = true
    handler.removeCallbacks(fallbackRunnable)
    Log.w(TAG, "repli sur la sonnerie système : " + why)

    releasePlayer()
    val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
      ?: return

    ringtone = try {
      MediaPlayer().apply {
        setAudioAttributes(
          SystemAudioAttributes.Builder()
            .setUsage(SystemAudioAttributes.USAGE_ALARM)
            .setContentType(SystemAudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build(),
        )
        setDataSource(this@AlarmService, uri)
        isLooping = true
        prepare()
        start()
      }
    } catch (e: Throwable) {
      // Il ne reste plus rien à tenter : le dire, plutôt que de tomber.
      Log.e(TAG, "sonnerie système indisponible : " + e)
      null
    }
  }

  private fun notification(title: String): android.app.Notification {
    val manager = getSystemService(NotificationManager::class.java)
    // IMPORTANCE_HIGH et la catégorie alarme : c'est ce qui autorise le son à
    // passer le mode silencieux et, au jalon 3, l'écran de réveil plein écran.
    val channel = NotificationChannel(CHANNEL_ID, "Réveil", NotificationManager.IMPORTANCE_HIGH)
    channel.setSound(null, null)
    channel.setBypassDnd(true)
    manager?.createNotificationChannel(channel)

    val stop = PendingIntent.getService(
      this,
      1,
      Intent(this, AlarmService::class.java).setAction(ACTION_STOP),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(
        this,
        2,
        it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("RÉVEIL")
      .setContentText(title)
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setOngoing(true)
      .setContentIntent(open)
      .addAction(android.R.drawable.ic_menu_close_clear_cancel, "ARRÊTER", stop)
      .build()
  }

  private fun acquireWakeLock() {
    val power = getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return
    wakeLock = try {
      power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "falloutradio:alarm").apply {
        setReferenceCounted(false)
        acquire(AUTO_STOP_MS)
      }
    } catch (e: Throwable) {
      Log.w(TAG, "verrou d'éveil refusé : " + e)
      null
    }
  }

  private fun releasePlayer() {
    try {
      player?.release()
    } catch (_: Throwable) {
    }
    player = null
  }

  override fun onDestroy() {
    ringing = false
    handler.removeCallbacks(stopSelfRunnable)
    handler.removeCallbacks(fallbackRunnable)
    releasePlayer()
    try {
      ringtone?.stop()
      ringtone?.release()
    } catch (_: Throwable) {
    }
    ringtone = null
    try {
      if (wakeLock?.isHeld == true) wakeLock?.release()
    } catch (_: Throwable) {
    }
    wakeLock = null
    Log.i(TAG, "service terminé")
    super.onDestroy()
  }
}
