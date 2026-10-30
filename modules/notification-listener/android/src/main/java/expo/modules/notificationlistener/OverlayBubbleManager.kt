package expo.modules.notificationlistener

import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.TextUtils
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * 系统级悬浮气泡。
 *
 * 设计原则：**宁可不显示，也绝不崩溃**。
 * 整个流程每一步都包了 try/catch，任何异常都只会降级成应用内横幅（onFallback），
 * 不会把异常抛回 NotificationListenerService（那会导致系统不断重启服务）。
 */
internal object OverlayBubbleManager {

  private const val TAG = "NotifyOverlay"
  private const val AUTO_DISMISS_MS = 60_000L

  data class OverlayItem(
    val id: String,
    val amountFen: Long,
    val direction: String,
    val note: String,
    val rawText: String,
    val appName: String,
    val packageName: String,
    val postedAt: Long
  )

  private val mainHandler = Handler(Looper.getMainLooper())

  private var bubbleView: View? = null
  private var hostContext: Context? = null
  private var currentItem: OverlayItem? = null

  /** 自增令牌，防止「上一条的 60 秒定时器」误删「后弹出的气泡」 */
  private var token: Int = 0

  fun isPermissionGranted(context: Context): Boolean {
    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        Settings.canDrawOverlays(context)
      } else {
        false
      }
    } catch (t: Throwable) {
      Log.w(TAG, "读取悬浮窗权限失败", t)
      false
    }
  }

  /**
   * 弹出气泡。拿不到权限 / 创建失败都会调用 onFallback（由调用方降级成应用内横幅）。
   * 本方法不会抛异常。
   */
  fun show(context: Context, item: OverlayItem, onFallback: () -> Unit) {
    Log.d(
      TAG,
      "show() 请求 note=${item.note} amount=${item.amountFen}fen " +
        "fg=${NotificationBridge.isAppInForeground} canDraw=${isPermissionGranted(context)}"
    )

    if (!isPermissionGranted(context)) {
      Log.d(TAG, "无悬浮窗权限，直接降级为应用内横幅")
      onFallback()
      return
    }

    try {
      mainHandler.post {
        val shown = tryShow(context.applicationContext, item)
        if (!shown) {
          Log.d(TAG, "气泡未显示成功，降级为应用内横幅")
          try {
            onFallback()
          } catch (t: Throwable) {
            Log.w(TAG, "降级回调执行失败", t)
          }
        }
      }
    } catch (t: Throwable) {
      Log.w(TAG, "悬浮窗调度失败", t)
      onFallback()
    }
  }

  /** 移除当前气泡（幂等） */
  fun dismiss() {
    try {
      mainHandler.post { removeBubble() }
    } catch (t: Throwable) {
      Log.w(TAG, "移除悬浮窗调度失败", t)
    }
  }

  // ---------------- 内部实现 ----------------

  private fun tryShow(context: Context, item: OverlayItem): Boolean {
    removeBubble()

    val windowManager = try {
      context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager
    } catch (t: Throwable) {
      Log.w(TAG, "取 WindowManager 失败", t)
      null
    }

    if (windowManager == null) {
      OverlayDebugState.lastAddViewOk = false
      OverlayDebugState.lastError = "WindowManager 不可用"
      return false
    }

    // 先用规范类型；部分 ROM 对 2038 的 AppOps 判定异常，失败后换 2002 再试一次
    if (addWindow(context, windowManager, item, useOverlayType = true)) return true
    if (addWindow(context, windowManager, item, useOverlayType = false)) return true

    return false
  }

  private fun addWindow(
    context: Context,
    windowManager: WindowManager,
    item: OverlayItem,
    useOverlayType: Boolean
  ): Boolean {
    OverlayDebugState.showAttempts += 1
    OverlayDebugState.lastWindowType = describeType(useOverlayType)

    val view = try {
      buildBubbleView(context, item)
    } catch (t: Throwable) {
      Log.e(TAG, "构建气泡 UI 失败", t)
      OverlayDebugState.lastAddViewOk = false
      OverlayDebugState.lastError = "buildView ${t.javaClass.simpleName}: ${t.message}"
      return false
    }

    return try {
      windowManager.addView(view, buildLayoutParams(context, useOverlayType))

      bubbleView = view
      hostContext = context
      currentItem = item
      token += 1
      scheduleAutoDismiss(token)

      OverlayDebugState.lastAddViewOk = true
      OverlayDebugState.lastError = null
      OverlayDebugState.showSuccesses += 1
      Log.d(TAG, "气泡已显示 type=${OverlayDebugState.lastWindowType}")

      true
    } catch (t: Throwable) {
      val detail = "${t.javaClass.simpleName}: ${t.message}"
      OverlayDebugState.lastAddViewOk = false
      OverlayDebugState.lastError = detail
      Log.e(TAG, "addView 失败 type=${OverlayDebugState.lastWindowType} -> $detail", t)

      try {
        windowManager.removeView(view)
      } catch (ignored: Throwable) {
        // 没加进去就移除会抛异常，忽略
      }
      false
    }
  }

  private fun describeType(useOverlayType: Boolean): String {
    val supportsOverlay = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
    return when {
      useOverlayType && supportsOverlay -> "TYPE_APPLICATION_OVERLAY(2038)"
      useOverlayType -> "TYPE_PHONE(2002, API<26)"
      else -> "TYPE_PHONE(2002, fallback)"
    }
  }

  private fun removeBubble() {
    val view = bubbleView ?: return
    // 先置空再移除，避免 removeView 触发的重入
    bubbleView = null
    currentItem = null

    try {
      val windowManager = hostContext?.getSystemService(Context.WINDOW_SERVICE) as? WindowManager
      windowManager?.removeView(view)
    } catch (t: Throwable) {
      // 系统已经回收过这个 View，忽略即可
      Log.w(TAG, "移除悬浮窗失败", t)
    }
  }

  private fun scheduleAutoDismiss(scheduledToken: Int) {
    try {
      mainHandler.postDelayed({
        if (scheduledToken == token) {
          removeBubble()
        }
      }, AUTO_DISMISS_MS)
    } catch (t: Throwable) {
      Log.w(TAG, "定时销毁调度失败", t)
    }
  }

  private fun buildLayoutParams(context: Context, useOverlayType: Boolean): WindowManager.LayoutParams {
    val type = if (useOverlayType && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }

    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      type,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
      PixelFormat.TRANSLUCENT
    )

    params.gravity = Gravity.TOP or Gravity.END
    params.x = 0
    params.y = (140 * context.resources.displayMetrics.density).roundToInt()
    return params
  }

  private fun buildBubbleView(context: Context, item: OverlayItem): View {
    val density = context.resources.displayMetrics.density
    fun dp(value: Int): Int = (value * density).roundToInt()

    val container = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(14), dp(9), dp(6), dp(9))
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(22).toFloat()
        setColor(Color.parseColor("#E61A1E24"))
        setStroke(dp(1), Color.parseColor("#33FFFFFF"))
      }
      elevation = dp(8).toFloat()
      isClickable = true
    }

    val label = TextView(context).apply {
      text = buildLabel(item)
      setTextColor(Color.WHITE)
      textSize = 14f
      typeface = Typeface.DEFAULT_BOLD
      maxLines = 1
      ellipsize = TextUtils.TruncateAt.END
      maxWidth = dp(190)
    }

    val close = TextView(context).apply {
      text = "✕"
      setTextColor(Color.parseColor("#B0B6BF"))
      textSize = 14f
      setPadding(dp(10), dp(4), dp(10), dp(4))
      isClickable = true
    }

    container.addView(label)
    container.addView(close)

    container.setOnClickListener {
      try {
        handleConfirm(context)
      } catch (t: Throwable) {
        Log.w(TAG, "确认回调失败", t)
        removeBubble()
      }
    }

    close.setOnClickListener {
      try {
        removeBubble()
      } catch (t: Throwable) {
        Log.w(TAG, "忽略回调失败", t)
      }
    }

    return container
  }

  private fun buildLabel(item: OverlayItem): String {
    val name = if (item.note.isBlank()) item.appName else item.note
    val sign = if (item.direction == DIRECTION_INCOME) "+" else ""
    return "$name $sign${yuanText(item.amountFen)}"
  }

  /** 整数「分」→ ¥12.34，不经过浮点 */
  private fun yuanText(fen: Long): String {
    val sign = if (fen < 0) "-" else ""
    val absValue = abs(fen)
    val yuan = absValue / 100
    val cents = absValue % 100
    val centsText = if (cents < 10) "0$cents" else "$cents"
    return "¥$sign$yuan.$centsText"
  }

  /**
   * 点击气泡 = 确认记账。
   * 先把记录写进 SharedPreferences 队列（保证不丢），再通知 JS；
   * 队列写失败时把整条数据塞进事件，让 JS 直接入库。
   */
  private fun handleConfirm(context: Context) {
    val item = currentItem
    removeBubble()
    if (item == null) return

    val entry = PendingQueueStore.Entry(
      id = item.id,
      amountFen = item.amountFen,
      direction = item.direction,
      note = item.note,
      rawText = item.rawText,
      appName = item.appName,
      packageName = item.packageName,
      postedAt = item.postedAt,
      confirmedAt = System.currentTimeMillis()
    )

    val queued = PendingQueueStore.append(context, entry)

    val payload = PendingQueueStore.toJsMap(entry).toMutableMap()
    payload["fallback"] = !queued

    NotificationBridge.emitOverlayConfirmed(payload)
  }
}
