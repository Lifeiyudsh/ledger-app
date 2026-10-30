package expo.modules.notificationlistener

/**
 * 从通知文本里捞商户名（Kotlin 侧，供悬浮窗和队列使用）。
 *
 * 注意：`src/lib/pendingCapture.ts` 里有一份等价实现给应用内横幅用。
 * 两边规则要保持一致，改这里时记得同步那边。
 */
internal object MerchantExtractor {

  private val PATTERNS = listOf(
    Regex("""收款方[:：]\s*([^\n|]{1,40})"""),
    Regex("""商户名?称?[:：]\s*([^\n|]{1,40})"""),
    Regex("""付款给\s*([^\n|]{1,40})"""),
    Regex("""向\s*([^\n|]{1,40})\s*付款"""),
    Regex("""转给\s*([^\n|]{1,40})""")
  )

  private val BRAND_ONLY = Regex("""微信支付|支付宝|云闪付|通知""")

  fun extract(rawText: String?, title: String?): String {
    val text = "${rawText ?: ""}\n${title ?: ""}"

    for (pattern in PATTERNS) {
      val matched = pattern.find(text) ?: continue
      val value = clean(matched.groupValues.getOrNull(1) ?: "")
      if (value.isNotEmpty() && !value.first().isDigit() && value.first() != '¥') {
        return value
      }
    }

    val cleanedTitle = clean(title ?: "")
    if (cleanedTitle.isNotEmpty() && !BRAND_ONLY.containsMatchIn(cleanedTitle)) {
      return cleanedTitle
    }

    return ""
  }

  /** 去掉「张三 ¥100.00」「星巴克 25.00」这种尾巴，只留商户名 */
  private fun clean(raw: String): String {
    val cutAtCurrency = raw.replace(Regex("""[¥￥][\s\S]*$"""), "")
    val withoutTrailingAmount = cutAtCurrency.replace(Regex("""\s*\d[\d.,]*\s*元?\s*$"""), "")
    return withoutTrailingAmount
      .replace(Regex("""[，,。.;；:：]+$"""), "")
      .trim()
      .take(24)
  }
}
