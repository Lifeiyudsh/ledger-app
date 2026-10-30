package expo.modules.notificationlistener

import android.content.Context
import org.json.JSONObject

/**
 * 悬浮窗诊断状态。
 *
 * 存在意义：气泡弹不出来时，用户看不到 logcat。这里把「最后一次决策的每个输入」
 * 留在内存里，由 JS 通过 getDebugState() 读出来展示/复制，就不用反复打包排查了。
 */
internal object OverlayDebugState {

  /** 最近一次判定的结果，人话描述 */
  @Volatile
  var lastDecision: String = "（本次启动还没有抓到过交易）"

  @Volatile
  var lastDecisionAt: Long = 0

  /** 判定那一刻，原生认为 App 是否在前台 */
  @Volatile
  var lastForegroundAtDecision: Boolean? = null

  /** 判定那一刻，是否已授予悬浮窗权限 */
  @Volatile
  var lastCanDrawAtDecision: Boolean? = null

  /** 判定那一刻的原始标志位（生命周期回调写的那一路） */
  @Volatile
  var lastForegroundFlag: Boolean? = null

  /** 判定那一刻的进程 importance（-1 = 取不到） */
  @Volatile
  var lastImportance: Int = -1

  /** 结论由哪一路信号决定 */
  @Volatile
  var lastForegroundSource: String = "-"

  /** importance 是从哪个 API 拿的（myMemoryState / runningAppProcesses / unavailable） */
  @Volatile
  var lastImportanceSource: String = "-"

  /** 读 importance 时所在的进程名（服务未配 android:process，应等于包名） */
  @Volatile
  var lastProcessName: String = "-"

  /** addView 是否成功（null = 还没试过） */
  @Volatile
  var lastAddViewOk: Boolean? = null

  /** addView 抛出的异常信息 */
  @Volatile
  var lastError: String? = null

  /** 实际用到的窗口类型，便于确认走的是 2038 还是 2002 */
  @Volatile
  var lastWindowType: String = "-"

  @Volatile
  var showAttempts: Int = 0

  @Volatile
  var showSuccesses: Int = 0

  /** 最近一条命中的通知原文（截断），排查解析问题用 */
  @Volatile
  var lastNotificationText: String = ""

  fun recordDecision(
    decision: String,
    check: ForegroundTracker.Check?,
    canDraw: Boolean?,
    notificationText: String
  ) {
    lastDecision = decision
    lastDecisionAt = System.currentTimeMillis()
    lastForegroundAtDecision = check?.foreground
    lastForegroundFlag = check?.flag
    lastImportance = check?.importance ?: -1
    lastForegroundSource = check?.source ?: "-"
    lastImportanceSource = check?.importanceSource ?: "-"
    lastProcessName = check?.processName ?: "-"
    lastCanDrawAtDecision = canDraw
    if (notificationText.isNotEmpty()) {
      lastNotificationText = notificationText.take(200)
    }
  }

  /**
   * 输出 JSON 字符串给 JS（比直接传 Map 更稳：不依赖 expo 的字典转换规则）。
   */
  fun snapshotJson(context: Context?): String {
    val json = JSONObject()

    try {
      json.put(
        "canDrawOverlays",
        context?.let { OverlayBubbleManager.isPermissionGranted(it) } ?: false
      )
      json.put("isAppInForeground", NotificationBridge.isAppInForeground)
      json.put("lastDecision", lastDecision)
      json.put("lastDecisionAt", lastDecisionAt.toDouble())
      json.put("lastForegroundAtDecision", lastForegroundAtDecision ?: JSONObject.NULL)
      json.put("lastCanDrawAtDecision", lastCanDrawAtDecision ?: JSONObject.NULL)
      json.put("lastForegroundFlag", lastForegroundFlag ?: JSONObject.NULL)
      json.put("lastImportance", lastImportance)
      json.put("lastForegroundSource", lastForegroundSource)
      json.put("lastImportanceSource", lastImportanceSource)
      json.put("lastProcessName", lastProcessName)
      json.put("lastEventSource", ForegroundTracker.lastEventSource)
      json.put("lastAddViewOk", lastAddViewOk ?: JSONObject.NULL)
      json.put("lastError", lastError ?: JSONObject.NULL)
      json.put("lastWindowType", lastWindowType)
      json.put("showAttempts", showAttempts)
      json.put("showSuccesses", showSuccesses)
      json.put("lastNotificationText", lastNotificationText)
      json.put("pendingQueueSize", context?.let { PendingQueueStore.readAll(it).size } ?: 0)
      json.put("listenerConnected", TransactionNotificationService.isConnected())
    } catch (t: Throwable) {
      // 出问题也要给 JS 一个可用字符串，不能让诊断入口自己崩
      return "{\"error\":\"${t.javaClass.simpleName}: ${t.message}\"}"
    }

    return json.toString()
  }
}
