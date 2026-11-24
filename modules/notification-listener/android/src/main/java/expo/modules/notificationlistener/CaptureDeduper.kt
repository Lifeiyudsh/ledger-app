package expo.modules.notificationlistener

/**
 * 同一条支付被两路同时捕获时的去重（通知监听 + 无障碍读屏会撞车）。
 * 规则：同包名 + 同金额，60 秒内只放行一次。
 */
internal object CaptureDeduper {

  private const val WINDOW_MS = 60_000L

  private var lastPackage: String? = null
  private var lastAmountFen: Long = 0L
  private var lastAt: Long = 0L

  @Synchronized
  fun shouldEmit(packageName: String, amountFen: Long): Boolean {
    val now = System.currentTimeMillis()
    val duplicated =
      packageName == lastPackage && amountFen == lastAmountFen && now - lastAt < WINDOW_MS

    if (duplicated) return false

    lastPackage = packageName
    lastAmountFen = amountFen
    lastAt = now
    return true
  }
}
