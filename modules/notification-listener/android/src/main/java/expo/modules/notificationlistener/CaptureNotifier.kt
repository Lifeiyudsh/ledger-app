package expo.modules.notificationlistener

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.RemoteInput

/**
 * 捕获到消费后立刻弹一条通知，带 3 个分类按钮。
 *
 * 为什么必须是原生通知：付款那一刻 JS 通常没在跑，任何"App 内提示"都会迟到。
 * 通知按钮点一下就写进分类修正队列，JS 下次起来时自动应用到那笔记录上。
 */
internal object CaptureNotifier {

  private const val CHANNEL_ID = "capture_quick"
  private const val NOTIFICATION_ID_BASE = 7300

  /** 「没权限发通知」的日志节流，避免刷屏 */
  private var lastWarnAt: Long = 0L

  private val QUICK_CATEGORIES = listOf(
    Triple("food", "餐饮", 1),
    Triple("transport", "交通", 2),
    Triple("shopping", "购物", 3)
  )

  fun notify(context: Context, captureId: String, amountFen: Long, appName: String, note: String) {
    try {
      ensureChannel(context)

      val manager = NotificationManagerCompat.from(context)
      if (!manager.areNotificationsEnabled()) {
        logNoPermission(context, amountFen)
        return
      }

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

      // 通知里直接输入备注（不用打开 App）
      val replyIntent = Intent(context, CategoryFixReceiver::class.java).apply {
        action = CategoryFixReceiver.ACTION_REPLY
        putExtra(CategoryFixReceiver.EXTRA_ID, captureId)
        putExtra(CategoryFixReceiver.EXTRA_AMOUNT, amountFen)
      }

      val remoteInput = RemoteInput.Builder(CategoryFixReceiver.EXTRA_REPLY_TEXT)
        .setLabel("写备注，如：午餐")
        .build()

      val replyPending = PendingIntent.getBroadcast(
        context,
        99,
        replyIntent,
        PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
      )

      builder.addAction(
        NotificationCompat.Action.Builder(0, "写备注", replyPending)
          .addRemoteInput(remoteInput)
          .setAllowGeneratedReplies(true)
          .build()
      )

      manager.notify(NOTIFICATION_ID_BASE, builder.build())
    } catch (t: Throwable) {
      // 通知失败不影响记账本身
    }
  }

  /** 没通知权限时写一条可见的日志：否则用户只会觉得「什么都没发生」 */
  private fun logNoPermission(context: Context, amountFen: Long) {
    val now = System.currentTimeMillis()
    if (now - lastWarnAt < 10 * 60 * 1000L) return
    lastWarnAt = now

    DebugLogStore.append(
      context,
      DebugLogStore.Entry(
        timestamp = now,
        packageName = "self",
        title = "通知没发出：缺少通知权限",
        text = "已记账 ¥${String.format("%.2f", amountFen / 100.0)}，但系统不允许本应用发通知。" +
          "请到「设置 → 应用 → 记账工具 → 通知」打开，或在应用内设置页授权。",
        bigText = "",
        subText = "",
        tickerText = "",
        extrasDump = "",
        isMatch = false,
        amountFen = amountFen,
        matchedKeyword = "notification-permission"
      )
    )
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
