package expo.modules.notificationlistener

import android.accessibilityservice.AccessibilityService

/**
 * 持有当前运行中的无障碍服务实例。
 *
 * 用途：用 `TYPE_ACCESSIBILITY_OVERLAY` 类型添加悬浮窗。
 * 这个类型只能由无障碍服务创建，且在部分 ROM 上不受「支付保护」对普通悬浮窗的拦截
 * （系统把它当作辅助功能的一部分），是支付界面里唯一可能显示出来的窗口类型。
 */
internal object AccessibilityHolder {

  @Volatile
  var service: AccessibilityService? = null
}
