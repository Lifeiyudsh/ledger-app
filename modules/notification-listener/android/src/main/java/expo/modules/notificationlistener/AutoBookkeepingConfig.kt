package expo.modules.notificationlistener

import android.content.Context

/**
 * 自动记账开关（免确认）。
 *
 * 关闭时：捕获到消费 → 弹气泡 / 应用内横幅，等用户点一下才入库（默认，安全）。
 * 打开后：捕获到就直接写进补录队列，JS 一有机会就入库，不用任何操作。
 *        分类靠关键词猜，事后可改——对齐荣耀「AI 记账」的体验。
 *
 * 存在 SharedPreferences，保证 JS 没在跑时也能读到。
 */
internal object AutoBookkeepingConfig {

  private const val PREFS_NAME = "auto_bookkeeping"
  private const val KEY_ENABLED = "enabled"

  fun isEnabled(context: Context): Boolean {
    return try {
      context.applicationContext
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .getBoolean(KEY_ENABLED, false)
    } catch (t: Throwable) {
      false
    }
  }

  fun setEnabled(context: Context, enabled: Boolean) {
    try {
      context.applicationContext
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .putBoolean(KEY_ENABLED, enabled)
        .apply()
    } catch (t: Throwable) {
      // 忽略：写失败就保持关闭，至少不会误记
    }
  }
}
