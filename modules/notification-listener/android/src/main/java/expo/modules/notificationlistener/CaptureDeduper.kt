package expo.modules.notificationlistener

/**
 * 同一条支付被多路同时捕获时的去重。
 *
 * 现实情况：用银行卡付款时，微信通知 + 银行短信会几乎同时到达；
 * 只按「同包名」去重拦不住，所以这里改成**同金额跨来源**也算重复。
 * 代价是 90 秒内两笔金额完全相同的真实付款只会记第一笔（概率极低，可以接受）。
 */
internal object CaptureDeduper {

  /** 同一来源：60 秒内同金额视为重复 */
  private const val SAME_SOURCE_MS = 60_000L

  /** 跨来源（通知 ↔ 短信 ↔ 读屏）：90 秒内同金额视为重复 */
  private const val CROSS_SOURCE_MS = 90_000L

  private data class Recent(val packageName: String, val amountFen: Long, val at: Long)

  private var last: Recent? = null

  @Synchronized
  fun shouldEmit(packageName: String, amountFen: Long): Boolean {
    val now = System.currentTimeMillis()
    val previous = last

    if (previous != null && previous.amountFen == amountFen) {
      val window = if (previous.packageName == packageName) SAME_SOURCE_MS else CROSS_SOURCE_MS
      if (now - previous.at < window) return false
    }

    last = Recent(packageName, amountFen, now)
    return true
  }
}
