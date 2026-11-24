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
