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
    // 通知与读屏可能同时命中同一笔，这里拦掉
    if (!CaptureDeduper.shouldEmit(packageName, amountFen)) {
      Log.d(TAG, "重复捕获已忽略：$packageName $amountFen 分")
      return
    }

    // 免确认模式：直接进补录队列，JS 一有机会就入库，用户不用点任何东西
    if (AutoBookkeepingConfig.isEnabled(context)) {
      queueAutoRecord(context, amountFen, direction, combined, title, packageName, appName, postedAt)
      OverlayDebugState.recordDecision("自动记账（免确认，$source）", null, true, combined)
      return
    }

    val check = ForegroundTracker.check(context)
    val canDraw = OverlayBubbleManager.isPermissionGranted(context)

    Log.d(
      TAG,
      "[$source] 命中 amount=${amountFen}fen dir=$direction foreground=${check.foreground} " +
        "flag=${check.flag} importance=${check.importance}(${check.importanceSource}) canDrawOverlays=$canDraw"
    )

    if (!check.foreground && canDraw) {
      OverlayDebugState.recordDecision("走气泡（$source）", check, canDraw, combined)

      OverlayBubbleManager.show(
        context,
        OverlayBubbleManager.OverlayItem(
          id = "$postedAt-$amountFen",
          amountFen = amountFen,
          direction = direction,
          note = MerchantExtractor.extract(combined, title),
          rawText = combined,
          appName = appName,
          packageName = packageName,
          postedAt = postedAt
        ),
        onFallback = {
          OverlayDebugState.recordDecision(
            "气泡失败，降级横幅：${OverlayDebugState.lastError ?: "未知原因"}",
            check,
            canDraw,
            combined
          )
          emit(amountFen, direction, keyword, combined, title, packageName, appName, postedAt, source)
        }
      )
      return
    }

    val reason = if (check.foreground) {
      "判定为前台，走应用内横幅（$source）"
    } else {
      "无悬浮窗权限，走应用内横幅（$source）"
    }
    Log.d(TAG, reason)
    OverlayDebugState.recordDecision(reason, check, canDraw, combined)

    emit(amountFen, direction, keyword, combined, title, packageName, appName, postedAt, source)
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
      // 复用「气泡确认」事件：JS 收到就 drain 队列，不用再加一条事件通道
      NotificationBridge.emitOverlayConfirmed(
        mapOf(
          "amountFen" to amountFen,
          "fallback" to false
        )
      )
    } else {
      // 队列写失败就退回横幅，至少不丢
      emit(amountFen, direction, "", combined, title, packageName, appName, postedAt, "auto-fallback")
    }
  }

  /** 应用内横幅通道（JS 收到后只做「待确认」，不会直接写库） */
  private fun emit(
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
    NotificationBridge.emit(
      mapOf(
        "amount" to amountFen / 100.0,
        "amountFen" to amountFen,
        "type" to direction,
        "keyword" to keyword,
        "rawText" to combined,
        "title" to title,
        "packageName" to packageName,
        "appName" to appName,
        "postedAt" to postedAt.toDouble(),
        "source" to source
      )
    )
  }
}
