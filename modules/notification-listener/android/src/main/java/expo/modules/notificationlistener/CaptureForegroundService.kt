package expo.modules.notificationlistener

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

/**
 * 常驻前台服务：只为了让进程不被系统冻结。
 *
 * 为什么需要它：
 * 通知监听 / 读屏 / 悬浮窗都在本进程里跑。国产 ROM 在后台会冻结本进程，
 * 结果是 `addView` 排上队却不渲染、postDelayed 的计时器也不走 ——
 * 表现就是「付款时看不到提示，打开 App 后才补出来，条子还消不掉」。
 *
 * 有前台服务后进程一直活着，窗口和计时器都能正常工作。
 * 代价是常驻一条静默通知（IMPORTANCE_MIN，不响不亮）。
 */
class CaptureForegroundService : Service() {

  companion object {
    private const val TAG = "KeepAlive"
    private const val CHANNEL_ID = "keep_alive"
    private const val NOTIFICATION_ID = 7200

    fun stop(context: Context) {
      try {
        context.stopService(Intent(context, CaptureForegroundService::class.java))
      } catch (t: Throwable) {
        Log.w(TAG, "停止前台服务失败", t)
      }
    }

    fun start(context: Context) {
      try {
        ContextCompat.startForegroundService(
          context,
          Intent(context, CaptureForegroundService::class.java)
        )
      } catch (t: Throwable) {
        Log.w(TAG, "启动前台服务失败", t)
      }
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    try {
      ensureChannel()
      startForeground(NOTIFICATION_ID, buildNotification())
    } catch (t: Throwable) {
      Log.w(TAG, "startForeground 失败", t)
      stopSelf()
    }
    // 被系统杀掉后自动重建，保证长期有效
    return START_STICKY
  }

  private fun buildNotification() = NotificationCompat.Builder(this, CHANNEL_ID)
    .setSmallIcon(android.R.drawable.stat_notify_sync)
    .setContentTitle("自动记账运行中")
    .setContentText("付款后会在屏幕顶部提示，可直接选分类")
    .setPriority(NotificationCompat.PRIORITY_MIN)
    .setOngoing(true)
    .setSilent(true)
    .build()

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return

    val channel = NotificationChannel(
      CHANNEL_ID,
      "自动记账运行状态",
      NotificationManager.IMPORTANCE_MIN
    ).apply {
      description = "保持自动记账在后台正常工作，不响不亮"
      setShowBadge(false)
    }
    manager.createNotificationChannel(channel)
  }
}
