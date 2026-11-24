package expo.modules.notificationlistener

import android.accessibilityservice.AccessibilityService
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import java.util.concurrent.atomic.AtomicInteger

/**
 * 读屏自动记账（无障碍服务）。
 *
 * 为什么需要它：微信/支付宝有些场景**不发系统通知**（例如停留在支付结果页、
 * 收款到账只在聊天里提示），通知监听抓不到。荣耀 AI 记账的「停留 1-2 秒自动记账」
 * 就是靠这个能力实现的。
 *
 * 安全边界（重要）：
 * - 只在配置里声明的两个包（微信/支付宝）上收事件，其他应用的内容一律不读
 * - 只有整页文本里出现「支付成功」这类成功标记才解析，普通聊天不会进日志
 * - 任何异常都吞掉，绝不把崩溃抛给系统（否则会被反复重启）
 */
class ReceiptAccessibilityService : AccessibilityService() {

  companion object {
    private const val TAG = "ReceiptA11y"

    private val TARGET_PACKAGES = setOf("com.tencent.mm", "com.eg.android.AlipayGphone")

    /** 出现这些词才认为当前页面是「交易成功页」 */
    private val SUCCESS_MARKERS = listOf(
      "支付成功", "付款成功", "交易成功", "转账成功", "已支付",
      "收款到账", "已收款", "收款成功", "已存入零钱", "支付完成", "到账通知"
    )

    /** 防抖：内容变化会连续触发，等这次静默后再扫一遍整页 */
    private const val DEBOUNCE_MS = 700L

    /** 同一笔（同包名+同金额）抑制重复解析 */
    private const val REPEAT_WINDOW_MS = 20_000L
  }

  private val handler = Handler(Looper.getMainLooper())
  private var pendingScan: Runnable? = null

  private var lastSignature: String = ""
  private var lastSignatureAt: Long = 0L

  private val scanCount = AtomicInteger(0)

  override fun onServiceConnected() {
    super.onServiceConnected()
    try {
      Log.i(TAG, "读屏服务已连接")
    } catch (t: Throwable) {
      // 忽略
    }
  }

  override fun onInterrupt() {
    // 系统要求实现，无需处理
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    try {
      val packageName = event?.packageName?.toString() ?: return
      if (packageName !in TARGET_PACKAGES) return

      val type = event.eventType
      if (type != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED &&
        type != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
      ) {
        return
      }

      // 防抖：取消上一次待执行的扫描，重新计时
      pendingScan?.let { handler.removeCallbacks(it) }
      val task = Runnable { scan(packageName) }
      pendingScan = task
      handler.postDelayed(task, DEBOUNCE_MS)
    } catch (t: Throwable) {
      Log.w(TAG, "onAccessibilityEvent 异常", t)
    }
  }

  override fun onDestroy() {
    try {
      pendingScan?.let { handler.removeCallbacks(it) }
    } catch (t: Throwable) {
      // 忽略
    }
    super.onDestroy()
  }

  private fun scan(packageName: String) {
    try {
      val root = rootInActiveWindow ?: return

      val builder = StringBuilder()
      collectText(root, builder, 0)

      val combined = builder.toString().trim()
      if (combined.length < 4) return

      // 不是交易结果页就别动：既省电也避免碰到隐私内容
      if (SUCCESS_MARKERS.none { combined.contains(it) }) return

      val result = AmountParser.parse(combined)
      val amountFen = result.amountFen

      if (!result.isMatch || amountFen == null) {
        DebugLogStore.append(
          this,
          DebugLogStore.Entry(
            timestamp = System.currentTimeMillis(),
            packageName = packageName,
            title = "读屏（未解析出金额）",
            text = combined.take(300),
            bigText = "",
            subText = "",
            tickerText = "",
            extrasDump = "",
            isMatch = false,
            amountFen = null,
            matchedKeyword = result.matchedKeyword
          )
        )
        return
      }

      // 同一笔反复解析（页面刷新会触发多次）
      val signature = "$packageName|$amountFen|${result.matchedKeyword}"
      val now = System.currentTimeMillis()
      if (signature == lastSignature && now - lastSignatureAt < REPEAT_WINDOW_MS) return
      lastSignature = signature
      lastSignatureAt = now

      val appName = if (packageName == "com.tencent.mm") "微信" else "支付宝"

      DebugLogStore.append(
        this,
        DebugLogStore.Entry(
          timestamp = now,
          packageName = packageName,
          title = "读屏命中",
          text = combined.take(300),
          bigText = "",
          subText = "",
          tickerText = "",
          extrasDump = "",
          isMatch = true,
          amountFen = amountFen,
          matchedKeyword = result.matchedKeyword
        )
      )

      scanCount.incrementAndGet()
      Log.i(TAG, "读屏命中：${result.matchedKeyword} $amountFen 分（第 ${scanCount.get()} 次）")

      CaptureDispatcher.dispatch(
        context = this,
        amountFen = amountFen,
        direction = result.direction,
        keyword = result.matchedKeyword,
        combined = combined,
        title = "",
        packageName = packageName,
        appName = appName,
        postedAt = now,
        source = "a11y"
      )
    } catch (t: Throwable) {
      Log.w(TAG, "扫描页面失败", t)
    }
  }

  /** 递归收集页面文本（限制深度与总量，避免超大列表把主线程拖死） */
  private fun collectText(node: AccessibilityNodeInfo?, out: StringBuilder, depth: Int) {
    if (node == null || depth > 25 || out.length > 4000) return

    try {
      node.text?.let { if (it.isNotBlank()) out.append(it).append('\n') }
      node.contentDescription?.let { if (it.isNotBlank()) out.append(it).append('\n') }

      val count = minOf(node.childCount, 40)
      for (index in 0 until count) {
        collectText(node.getChild(index), out, depth + 1)
      }
    } catch (t: Throwable) {
      Log.w(TAG, "读取节点失败", t)
    }
  }
}
