package expo.modules.notificationlistener

import android.content.Context
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView

/**
 * 捕获到消费后，在屏幕顶部盖一条提示（悬浮窗）。
 *
 * 为什么要有它：Android 的「悬浮通知」由系统决定是否弹出（荣耀/华为常把第三方通知
 * 归为不重要，即使渠道是 HIGH 也不弹），唯一能百分百保证「当前页面可见」的就是悬浮窗。
 *
 * 形态：一条横向卡片 —— 金额 + 三个分类按钮 + 关闭，5 秒自动消失，不挡操作。
 */
internal object QuickBarOverlay {

  private const val TAG = "QuickBar"
  private const val AUTO_DISMISS_MS = 6000L

  private val handler = Handler(Looper.getMainLooper())

  /** 已在主线程就直接跑，避免「post 后又 post」导致移除排队、条子一闪而过 */
  private fun onMain(block: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) block() else handler.post(block)
  }

  private var currentView: View? = null
  private var currentParams: WindowManager.LayoutParams? = null
  private var hideTask: Runnable? = null

  private val QUICK_CATEGORIES = listOf(
    Triple("food", "餐饮", 1),
    Triple("transport", "交通", 2),
    Triple("shopping", "购物", 3)
  )

  fun isPermissionGranted(context: Context): Boolean = try {
    Settings.canDrawOverlays(context)
  } catch (t: Throwable) {
    false
  }

  fun show(
    context: Context,
    captureId: String,
    amountFen: Long,
    appName: String
  ) {
    if (!isPermissionGranted(context)) return

    onMain {
      try {
        removeNow(context)

        val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val density = context.resources.displayMetrics.density

        fun dp(value: Int): Int = (value * density).toInt()

        val card = LinearLayout(context).apply {
          orientation = LinearLayout.HORIZONTAL
          gravity = Gravity.CENTER_VERTICAL
          setPadding(dp(14), dp(10), dp(10), dp(10))
          background = GradientDrawable().apply {
            cornerRadius = dp(14).toFloat()
            setColor(Color.parseColor("#F2FFFFFF"))
          }
          elevation = dp(8).toFloat()
        }

        val label = TextView(context).apply {
          text = "已记 ¥${String.format("%.2f", amountFen / 100.0)}"
          setTextColor(Color.parseColor("#1A1A1A"))
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
          setPadding(0, 0, dp(10), 0)
        }
        card.addView(label)

        QUICK_CATEGORIES.forEach { (category, text, _) ->
          val button = TextView(context).apply {
            this.text = text
            setTextColor(Color.parseColor("#2E6BE6"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            setPadding(dp(10), dp(6), dp(10), dp(6))
            setOnClickListener {
              CategoryFixStore.add(
                context,
                CategoryFixStore.Fix(
                  id = captureId,
                  amountFen = amountFen,
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
          setPadding(dp(10), dp(6), dp(6), dp(6))
          setOnClickListener { removeNow(context) }
        }
        card.addView(close)

        val windowType = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
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

        windowManager.addView(card, params)
        currentView = card
        currentParams = params

        DebugLogStore.append(
          context,
          DebugLogStore.Entry(
            timestamp = System.currentTimeMillis(),
            packageName = "self",
            title = "悬浮提示条已显示",
            text = "¥${String.format("%.2f", amountFen / 100.0)} · $appName",
            bigText = "",
            subText = "",
            tickerText = "",
            extrasDump = "",
            isMatch = true,
            amountFen = amountFen,
            matchedKeyword = "overlay"
          )
        )

        hideTask?.let { handler.removeCallbacks(it) }
        val task = Runnable { removeNow(context) }
        hideTask = task
        handler.postDelayed(task, AUTO_DISMISS_MS)
      } catch (t: Throwable) {
        Log.w(TAG, "显示提示条失败", t)
        removeNow(context)

        DebugLogStore.append(
          context,
          DebugLogStore.Entry(
            timestamp = System.currentTimeMillis(),
            packageName = "self",
            title = "悬浮提示条显示失败",
            text = (t.message ?: t.javaClass.simpleName).take(200),
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
  }

  fun remove(context: Context) {
    onMain { removeNow(context) }
  }

  /** 只能在主线程调用 */
  private fun removeNow(context: Context) {
    try {
      val view = currentView ?: return
      val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
      windowManager.removeView(view)
    } catch (t: Throwable) {
      Log.w(TAG, "移除提示条失败", t)
    } finally {
      currentView = null
      currentParams = null
    }
  }
}
