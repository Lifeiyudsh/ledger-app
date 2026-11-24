package expo.modules.notificationlistener

/**
 * 银行动账短信解析。
 *
 * 各家银行文案不一样，但结构高度同质：
 *   【招商银行】您账户1234于11月24日12:30在星巴克消费人民币28.00元，余额1234.56元。
 *   【工商银行】您尾号1234的储蓄卡11月24日消费支出28.00元
 *
 * 策略：先做归一化（人民币/RMB → ¥），再按「必须同时有金额 + 动账动词」判定，
 * 商户名用「在X消费」这类句式抽，抽不到就留空。
 */
internal object SmsParser {

  data class ParsedSms(
    val amountFen: Long,
    val direction: String,
    val merchant: String,
    val bank: String,
    val cardTail: String,
    val keyword: String,
    val note: String
  )

  /** 一律跳过的短信：验证码、营销、账单汇总、额度通知 */
  private val IGNORE = listOf(
    "验证码", "动态码", "校验码", "确认码",
    "额度", "账单日", "最低还款", "年费", "分期",
    "退订", "回复TD", "优惠", "活动", "抽奖"
  )

  // 刻意不含裸「支付」：「支付宝」三个字会让任何含品牌名的短信误判成支出
  private val EXPENSE_WORDS = listOf("消费", "支出", "取款", "取现", "扣款", "付款", "转出", "还款")
  private val INCOME_WORDS = listOf("收入", "存入", "转入", "入账", "到账", "退款", "退货")

  private val AMOUNT_WITH_SYMBOL = Regex("""[¥￥]\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)""")
  private val AMOUNT_WITH_YUAN = Regex("""([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*元""")

  private val MERCHANT_PATTERNS = listOf(
    Regex("""在\s*([^\s，,。；;]{2,24}?)\s*(?:消费|支付|付款|取款|取现|刷卡)"""),
    Regex("""(?:商户名称|商户|收款方)\s*[:：]?\s*([^\s，,。；;]{2,24})"""),
    Regex("""于\s*([^\s，,。；;]{2,24}?)\s*(?:消费|支付|付款)""")
  )

  private val BANK_PATTERN = Regex("""【\s*([^】]{2,12}?)\s*】""")
  private val CARD_TAIL = Regex("""(?:尾号|末四位|后四位|账户)\D{0,3}(\d{4})""")

  private fun normalize(text: String): String = text
    // 先抹掉品牌名，避免「支付宝」「微信支付」里的「支付」被当成动账动词
    .replace("支付宝", "")
    .replace("微信支付", "")
    .replace("云闪付", "")
    .replace("人民币", "¥")
    .replace("RMB", "¥")
    .replace("CNY", "¥")
    .replace('，', ',')
    .replace('．', '.')

  private fun toFen(raw: String): Long? {
    val cleaned = raw.replace(",", "").trim()
    if (!Regex("""^[0-9]+(\.[0-9]{1,2})?$""").matches(cleaned)) return null
    val value = cleaned.toBigDecimalOrNull() ?: return null
    val fen = value.movePointRight(2).setScale(0, java.math.RoundingMode.HALF_UP).toLong()
    return if (fen > 0) fen else null
  }

  fun parse(body: String?): ParsedSms? {
    val raw = body ?: return null
    if (raw.isBlank()) return null
    if (IGNORE.any { raw.contains(it) }) return null

    val text = normalize(raw)

    // 金额：优先带 ¥ 的写法（归一化后人民币也变成了 ¥），其次「N元」
    val amountMatch = AMOUNT_WITH_SYMBOL.find(text) ?: AMOUNT_WITH_YUAN.find(text)
    val amountText = amountMatch?.groupValues?.getOrNull(1) ?: return null
    val amountFen = toFen(amountText) ?: return null

    val expenseHit = EXPENSE_WORDS.firstOrNull { text.contains(it) }
    val incomeHit = INCOME_WORDS.firstOrNull { text.contains(it) }

    // 两个方向都没命中 → 可能只是余额提醒，不记
    if (expenseHit == null && incomeHit == null) return null

    val direction = when {
      // 「退款」优先按收入：银行短信里消费退款会同时出现「消费」和「退款」
      incomeHit != null && (expenseHit == null || incomeHit == "退款" || incomeHit == "退货") ->
        DIRECTION_INCOME
      expenseHit != null -> DIRECTION_EXPENSE
      else -> DIRECTION_INCOME
    }

    val bank = BANK_PATTERN.find(text)?.groupValues?.getOrNull(1)?.trim().orEmpty()
    val cardTail = CARD_TAIL.find(text)?.groupValues?.getOrNull(1).orEmpty()

    val merchant = MERCHANT_PATTERNS
      .firstNotNullOfOrNull { pattern -> pattern.find(text)?.groupValues?.getOrNull(1)?.trim() }
      .orEmpty()
      .trim()

    val noteParts = mutableListOf<String>()
    if (bank.isNotEmpty()) noteParts.add(bank)
    if (cardTail.isNotEmpty()) noteParts.add("($cardTail)")
    val prefix = noteParts.joinToString("").trim()

    val keyword = expenseHit ?: incomeHit ?: ""
    val note = listOf(prefix, merchant.ifBlank { "银行短信" })
      .filter { it.isNotBlank() }
      .joinToString(" · ")
      .take(100)

    return ParsedSms(
      amountFen = amountFen,
      direction = direction,
      merchant = merchant.ifBlank { bank.ifBlank { "银行短信" } },
      bank = bank,
      cardTail = cardTail,
      keyword = keyword,
      note = note
    )
  }
}
