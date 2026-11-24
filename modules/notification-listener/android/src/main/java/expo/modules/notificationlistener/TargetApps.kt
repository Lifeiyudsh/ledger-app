package expo.modules.notificationlistener

/**
 * 需要识别支付的应用白名单。
 *
 * 通知监听、读屏、日志过滤都用这一份，避免三处各写一遍导致口径不一致。
 * 读屏的 xml 配置里也限定了同样两个包（那里无法引用 Kotlin 常量，改的时候要一起改）。
 */
internal object TargetApps {

  val PACKAGES: Set<String> = setOf("com.tencent.mm", "com.eg.android.AlipayGphone")

  fun isTarget(packageName: String): Boolean = packageName in PACKAGES

  fun label(packageName: String): String = when (packageName) {
    "com.tencent.mm" -> "微信"
    "com.eg.android.AlipayGphone" -> "支付宝"
    else -> packageName
  }
}
