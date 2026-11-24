package expo.modules.notificationlistener

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log

/**
 * 银行动账短信入口。
 *
 * 为什么用广播而不是读短信数据库：`SMS_RECEIVED` 是系统在短信入库时实时发出的一次性事件，
 * 比轮询 ContentProvider 省电得多，也不会重复处理历史短信。
 *
 * 只有在用户授予 RECEIVE_SMS 之后系统才会把广播发过来；没授权时这个类不会被调用。
 */
class BankSmsReceiver : BroadcastReceiver() {

  companion object {
    private const val TAG = "BankSms"
    private const val SOURCE_PACKAGE = "sms"
  }

  override fun onReceive(context: Context?, intent: Intent?) {
    try {
      if (context == null || intent == null) return
      if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

      val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
      if (messages.isEmpty()) return

      // 长短信会被拆成多段，拼起来再解析
      val body = messages.joinToString(separator = "") { it.messageBody ?: "" }
      if (body.isBlank()) return

      val parsed = SmsParser.parse(body)

      if (parsed == null) {
        // 只把「看起来像银行短信」的未命中记录下来，避免把验证码之类塞进日志
        if (body.contains("银行") || body.contains("信用卡") || body.contains("储蓄卡")) {
          DebugLogStore.append(
            context,
            DebugLogStore.Entry(
              timestamp = System.currentTimeMillis(),
              packageName = SOURCE_PACKAGE,
              title = "短信（未识别）",
              text = body.take(300),
              bigText = "",
              subText = "",
              tickerText = "",
              extrasDump = "",
              isMatch = false,
              amountFen = null,
              matchedKeyword = ""
            )
          )
        }
        return
      }

      DebugLogStore.append(
        context,
        DebugLogStore.Entry(
          timestamp = System.currentTimeMillis(),
          packageName = SOURCE_PACKAGE,
          title = "短信命中",
          text = body.take(300),
          bigText = "",
          subText = "",
          tickerText = "",
          extrasDump = "",
          isMatch = true,
          amountFen = parsed.amountFen,
          matchedKeyword = parsed.keyword
        )
      )

      Log.i(TAG, "短信命中：${parsed.keyword} ${parsed.amountFen} 分 / ${parsed.note}")

      CaptureDispatcher.dispatch(
        context = context,
        amountFen = parsed.amountFen,
        direction = parsed.direction,
        keyword = parsed.keyword,
        combined = body,
        title = parsed.note,
        packageName = SOURCE_PACKAGE,
        appName = parsed.bank.ifBlank { "银行短信" },
        postedAt = System.currentTimeMillis(),
        source = "sms"
      )
    } catch (t: Throwable) {
      Log.w(TAG, "处理短信失败", t)
    }
  }
}
