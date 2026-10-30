package expo.modules.notificationlistener

import android.os.Handler
import android.os.Looper
import java.lang.ref.WeakReference

/**
 * Service 与 Expo Module 之间的单向通道。
 *
 * Service 在系统绑定后独立于 JS 运行，可能比 JS runtime 活得久；
 * 因此这里只持有 Module 的弱引用，事件统一 post 到主线程再发出，
 * 避免 runtime 已销毁时抛异常。
 */
internal object NotificationBridge {

  /** 解析出金额后的事件 */
  const val EVENT_TRANSACTION = "onTransactionDetected"

  /** 命中目标应用就发，不管金额有没有解析出来，用于排查真实通知文本 */
  const val EVENT_RAW = "onRawNotification"

  /** 悬浮气泡被点击（已确认，数据同时写进了 PendingQueueStore） */
  const val EVENT_OVERLAY_CONFIRMED = "onOverlayConfirmed"

  /**
   * App 是否在前台。
   * 由 NotificationListenerModule 的 OnActivityEntersForeground / Background 维护，
   * Service 在另一条调用链上读取，用来决定「弹悬浮窗」还是「发应用内事件」。
   */
  @Volatile
  var isAppInForeground: Boolean = false

  private val mainHandler = Handler(Looper.getMainLooper())
  private var moduleRef: WeakReference<NotificationListenerModule>? = null

  fun attach(module: NotificationListenerModule) {
    moduleRef = WeakReference(module)
  }

  fun detach() {
    moduleRef = null
  }

  fun emit(payload: Map<String, Any?>) = dispatch(EVENT_TRANSACTION, payload)

  fun emitRaw(payload: Map<String, Any?>) = dispatch(EVENT_RAW, payload)

  /** 气泡确认。JS 可能已被系统回收，收不到也不影响数据（已经在队列里） */
  fun emitOverlayConfirmed(payload: Map<String, Any?>) = dispatch(EVENT_OVERLAY_CONFIRMED, payload)

  private fun dispatch(eventName: String, payload: Map<String, Any?>) {
    val module = moduleRef?.get() ?: return

    mainHandler.post {
      try {
        module.sendEvent(eventName, payload)
      } catch (e: Throwable) {
        // JS runtime 已经被回收（App 被杀），POC 阶段直接把事件丢掉，不做落库
      }
    }
  }
}
