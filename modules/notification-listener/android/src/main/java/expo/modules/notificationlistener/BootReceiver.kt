package expo.modules.notificationlistener

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * 开机 / 应用被更新后自动拉起常驻服务。
 *
 * 没有它的话，用户重启手机后必须手动打开一次 App，悬浮提示条才会恢复正常。
 */
class BootReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context?, intent: Intent?) {
    if (context == null || intent == null) return

    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_LOCKED_BOOT_COMPLETED,
      "android.intent.action.QUICKBOOT_POWERON",
      "com.htc.intent.action.QUICKBOOT_POWERON",
      Intent.ACTION_MY_PACKAGE_REPLACED -> {
        // 只有用户开过「通知使用权」才需要保持常驻，否则起了也没意义
        if (!ListenerPermission.isGranted(context)) {
          Log.d("BootReceiver", "未授予通知使用权，跳过启动")
          return
        }
        CaptureForegroundService.start(context)
      }
    }
  }
}
