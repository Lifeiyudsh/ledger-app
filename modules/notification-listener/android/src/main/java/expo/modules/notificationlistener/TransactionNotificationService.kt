package expo.modules.notificationlistener

import android.app.Notification
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log

/**
 * 系统在用户授予「通知使用权」后自动绑定此 Service，进程被杀后也会被重新拉起。
 *
 * 每条通知都会先落盘（SharedPreferences，最近 50 条），再 emit 给 JS。
 * 因此即使 JS 在后台收不到事件，切回前台调 getLogs() 依然能看到原文。
 */
class TransactionNotificationService : NotificationListenerService() {

  override fun onListenerConnected() {
    super.onListenerConnected()
    connected = true
    Log.i(TAG, "通知监听已连接")
  }

  override fun onListenerDisconnected() {
    super.onListenerDisconnected()
    connected = false
    Log.w(TAG, "通知监听已断开")
  }

  override fun onNotificationPosted(incoming: StatusBarNotification?) {
    val sbn = incoming ?: return
    val notification = sbn.notification ?: return
    val packageName = sbn.packageName ?: return

    val extras = notification.extras
    val title = extras.readText(Notification.EXTRA_TITLE)
    val text = extras.readText(Notification.EXTRA_TEXT)
    val bigText = extras.readText(Notification.EXTRA_BIG_TEXT)
    val subText = extras.readText(Notification.EXTRA_SUB_TEXT)
    val tickerText = notification.tickerText?.toString()?.trim().orEmpty()
    val rawExtrasDump = dumpExtras(extras)

    // 本条通知能拿到的全部文本
    val ownText = listOf(title, text, bigText, subText, tickerText, rawExtrasDump)
      .filter { it.isNotBlank() }
      .joinToString("\n")

    // 「[2条]微信支付：退款到账通知」这类聚合摘要本身不带金额，
    // 金额在同一个 group 的子通知里 —— 展开后一起参与解析。
    val siblingText = dumpSiblings(sbn, ownText)

    val combined = listOf(ownText, siblingText)
      .filter { it.isNotBlank() }
      .joinToString("\n")

    if (combined.isBlank()) return

    // 把展开到的兄弟通知也写进 extrasDump，界面上能直接看到用来定位
    val extrasDump = if (siblingText.isBlank()) {
      rawExtrasDump
    } else {
      listOf(rawExtrasDump, "--- 同组/同包通知 ---", siblingText)
        .filter { it.isNotBlank() }
        .joinToString("\n")
    }

    val result = AmountParser.parse(combined)

    DebugLogStore.append(
      applicationContext,
      DebugLogStore.Entry(
        timestamp = System.currentTimeMillis(),
        packageName = packageName,
        title = title,
        text = text,
        bigText = bigText,
        subText = subText,
        tickerText = tickerText,
        extrasDump = extrasDump,
        isMatch = result.isMatch,
        amountFen = result.amountFen,
        matchedKeyword = result.matchedKeyword
      )
    )

    Log.d(
      TAG,
      "通知 pkg=$packageName match=${result.isMatch} fen=${result.amountFen} keyword=${result.matchedKeyword}"
    )
    Log.d(TAG, "原文=$combined")

    // 保留事件通道，JS 在前台时可以即时刷新
    NotificationBridge.emitRaw(
      mapOf(
        "packageName" to packageName,
        "appName" to appLabel(packageName),
        "title" to title,
        "text" to text,
        "bigText" to bigText,
        "subText" to subText,
        "rawText" to combined,
        "postedAt" to sbn.postTime.toDouble()
      )
    )

    val amountFen = result.amountFen
    if (!result.isMatch || amountFen == null) return

    Log.i(TAG, "命中：${result.matchedKeyword} $amountFen 分")

    val appName = appLabel(packageName)
    val postedAt = sbn.postTime

    // 两路信号交叉验证（见 ForegroundTracker 注释）：两路都说前台才算前台
    val check = ForegroundTracker.check(this)
    val canDraw = OverlayBubbleManager.isPermissionGranted(this)

    Log.d(
      TAG,
      "[overlay] 命中 amount=${amountFen}fen dir=${result.direction} " +
        "foreground=${check.foreground} flag=${check.flag} " +
        "importance=${check.importance}(${check.importanceSource}) " +
        "source=${check.source} proc=${check.processName} canDrawOverlays=$canDraw"
    )

    // App 在后台 + 已授权悬浮窗 → 直接弹气泡，点一下就入库，不用切回 App
    if (!check.foreground && canDraw) {
      OverlayDebugState.recordDecision("走气泡（后台 + 有权限）", check, canDraw, combined)

      OverlayBubbleManager.show(
        this,
        OverlayBubbleManager.OverlayItem(
          id = "$postedAt-$amountFen",
          amountFen = amountFen,
          direction = result.direction,
          note = MerchantExtractor.extract(combined, title),
          rawText = combined,
          appName = appName,
          packageName = packageName,
          postedAt = postedAt
        ),
        onFallback = {
          // 气泡弹不出来（addView 失败等）→ 降级为应用内横幅
          OverlayDebugState.recordDecision(
            "气泡失败，降级横幅：${OverlayDebugState.lastError ?: "未知原因"}",
            check,
            canDraw,
            combined
          )
          emitTransaction(amountFen, result, combined, title, packageName, appName, postedAt)
        }
      )
      return
    }

    val reason = if (check.foreground) {
      "判定为前台，走应用内横幅"
    } else {
      "无悬浮窗权限，走应用内横幅"
    }
    Log.d(TAG, "[overlay] $reason（${check.source}）")
    OverlayDebugState.recordDecision(reason, check, canDraw, combined)

    emitTransaction(amountFen, result, combined, title, packageName, appName, postedAt)
  }

  /** 应用内横幅通道（JS 收到后只做「待确认」，不会直接写库） */
  private fun emitTransaction(
    amountFen: Long,
    result: ParseResult,
    combined: String,
    title: String,
    packageName: String,
    appName: String,
    postedAt: Long
  ) {
    NotificationBridge.emit(
      mapOf(
        "amount" to amountFen / 100.0,
        "amountFen" to amountFen,
        "type" to result.direction,
        "keyword" to result.matchedKeyword,
        "rawText" to combined,
        "title" to title,
        "packageName" to packageName,
        "appName" to appName,
        "postedAt" to postedAt.toDouble()
      )
    )
  }

  override fun onDestroy() {
    // 服务被系统回收时清掉可能残留的气泡，避免「幽灵悬浮窗」
    OverlayBubbleManager.dismiss()
    super.onDestroy()
  }

  private fun Bundle?.readText(key: String): String =
    this?.getCharSequence(key)?.toString()?.trim().orEmpty()

  /** 聚合摘要形如「[2条]微信支付：退款到账通知」，本身不含金额 */
  private fun looksLikeSummary(text: String): Boolean = SUMMARY_PATTERN.containsMatchIn(text)

  /**
   * 展开同一 group（或同包）下的兄弟通知。
   * 微信/支付宝把多条通知折叠成一条摘要时，真正的金额在子通知里。
   */
  private fun dumpSiblings(sbn: StatusBarNotification, ownText: String): String {
    val group = sbn.notification.group
    if (group == null && !looksLikeSummary(ownText)) return ""

    val active = try {
      activeNotifications
    } catch (e: Exception) {
      Log.w(TAG, "读取激活通知列表失败", e)
      null
    } ?: return ""

    val siblings = active
      .filter { it.key != sbn.key && it.packageName == sbn.packageName }
      .filter { group == null || it.notification.group == group }
      .take(MAX_SIBLINGS)

    if (siblings.isEmpty()) return ""

    return siblings.joinToString("\n") { sibling ->
      val siblingText = collectText(sibling.notification)
      if (siblingText.isBlank()) "${sibling.packageName}: (无文本)"
      else "${sibling.packageName}: $siblingText"
    }
  }

  private fun collectText(notification: Notification): String {
    val extras = notification.extras
    return listOf(
      extras.readText(Notification.EXTRA_TITLE),
      extras.readText(Notification.EXTRA_TEXT),
      extras.readText(Notification.EXTRA_BIG_TEXT),
      extras.readText(Notification.EXTRA_SUB_TEXT),
      notification.tickerText?.toString()?.trim().orEmpty()
    ).filter { it.isNotBlank() }.joinToString(" | ")
  }

  /** 把 extras 里所有字符串型字段 dump 出来，key=value 逐行 */
  private fun dumpExtras(extras: Bundle?): String {
    if (extras == null) return ""

    val sb = StringBuilder()
    for (key in extras.keySet()) {
      val value = extras.get(key)
      val str = (value as? CharSequence)?.toString()?.trim().orEmpty()
      if (str.isEmpty()) continue

      sb.append(key).append('=').append(str).append('\n')
      if (sb.length > DUMP_LIMIT) break
    }
    return sb.toString().trim()
  }

  private fun appLabel(packageName: String): String {
    val lower = packageName.lowercase()
    return when {
      lower.contains("alipay") -> "支付宝"
      lower.contains("tencent.mm") -> "微信"
      lower.contains("taobao") -> "淘宝"
      lower.contains("unionpay") -> "云闪付"
      else -> packageName
    }
  }

  companion object {
    private const val TAG = "NotifyListener"
    private const val DUMP_LIMIT = 4000
    private const val MAX_SIBLINGS = 10

    private val SUMMARY_PATTERN = Regex("""\[\s*[0-9]+\s*条\s*\]""")

    /** 服务是否被系统绑定，供 JS 端展示 */
    @Volatile
    private var connected = false

    fun isConnected(): Boolean = connected
  }
}
