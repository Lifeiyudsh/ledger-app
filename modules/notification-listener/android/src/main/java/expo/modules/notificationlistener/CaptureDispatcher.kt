package expo.modules.notificationlistener

import android.content.Context
import android.util.Log

/**
 * 捕获出口（通知监听 / 无障碍读屏共用）。
 *
 * 决策：App 在后台且有悬浮窗权限 → 弹气泡；否则发事件给 JS 走应用内横幅。
 * 两路进来的数据走同一个出口，保证下游（队列、补录、去重）只实现一次。
 */
internal object CaptureDispatcher {

  private const val TAG = "CaptureDispatch"

  fun dispatch(
    context: Context,
    amountFen: Long,
    direction: String,
    keyword: String,
    combined: String,
    title: String,
    packageName: String,
    appName: String,
    postedAt: Long,
    source: String
  ) {
    // 开关打开时确保常驻服务在跑，否则后台被冻结会导致提示延迟
    if (OverlayAlertConfig.isEnabled(context)) {
      try {
        CaptureForegroundService.start(context)
      } catch (t: Throwable) {
        Log.w(TAG, "拉起常驻服务失败", t)
      }
    }

    // 通知与读屏可能同时命中同一笔，这里拦掉
    if (!CaptureDeduper.shouldEmit(packageName, amountFen)) {
      Log.d(TAG, "重复捕获已忽略：$packageName $amountFen 分")
      return
    }

    // 只有一条路径：入队 → 立即可入库 + 弹通知（通知上能改分类/写备注）。
    // 不再分「免确认 / 待确认」两套，避免关掉开关后体验完全变样。
    Log.d(TAG, "[$source] 命中 amount=${amountFen}fen")
    OverlayDebugState.recordDecision("自动入账（$source）", null, null, combined)

    queueAutoRecord(context, amountFen, direction, combined, title, packageName, appName, postedAt)
  }

  /**
   * 写进补录队列（待入库），并把事件抛给 JS 立刻 drain。
   * 队列存在 SharedPreferences，JS 不在也能等下次启动补上。
   */
  private fun queueAutoRecord(
    context: Context,
    amountFen: Long,
    direction: String,
    combined: String,
    title: String,
    packageName: String,
    appName: String,
    postedAt: Long
  ) {
    val note = MerchantExtractor.extract(combined, title).ifBlank { appName }

    val entry = PendingQueueStore.Entry(
      id = "$postedAt-$amountFen",
      amountFen = amountFen,
      direction = direction,
      note = note,
      rawText = combined,
      appName = appName,
      packageName = packageName,
      postedAt = postedAt,
      confirmedAt = System.currentTimeMillis()
    )

    val queued = PendingQueueStore.append(context, entry)
    Log.d("CaptureDispatch", "自动记账入队 amount=$amountFen queued=$queued")

    if (queued) {
      // 优先用悬浮提示条（一定盖在当前页面上）；
      // 没有悬浮窗权限时退回通知（受系统横幅开关影响，可能只进通知栏）。
      if (OverlayAlertConfig.isEnabled(context) && QuickBarOverlay.isPermissionGranted(context)) {
        QuickBarOverlay.show(context, entry.id, amountFen, appName)
      } else {
        CaptureNotifier.notify(
          context = context,
          captureId = entry.id,
          amountFen = amountFen,
          appName = appName,
          note = note
        )
      }

      // 复用「气泡确认」事件：JS 收到就 drain 队列，不用再加一条事件通道
      NotificationBridge.emitOverlayConfirmed(
        mapOf(
          "amountFen" to amountFen,
          "fallback" to false
        )
      )
    } else {
      // 队列写失败（极端情况）：留日志便于排查，不再退回横幅（横幅已废弃）
      Log.w("CaptureDispatch", "入队失败，这笔未入账 amount=$amountFen pkg=$packageName")
    }
  }

}
