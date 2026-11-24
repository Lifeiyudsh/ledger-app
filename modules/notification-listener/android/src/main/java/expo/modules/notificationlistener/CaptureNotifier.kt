package expo.modules.notificationlistener

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * 捕获到消费后立刻弹一条通知，带 3 个分类按钮。
 *
 * 为什么必须是原生通知：付款那一刻 JS 通常没在跑，任何"App 内提示"都会迟到。
 * 通知按钮点一下就写进分类修正队列，JS 下次起来时自动应用到那笔记录上。
 */
internal object CaptureNotifier {

  private const val CHANNEL_ID = "capture_quick"
  private const val NOTIFICATION_ID_BASE = 7300

  private val QUICK_CATEGORIES = listOf(
    Triple("food", "餐饮", 1),
    Triple("transport", "交通", 2),
    Triple("shopping", "购物", 3)
  )

  fun notify(context: Context, captureId: String, amountFen: Long, appName: String, note: String) {
    try {
      ensureChannel(context)

      val manager = NotificationManagerCompat.from(context)
      if (!manager.areNotificationsEnabled()) return

      val yuan = String.format("%.2f", amountFen / 100.0)
      val title = "已记一笔 ¥$yuan"
      val body = note.ifBlank { appName }.take(60)

      val builder = NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.stat_notify_chat)
        .setContentTitle(title)
        .setContentText("$body · 点下面按钮改分类")
        .setPriority(NotificationCompat.PRIORITY_DEFAULT)
        .setAutoCancel(true)
        .setOnlyAlertOnce(true)

      // 点通知主体 = 打开 App 看账单
      launchIntent(context)?.let { intent ->
        builder.setContentIntent(
          PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
          )
        )
      }

      QUICK_CATEGORIES.forEach { (category, label, slot) ->
        val actionIntent = Intent(context, CategoryFixReceiver::class.java).apply {
          action = CategoryFixReceiver.ACTION_FIX
          putExtra(CategoryFixReceiver.EXTRA_ID, captureId)
          putExtra(CategoryFixReceiver.EXTRA_AMOUNT, amountFen)
          putExtra(CategoryFixReceiver.EXTRA_CATEGORY, category)
          putExtra(CategoryFixReceiver.EXTRA_NOTIFICATION_ID, NOTIFICATION_ID_BASE + slot)
        }

        val pending = PendingIntent.getBroadcast(
          context,
          slot,
          actionIntent,
          PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        builder.addAction(0, label, pending)
      }

      manager.notify(NOTIFICATION_ID_BASE, builder.build())
    } catch (t: Throwable) {
      // 通知失败不影响记账本身
    }
  }

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return

    val channel = NotificationChannel(CHANNEL_ID, "自动记账", NotificationManager.IMPORTANCE_DEFAULT).apply {
      description = "捕获到消费时提示一笔，可直接选分类"
      enableVibration(false)
    }
    manager.createNotificationChannel(channel)
  }

  private fun launchIntent(context: Context): Intent? =
    context.packageManager.getLaunchIntentForPackage(context.packageName)
}
