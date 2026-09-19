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
 * Trois garanties, dans cet ordre d'importance :
 *
 * 1. **Ça sonne.** Si le flux n'a pas produit de son au bout de dix secondes,
 *    on bascule sur la sonnerie d'alarme du système. Une station morte à 7 h ne
 *    doit pas valoir un réveil raté.
 * 2. **Ça s'arrête.** Dix minutes sans action et la sonnerie se tait.
 * 3. **Ça renonce.** Une demi-heure après la première note, reports compris,
 *    plus rien ne sonnera : un téléphone qui insiste une heure dans une maison
 *    vide n'a réveillé personne et a vidé sa batterie.
 */
class AlarmService : Service() {
  companion object {
    const val EXTRA_URL = "url"
    const val EXTRA_TITLE = "title"

    /** Non nul quand la sonnerie reprend après un report : l'heure de la première note. */
    const val EXTRA_SESSION_START = "sessionStart"

    const val ACTION_STOP = "expo.modules.alarm.STOP"
    const val ACTION_SNOOZE = "expo.modules.alarm.SNOOZE"

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

  private val autoStopRunnable = Runnable {
    Log.i(TAG, "dix minutes sans action : arrêt de cette sonnerie")
    stopEverything(closeSession = !AlarmSession.canSnooze(this))
  }

  private val fallbackRunnable = Runnable { fallbackToRingtone("le flux n'a rien produit en 10 s") }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopEverything(closeSession = true)
        return START_NOT_STICKY
      }
      ACTION_SNOOZE -> {
        snooze()
        return START_NOT_STICKY
      }
    }

    val url = intent?.getStringExtra(EXTRA_URL).orEmpty()
    val title = intent?.getStringExtra(EXTRA_TITLE).orEmpty().ifEmpty { "Réveil" }
    val resumed = intent?.getLongExtra(EXTRA_SESSION_START, 0L) ?: 0L
    val now = System.currentTimeMillis()

    if (resumed == 0L) {
      // Première note du matin : c'est d'ici que court la demi-heure.
      AlarmSession.open(this, now, url, title)
      AlarmDeadline.arm(this, AlarmSession.deadline(this))
    }

    startForeground(NOTIFICATION_ID, notification(title))
    ringing = true
    acquireWakeLock()

    if (url.isEmpty()) {
      fallbackToRingtone("aucun flux enregistré")
    } else {
      startStream(url)
      handler.postDelayed(fallbackRunnable, STREAM_GRACE_MS)
    }

    // La sonnerie ne dure jamais au-delà de l'échéance, même si dix minutes
    // pleines lui resteraient.
    val remaining = AlarmSession.deadline(this) - now
    handler.postDelayed(autoStopRunnable, minOf(AUTO_STOP_MS, maxOf(remaining, 1_000L)))

    // Ne pas relancer tout seul : une alarme ressuscitée par le système à une
    // heure quelconque serait pire que pas d'alarme du tout.
    return START_NOT_STICKY
  }

  private fun snooze() {
    if (!AlarmSession.canSnooze(this)) {
      Log.i(TAG, "report refusé : plafond atteint ou échéance trop proche")
      stopEverything(closeSession = true)
      return
    }
    AlarmSession.countSnooze(this)
    val at = System.currentTimeMillis() + SNOOZE_MS
    AlarmSnooze.arm(this, at, AlarmSession.url(this), AlarmSession.title(this), AlarmSession.startedAt(this))
    Log.i(TAG, "report n°" + AlarmSession.snoozes(this) + " jusqu'à " + at)
    stopEverything(closeSession = false)
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
    // passer le mode silencieux et l'écran de réveil à s'ouvrir tout seul.
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

    // L'écran plein écran. Si le système refuse de l'ouvrir — permission
    // absente sur Android 14+, ou téléphone déverrouillé et actif — la
    // notification reste, avec ses boutons : jamais d'échec silencieux.
    val full = PendingIntent.getActivity(
      this,
      3,
      Intent(this, AlarmActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val builder = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("RÉVEIL")
      .setContentText(title)
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setOngoing(true)
      .setContentIntent(full)
      .setFullScreenIntent(full, true)
      .addAction(android.R.drawable.ic_menu_close_clear_cancel, "ARRÊTER", stop)

    if (AlarmSession.canSnooze(this)) {
      val snoozePending = PendingIntent.getService(
        this,
        2,
        Intent(this, AlarmService::class.java).setAction(ACTION_SNOOZE),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      val label = if (AlarmSession.lastSnooze(this)) "DERNIER REPORT" else "REPORT 10 MIN"
      builder.addAction(android.R.drawable.ic_menu_recent_history, label, snoozePending)
    }

    return builder.build()
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

  private fun stopEverything(closeSession: Boolean) {
    if (closeSession) {
      AlarmSession.close(this)
      AlarmDeadline.cancel(this)
      AlarmSnooze.cancel(this)
    }
    stopSelf()
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
    handler.removeCallbacks(autoStopRunnable)
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
