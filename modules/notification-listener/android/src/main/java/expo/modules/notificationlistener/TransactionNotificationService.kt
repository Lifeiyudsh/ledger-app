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

    // 只记和钱有关的：命中的 / 目标应用的 / 正文出现金额或支付字眼的。
    // 否则「XX 已使用 5 小时 47 分钟」这类通知会把 50 条容量占满，把有用的记录挤掉。
    if (result.isMatch || TargetApps.isTarget(packageName) || looksPaymentRelated(combined, title)) {
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
    }

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

    // 出口统一走 CaptureDispatcher（与读屏服务共用同一套气泡/横幅决策）
    CaptureDispatcher.dispatch(
      context = this,
      amountFen = amountFen,
      direction = result.direction,
      keyword = result.matchedKeyword,
      combined = combined,
      title = title,
      packageName = packageName,
      appName = appLabel(packageName),
      postedAt = sbn.postTime,
      source = "notification"
    )
  }

  override fun onDestroy() {
    // 服务被系统回收时清掉可能残留的气泡，避免「幽灵悬浮窗」
    OverlayBubbleManager.dismiss()
    super.onDestroy()
  }

  private fun Bundle?.readText(key: String): String =
    this?.getCharSequence(key)?.toString()?.trim().orEmpty()

  /** 粗筛：正文像不像一条和钱有关的记录（决定要不要写调试日志） */
  private fun looksPaymentRelated(text: String, title: String): Boolean {
    val haystack = "$text\n$title"
    return PAYMENT_HINTS.any { haystack.contains(it) }
  }

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

    /** 日志只关心和支付相关的通知，其余的一律不写盘 */
    private val PAYMENT_HINTS = listOf(
      "¥", "￥", "元", "支付", "消费", "付款", "收款", "转账", "退款", "扣款", "账单"
    )

    private val SUMMARY_PATTERN = Regex("""\[\s*[0-9]+\s*条\s*\]""")

    /** 服务是否被系统绑定，供 JS 端展示 */
    @Volatile
    private var connected = false

    fun isConnected(): Boolean = connected
  }
}
