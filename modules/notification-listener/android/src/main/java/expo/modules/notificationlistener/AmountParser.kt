package expo.modules.notificationlistener

import java.math.RoundingMode

const val DIRECTION_INCOME = "income"
const val DIRECTION_EXPENSE = "expense"

/**
 * 解析结果。
 * - isMatch        = 通过黑名单 + 命中交易动词 + 解析出金额
 * - amountFen      = 「分」的 Long，避免浮点误差
 * - matchedKeyword = 命中的「交易动词」，仅用于日志排查
 * - direction      = 收入 / 支出，由整段文本语义判定（不再只看关键词）
 */
data class ParseResult(
  val isMatch: Boolean,
  val amountFen: Long?,
  val matchedKeyword: String,
  val rawCombinedText: String,
  val direction: String = DIRECTION_EXPENSE
)

internal object AmountParser {

  /**
   * 广告 / 营销 / 非交易黑名单：命中任意一个直接判未命中。
   *
   * 注意：单字「满」「减」「借」已移除 —— 它们会把「转账给满记甜品」这类正常消费误杀。
   * 「红包」也已移除：收红包是真实收入，广告里的红包靠「必须有交易动词」这一层拦。
   */
  private val BLACKLIST = listOf(
    "优惠券", "券包", "卡包", "抽奖", "失效", "话费", "流量",
    "额度", "还款", "借呗", "借款", "理财", "收益", "免单", "促销", "特价", "闪购"
  )

  /**
   * 交易动词白名单：必须命中其中一个才允许记账。
   * 刻意不含裸「支付」「成功」——否则「微信支付」这种品牌词会让广告蒙混过关。
   */
  private val TRANSACTION_VERBS = listOf(
    "支付成功", "已支付", "付款成功", "收款成功", "转账成功", "交易成功",
    "已收款", "已转账", "已退款", "退款成功", "收到转账",
    "付款", "收款", "转账", "转给", "转出", "转入", "到账", "退款", "退回",
    "消费", "支出", "扣款", "实付", "收入", "红包", "领取"
  )

  /** 收入语义标记（判定顺序在「转账给」之后，避免「转账给张三」被当成收入） */
  private val INCOME_MARKERS = listOf(
    "收款", "收到", "已收", "向你转账", "转入", "到账",
    "退款", "退回", "红包", "领取", "收入", "退你"
  )

  /** 支出语义标记 */
  private val EXPENSE_MARKERS = listOf(
    "转账给", "转给", "转出", "付款", "支付", "消费", "扣款", "实付", "支出", "已转账"
  )

  /** 「向张三转账 / 向张三付款」这种转出句式 */
  private val TRANSFER_OUT_PATTERN = Regex("""向\s*([^\s，,。.:：]{1,20})\s*(转账|付款|支付)""")

  /** 「向你转账 / 转给我」这类转入句式，必须优先于转出判定 */
  private val TRANSFER_IN_MARKERS = listOf("向你转账", "向我转账", "给你转账", "转给你", "转给我")

  private val TRANSFER_IN_PATTERN = Regex("""(?:向|给)\s*(?:你|我|您|咱)\s*(?:转账|付款|转钱)""")

  /**
   * 金额数字片段（捕获组 1）：
   * - 带千分位的 1,000.00
   * - 普通写法 100 / 100.5 / 100,50（欧洲写法）
   * 只用 (?:) 分组，保证 groupValues[1] 永远是完整数字。
   */
  private const val NUMBER =
    """([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{1,2})?|[0-9]+(?:[.,][0-9]{1,2})?)"""

  /**
   * 金额正则，全部要求「金额有明确上下文」：
   *   1) ¥/￥ 前缀
   *   2) N元（「转账给张三 100.00元」「收款 100.00 元」都走这条）
   *   3) 关键词紧邻数字（「转账金额：100」「实付 ¥25」）
   *   4) 带小数点的独立数字（「转账 88.88」）
   */
  private val STRICT_PATTERNS = listOf(
    Regex("""[¥￥]\s*$NUMBER"""),
    Regex("""$NUMBER\s*元"""),
    Regex(
      """(?:金额|实付|支付|付款|收款|消费|支出|到账|交易|转账|扣款|退款|红包)""" +
        """[:：\s]*[¥￥]?\s*$NUMBER"""
    ),
    Regex("""(?<![0-9])([0-9]+\.[0-9]{1,2})(?![0-9])""")
  )

  /** 数字后面跟着量词 → 一定不是金额（「2条」「3个」「5分钟」「2026年」） */
  private val QUANTIFIER_AHEAD = Regex("""^\s*[条个次号天日月年时分秒位张件笔枚期]""")

  /** 整数兜底只在出现 ¥ /「元」时启用 */
  private val CURRENCY_MARKERS = listOf("¥", "元")

  /** 转账类语境下允许「裸整数」金额（「转账 100」这种没带元字的） */
  private val LOOSE_INTEGER_CONTEXT = listOf("转账", "收款", "收到", "红包", "退款", "退回", "转入")

  private val LOOSE_INTEGER_PATTERN = Regex("""(?<![0-9])([0-9]{1,6})(?![0-9])""")

  fun parse(combinedText: String?): ParseResult {
    val raw = combinedText ?: ""
    if (raw.isBlank()) {
      return ParseResult(false, null, "", raw)
    }

    // 只对「匹配用」的副本做规范化，rawCombinedText 保留原文给日志
    val normalized = normalize(raw)

    // 1) 广告黑名单，一票否决
    if (BLACKLIST.any { normalized.contains(it) }) {
      return ParseResult(false, null, "", raw)
    }

    // 2) 必须有真实交易动词
    val verb = TRANSACTION_VERBS.firstOrNull { normalized.contains(it) }
      ?: return ParseResult(false, null, "", raw)

    // 3) 金额
    var amountFen = firstStrictAmount(normalized)

    if (amountFen == null) {
      val hasCurrency = CURRENCY_MARKERS.any { normalized.contains(it) }
      val hasTransferContext = LOOSE_INTEGER_CONTEXT.any { normalized.contains(it) }
      if (hasCurrency || hasTransferContext) {
        amountFen = firstLooseInteger(normalized)
      }
    }

    if (amountFen == null) {
      return ParseResult(false, null, verb, raw)
    }

    return ParseResult(true, amountFen, verb, raw, detectDirection(normalized))
  }

  /**
   * 方向判定（顺序很重要）：
   * 1) 「向你转账 / 转给我」→ 收入（必须先于转出句式，否则「向你转账」会被当成转出）
   * 2) 「转账给X」「转给X」「向X转账」→ 支出
   * 3) 出现收款/收到/到账/退款/红包等 → 收入
   * 4) 其余按支出处理
   */
  private fun detectDirection(text: String): String {
    if (
      TRANSFER_IN_MARKERS.any { text.contains(it) } ||
      TRANSFER_IN_PATTERN.containsMatchIn(text)
    ) {
      return DIRECTION_INCOME
    }

    if (
      text.contains("转账给") ||
      text.contains("转给") ||
      TRANSFER_OUT_PATTERN.containsMatchIn(text)
    ) {
      return DIRECTION_EXPENSE
    }

    if (INCOME_MARKERS.any { text.contains(it) }) {
      return DIRECTION_INCOME
    }

    if (EXPENSE_MARKERS.any { text.contains(it) }) {
      return DIRECTION_EXPENSE
    }

    return DIRECTION_EXPENSE
  }

  private fun firstStrictAmount(text: String): Long? {
    for (pattern in STRICT_PATTERNS) {
      for (match in pattern.findAll(text)) {
        val numberText = match.groupValues.getOrNull(1) ?: continue
        if (isFollowedByQuantifier(text, match.range.last + 1)) continue

        val fen = toFen(numberText) ?: continue
        if (fen > 0L) return fen
      }
    }
    return null
  }

  private fun firstLooseInteger(text: String): Long? {
    for (match in LOOSE_INTEGER_PATTERN.findAll(text)) {
      val start = match.range.first
      val end = match.range.last + 1

      if (start > 0 && text[start - 1].isDigit()) continue
      if (end < text.length && text[end].isDigit()) continue
      if (isFollowedByQuantifier(text, end)) continue

      val fen = toFen(match.groupValues[1]) ?: continue
      if (fen > 0L) return fen
    }
    return null
  }

  private fun isFollowedByQuantifier(text: String, tailStart: Int): Boolean {
    if (tailStart < 0 || tailStart >= text.length) return false
    return QUANTIFIER_AHEAD.find(text.substring(tailStart)) != null
  }

  /** 全角数字/符号转半角，折叠多余空白 */
  private fun normalize(text: String): String {
    val sb = StringBuilder(text.length)

    for (ch in text) {
      val mapped = when (ch) {
        in '０'..'９' -> '0' + (ch - '０')
        '．' -> '.'
        '，' -> ','
        '：' -> ':'
        '￥' -> '¥'
        '\u00A0', '\u3000', '\t', '\r', '\n' -> ' '
        else -> ch
      }
      sb.append(mapped)
    }

    return sb.toString().replace(Regex(""" {2,}"""), " ").trim()
  }

  /**
   * 数字串 → 分。
   * 千分位（1,000.00）先去掉逗号，其余逗号按小数点处理（欧洲写法 100,50）。
   */
  private fun toFen(numberText: String): Long? {
    val trimmed = numberText.trim()
    val thousandSeparated = Regex("""^\d{1,3}(,\d{3})+(\.\d{1,2})?$""").matches(trimmed)

    val plain = if (thousandSeparated) trimmed.replace(",", "") else trimmed.replace(',', '.')
    val value = plain.toBigDecimalOrNull() ?: return null

    return value.movePointRight(2).setScale(0, RoundingMode.HALF_UP).toLong()
  }
}
