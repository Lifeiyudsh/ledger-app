package expo.modules.notificationlistener

import android.content.Context
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.InputType
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView

/**
 * 捕获到消费后，在屏幕顶部盖一条提示（悬浮窗）。
 *
 * 为什么要有它：Android 的「悬浮通知」由系统决定是否弹出（荣耀/华为常把第三方通知
 * 归为不重要，即使渠道是 HIGH 也不弹），唯一能百分百保证「当前页面可见」的就是悬浮窗。
 *
 * 形态：金额 + 备注 + 三个分类 + 关闭；点「备注」原地变成输入框，不进 App 就能写备注。
 *
 * 前置条件（必须提醒用户）：荣耀/华为需要「显示在其他应用上层」+「应用启动管理 → 手动管理 →
 * 允许后台活动」，否则窗口加上了也不会显示在其他应用之上。
 */
internal object QuickBarOverlay {

  private const val TAG = "QuickBar"

  private val handler = Handler(Looper.getMainLooper())

  /** 已在主线程就直接跑，避免「post 后又 post」导致移除排队、条子一闪而过 */
  private fun onMain(block: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) block() else handler.post(block)
  }

  private var currentView: View? = null
  private var currentParams: WindowManager.LayoutParams? = null
  private var currentWindowManager: WindowManager? = null
  private var hideTask: Runnable? = null

  fun isPermissionGranted(context: Context): Boolean = try {
    Settings.canDrawOverlays(context)
  } catch (t: Throwable) {
    false
  }

  /** 能不能弹：有普通悬浮窗权限，或者有可用的无障碍服务（无障碍层不需要悬浮窗权限） */
  fun canShow(context: Context): Boolean =
    AccessibilityHolder.service != null || isPermissionGranted(context)

  fun show(
    context: Context,
    captureId: String,
    amountFen: Long,
    appName: String
  ) {
    if (!canShow(context)) return

    onMain {
      try {
        removeNow(context)

        // 有读屏服务时优先用无障碍覆盖层：支付保护会拦普通悬浮窗，不拦无障碍层
        val a11yService = AccessibilityHolder.service
        val holderContext = a11yService ?: context

        val windowManager = holderContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val density = context.resources.displayMetrics.density

        fun dp(value: Int): Int = (value * density).toInt()

        val card = LinearLayout(context).apply {
          orientation = LinearLayout.HORIZONTAL
          gravity = Gravity.CENTER_VERTICAL
          setPadding(dp(14), dp(10), dp(8), dp(10))
          background = GradientDrawable().apply {
            cornerRadius = dp(14).toFloat()
            setColor(Color.parseColor("#F2FFFFFF"))
          }
          elevation = dp(8).toFloat()
        }

        buildActions(context, card, windowManager, captureId, amountFen, appName) { value -> dp(value) }

        val windowType = if (a11yService != null) {
          WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY
        } else if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
          WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
          @Suppress("DEPRECATION")
          WindowManager.LayoutParams.TYPE_PHONE
        }

        val params = WindowManager.LayoutParams(
          WindowManager.LayoutParams.WRAP_CONTENT,
          WindowManager.LayoutParams.WRAP_CONTENT,
          windowType,
          WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
          android.graphics.PixelFormat.TRANSLUCENT
        ).apply {
          gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
          y = dp(72)
        }

        card.setOnLongClickListener {
          CategoryFixStore.add(
            context,
            CategoryFixStore.Fix(
              id = captureId,
              amountFen = amountFen,
              action = "delete",
              category = "",
              note = "",
              at = System.currentTimeMillis()
            )
          )
          android.widget.Toast.makeText(context, "已撤销这笔（回到 App 可见）", android.widget.Toast.LENGTH_SHORT).show()
          removeNow(context)
          true
        }

        windowManager.addView(card, params)
        currentView = card
        currentParams = params
        currentWindowManager = windowManager

        logShown(context, amountFen, if (a11yService != null) "无障碍层" else "普通悬浮窗")
      } catch (t: Throwable) {
        Log.w(TAG, "显示提示条失败", t)
        removeNow(context)
        logError(context, amountFen, t)
      }
    }
  }

  // ---------- 视图 ----------

  /** 默认形态：金额 + 备注 + 三个分类 + 关闭 */
  private fun buildActions(
    context: Context,
    card: LinearLayout,
    windowManager: WindowManager,
    captureId: String,
    amountFen: Long,
    appName: String,
    dp: (Int) -> Int
  ) {
    card.removeAllViews()

    val label = TextView(context).apply {
      text = "已记 ¥${String.format("%.2f", amountFen / 100.0)}"
      setTextColor(Color.parseColor("#1A1A1A"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
      setPadding(0, 0, dp(8), 0)
    }
    card.addView(label)

    // 备注入口：点了原地切换成输入框，不跳 App
    val noteBtn = TextView(context).apply {
      text = "备注"
      setTextColor(Color.parseColor("#8A9099"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
      setPadding(dp(6), dp(6), dp(6), dp(6))
      setOnClickListener {
        hideTask?.let { handler.removeCallbacks(it) }
        buildNoteEditor(context, card, windowManager, captureId, amountFen, appName, dp)
      }
    }
    card.addView(noteBtn)

    QuickCategoryStore.read(context).forEach { item ->
      val category = item.key
      val text = item.label
      val button = TextView(context).apply {
        this.text = text
        setTextColor(Color.parseColor("#2E6BE6"))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
        setPadding(dp(9), dp(6), dp(9), dp(6))
        setOnClickListener {
          CategoryFixStore.add(
            context,
            CategoryFixStore.Fix(
              id = captureId,
              amountFen = amountFen,
              action = "category",
              category = category,
              note = "",
              at = System.currentTimeMillis()
            )
          )
          removeNow(context)
        }
      }
      card.addView(button)
    }

    val close = TextView(context).apply {
      text = "✕"
      setTextColor(Color.parseColor("#9AA0A6"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
      setPadding(dp(8), dp(6), dp(6), dp(6))
      setOnClickListener { removeNow(context) }
    }
    card.addView(close)
  }

  /** 备注形态：输入框 + 保存 + 取消（需要窗口可聚焦，否则键盘弹不出来） */
  private fun buildNoteEditor(
    context: Context,
    card: LinearLayout,
    windowManager: WindowManager,
    captureId: String,
    amountFen: Long,
    appName: String,
    dp: (Int) -> Int
  ) {
    card.removeAllViews()

    val input = EditText(context).apply {
      hint = "备注，如：午饭"
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
      setTextColor(Color.parseColor("#1A1A1A"))
      setHintTextColor(Color.parseColor("#9AA0A6"))
      inputType = InputType.TYPE_CLASS_TEXT
      maxLines = 1
      minWidth = dp(160)
      setPadding(dp(6), dp(6), dp(6), dp(6))
      background = null
    }
    card.addView(input)

    val save = TextView(context).apply {
      text = "保存"
      setTextColor(Color.parseColor("#2E6BE6"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
      setPadding(dp(10), dp(6), dp(10), dp(6))
      setOnClickListener {
        val text = input.text?.toString()?.trim().orEmpty()
        if (text.isNotEmpty()) {
          CategoryFixStore.add(
            context,
            CategoryFixStore.Fix(
              id = captureId,
              amountFen = amountFen,
              action = "note",
              category = "",
              note = text.take(100),
              at = System.currentTimeMillis()
            )
          )
        }
        // 写完备注不消失：回到分类按钮，让用户接着选分类
        backToActions(context, card, windowManager, captureId, amountFen, appName, dp)
      }
    }
    card.addView(save)

    val cancel = TextView(context).apply {
      text = "取消"
      setTextColor(Color.parseColor("#9AA0A6"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
      setPadding(dp(6), dp(6), dp(6), dp(6))
      setOnClickListener {
        backToActions(context, card, windowManager, captureId, amountFen, appName, dp)
      }
    }
    card.addView(cancel)

    // 去掉 NOT_FOCUSABLE，窗口才能接收键盘输入
    currentParams?.let { params ->
      params.flags = WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
      params.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE or
        WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE
      try {
        windowManager.updateViewLayout(card, params)
      } catch (t: Throwable) {
        Log.w(TAG, "窗口改为可聚焦失败", t)
      }
    }

    input.requestFocus()
    input.post {
      try {
        val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        imm.showSoftInput(input, InputMethodManager.SHOW_IMPLICIT)
      } catch (t: Throwable) {
        Log.w(TAG, "弹出键盘失败", t)
      }
    }
  }

  /** 从备注编辑态回到分类按钮态，并恢复不可聚焦（不自动消失） */
  private fun backToActions(
    context: Context,
    card: LinearLayout,
    windowManager: WindowManager,
    captureId: String,
    amountFen: Long,
    appName: String,
    dp: (Int) -> Int
  ) {
    buildActions(context, card, windowManager, captureId, amountFen, appName, dp)

    currentParams?.let { params ->
      params.flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
      try {
        windowManager.updateViewLayout(card, params)
      } catch (t: Throwable) {
        Log.w(TAG, "恢复窗口属性失败", t)
      }
    }
  }

  // ---------- 生命周期 ----------

  fun remove(context: Context) {
    onMain { removeNow(context) }
  }

  /** 只能在主线程调用 */
  private fun removeNow(context: Context) {
    try {
      val view = currentView ?: return
      val windowManager = currentWindowManager
        ?: (context.getSystemService(Context.WINDOW_SERVICE) as WindowManager)
      windowManager.removeView(view)
    } catch (t: Throwable) {
      Log.w(TAG, "移除提示条失败", t)
    } finally {
      currentView = null
      currentParams = null
      currentWindowManager = null
      hideTask?.let { handler.removeCallbacks(it) }
      hideTask = null
    }
  }

  private fun logShown(context: Context, amountFen: Long, layer: String) {
    DebugLogStore.append(
      context,
      DebugLogStore.Entry(
        timestamp = System.currentTimeMillis(),
        packageName = "self",
        title = "悬浮提示条已显示（$layer）",
        text = "¥${String.format("%.2f", amountFen / 100.0)}",
        bigText = "",
        subText = "",
        tickerText = "",
        extrasDump = "",
        isMatch = true,
        amountFen = amountFen,
        matchedKeyword = "overlay"
      )
    )
  }

  private fun logError(context: Context, amountFen: Long, error: Throwable) {
    DebugLogStore.append(
      context,
      DebugLogStore.Entry(
        timestamp = System.currentTimeMillis(),
        packageName = "self",
        title = "悬浮提示条显示失败",
        text = (error.message ?: error.javaClass.simpleName).take(200),
        bigText = "",
        subText = "",
        tickerText = "",
        extrasDump = "",
        isMatch = false,
        amountFen = amountFen,
        matchedKeyword = "overlay-error"
      )
    )
  }
}
