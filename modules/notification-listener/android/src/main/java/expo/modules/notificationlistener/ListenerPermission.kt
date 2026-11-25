package expo.modules.notificationlistener

import android.content.ComponentName
import android.content.Context
import android.provider.Settings

/** 是否已授予「通知使用权」（各个入口共用一份判断） */
internal object ListenerPermission {

  fun isGranted(context: Context): Boolean {
    return try {
      val enabled = Settings.Secure.getString(
        context.contentResolver,
        "enabled_notification_listeners"
      ).orEmpty()

      val component = ComponentName(context, TransactionNotificationService::class.java)
      enabled.split(":").any { ComponentName.unflattenFromString(it) == component }
    } catch (t: Throwable) {
      false
    }
  }
}
