package expo.modules.notificationlistener

import android.app.Activity
import android.app.Application
import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NotificationListenerModule : Module() {

  private var lifecycleCallbacks: Application.ActivityLifecycleCallbacks? = null

  override fun definition() = ModuleDefinition {
    Name("NotificationListener")

    // 向 JS 暴露的事件名，必须和 JS 端 useEventListener 的字符串一致
    Events(
      NotificationBridge.EVENT_TRANSACTION,
      NotificationBridge.EVENT_RAW,
      NotificationBridge.EVENT_OVERLAY_CONFIRMED
    )

    OnCreate {
      NotificationBridge.attach(this@NotificationListenerModule)
      registerAppLifecycle()
    }

    OnDestroy {
      unregisterAppLifecycle()
      NotificationBridge.detach()
    }

    // 用户从系统设置页返回 App 时自动重新检查权限，避免需要手动重启 App
    OnActivityEntersForeground {
      ForegroundTracker.onResume("expo:OnActivityEntersForeground")
      registerAppLifecycle()

      if (isListenerEnabled()) {
        rebindListener()
      }
    }

    // expo 自己的回调，Activity onPause 后触发，是最可靠的一路
    OnActivityEntersBackground {
      ForegroundTracker.onPause("expo:OnActivityEntersBackground")
    }

    Function("isPermissionGranted") {
      isListenerEnabled()
    }

    Function("openNotificationSettings") {
      openNotificationSettings()
    }

    Function("refreshBinding") {
      rebindListener()
    }

    // ---------- 悬浮窗 ----------

    /** 是否已授予「显示在其他应用上层」 */
    Function("canDrawOverlays") {
      val context = appContext.reactContext
      if (context == null) false else OverlayBubbleManager.isPermissionGranted(context)
    }

    /** 跳转系统的「显示在其他应用上层」授权页 */
    Function("requestOverlayPermission") {
      requestOverlayPermission()
    }

    /** 诊断快照（JSON 字符串）：气泡没弹出来时，JS 直接展示/复制 */
    Function("getDebugState") {
      OverlayDebugState.snapshotJson(appContext.reactContext)
    }

    /** JS 侧 AppState 同步，和原生 ActivityLifecycleCallbacks 互为兜底 */
    Function("setAppInForeground") { foreground: Boolean ->
      ForegroundTracker.setFromJs(foreground)
      true
    }

    // ---------- 自动记账队列（补录用） ----------

    /** 读取气泡确认后待入库的记录 */
    AsyncFunction("getPendingAutoRecords") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.resolve(emptyList<Map<String, Any?>>())
      } else {
        val records = PendingQueueStore.readAll(context).map { PendingQueueStore.toJsMap(it) }
        promise.resolve(records)
      }
    }

    /** 入库成功后清空队列 */
    AsyncFunction("clearPendingAutoRecords") { promise: Promise ->
      appContext.reactContext?.let { PendingQueueStore.clear(it) }
      promise.resolve()
    }

    /** 读取最近 50 条通知原文（含未命中），App 切回前台时以此为准 */
    AsyncFunction("getLogs") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.resolve(emptyList<Map<String, Any?>>())
      } else {
        val logs = DebugLogStore.readAll(context).map { DebugLogStore.toJsMap(it) }
        promise.resolve(logs)
      }
    }

    AsyncFunction("clearLogs") { promise: Promise ->
      appContext.reactContext?.let { DebugLogStore.clear(it) }
      promise.resolve()
    }

    AsyncFunction("getServiceStatus") { promise: Promise ->
      promise.resolve(mapOf("isConnected" to TransactionNotificationService.isConnected()))
    }

    /** 仅用于联调：把一段伪造的通知文本走完整的解析 + 落盘 + 事件链路 */
    Function("simulate") { text: String ->
      emitSimulated(text)
    }
  }

  /**
   * 用 ActivityLifecycleCallbacks 维护「App 是否在前台」。
   * 通知服务是独立调用链，拿不到 Activity，只能靠这个全局标记判断该弹气泡还是发事件。
   */
  private fun registerAppLifecycle() {
    if (lifecycleCallbacks != null) return

    try {
      val application = appContext.reactContext?.applicationContext as? Application ?: return

      val callbacks = object : Application.ActivityLifecycleCallbacks {
        // onResume / onPause 是 Android 官方推荐的前后台判定点：Activity 被盖住或切走系统必调 onPause
        override fun onActivityResumed(activity: Activity) {
          ForegroundTracker.onResume("lifecycle:onResume")
        }

        override fun onActivityPaused(activity: Activity) {
          ForegroundTracker.onPause("lifecycle:onPause")
        }

        override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}
        override fun onActivityStarted(activity: Activity) {}
        override fun onActivityStopped(activity: Activity) {}
        override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
        override fun onActivityDestroyed(activity: Activity) {}
      }

      application.registerActivityLifecycleCallbacks(callbacks)
      lifecycleCallbacks = callbacks
    } catch (t: Throwable) {
      Log.w(TAG, "注册前台状态监听失败", t)
    }
  }

  private fun unregisterAppLifecycle() {
    val callbacks = lifecycleCallbacks ?: return
    lifecycleCallbacks = null

    try {
      val application = appContext.reactContext?.applicationContext as? Application
      application?.unregisterActivityLifecycleCallbacks(callbacks)
    } catch (t: Throwable) {
      Log.w(TAG, "注销前台状态监听失败", t)
    }
  }

  /** 打开「显示在其他应用上层」授权页 */
  private fun requestOverlayPermission(): Boolean {
    val context = appContext.reactContext ?: return false

    return try {
      val intent = Intent(
        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        Uri.parse("package:${context.packageName}")
      ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }

      context.startActivity(intent)
      true
    } catch (t: Throwable) {
      Log.w(TAG, "打开悬浮窗授权页失败", t)
      false
    }
  }

  private fun isListenerEnabled(): Boolean {
    val context = appContext.reactContext ?: return false

    val enabled = Settings.Secure.getString(
      context.contentResolver,
      "enabled_notification_listeners"
    ) ?: return false

    val component = ComponentName(context, TransactionNotificationService::class.java)
    val full = component.flattenToString()          // com.xxx/com.xxx.Service
    val short = component.flattenToShortString()    // com.xxx/.Service

    return enabled.split(':').any { it.equals(full, true) || it.equals(short, true) }
  }

  private fun openNotificationSettings(): Boolean {
    val context = appContext.reactContext ?: return false

    val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    return try {
      context.startActivity(intent)
      true
    } catch (e: Exception) {
      // 少数 ROM 没有这个 Action，退回应用详情页
      Log.w(TAG, "打开通知使用权设置页失败，尝试回退", e)
      try {
        val fallback = Intent(
          Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
          Uri.fromParts("package", context.packageName, null)
        ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
        context.startActivity(fallback)
        true
      } catch (e2: Exception) {
        Log.w(TAG, "回退到应用详情页也失败", e2)
        false
      }
    }
  }

  private fun rebindListener(): Boolean {
    val context = appContext.reactContext ?: return false

    return try {
      NotificationListenerService.requestRebind(
        ComponentName(context, TransactionNotificationService::class.java)
      )
      true
    } catch (e: Exception) {
      Log.w(TAG, "requestRebind 失败", e)
      false
    }
  }

  private fun emitSimulated(text: String): Boolean {
    val result = AmountParser.parse(text)
    val now = System.currentTimeMillis()

    appContext.reactContext?.let { context ->
      DebugLogStore.append(
        context,
        DebugLogStore.Entry(
          timestamp = now,
          packageName = "simulate.self",
          title = "模拟通知",
          text = text,
          bigText = "",
          subText = "",
          tickerText = "",
          extrasDump = "",
          isMatch = result.isMatch,
          amountFen = result.amountFen,
          matchedKeyword = result.matchedKeyword
        )
      )
    }

    NotificationBridge.emitRaw(
      mapOf(
        "packageName" to "simulate.self",
        "appName" to "模拟通知",
        "title" to "模拟通知",
        "text" to text,
        "bigText" to "",
        "subText" to "",
        "rawText" to text,
        "postedAt" to now.toDouble()
      )
    )

    val amountFen = result.amountFen
    if (!result.isMatch || amountFen == null) return false

    NotificationBridge.emit(
      mapOf(
        "amount" to amountFen / 100.0,
        "amountFen" to amountFen,
        "type" to result.direction,
        "keyword" to result.matchedKeyword,
        "rawText" to text,
        "title" to "模拟通知",
        "packageName" to "simulate.self",
        "appName" to "模拟通知",
        "postedAt" to now.toDouble()
      )
    )
    return true
  }

  companion object {
    private const val TAG = "NotifyListener"
  }
}
