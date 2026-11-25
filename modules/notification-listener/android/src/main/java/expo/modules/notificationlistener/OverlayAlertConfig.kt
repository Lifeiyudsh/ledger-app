package expo.modules.notificationlistener

import android.content.Context

/**
 * 「付款时在屏幕顶部弹出提示」的开关。
 *
 * 打开（默认）：启动常驻前台服务 + 悬浮提示条。通知栏会多一行「自动记账运行中」，
 *              这是 Android 对前台服务的强制要求，无法去掉。
 * 关闭：不常驻、不弹条，只发普通通知（下拉通知栏可见）。
 */
internal object OverlayAlertConfig {

  private const val PREFS_NAME = "overlay_alert"
  private const val KEY_ENABLED = "enabled"

  fun isEnabled(context: Context): Boolean = try {
    context.applicationContext
      .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .getBoolean(KEY_ENABLED, true)
  } catch (t: Throwable) {
    true
  }

  fun setEnabled(context: Context, enabled: Boolean) {
    try {
      context.applicationContext
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .putBoolean(KEY_ENABLED, enabled)
        .apply()
    } catch (t: Throwable) {
      // 忽略
    }
  }
}
