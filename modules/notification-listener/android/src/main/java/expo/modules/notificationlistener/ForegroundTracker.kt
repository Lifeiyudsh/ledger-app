package expo.modules.notificationlistener

import android.app.ActivityManager
import android.content.Context
import android.os.Process
import android.util.Log

/**
 * App 前后台判定。
 *
 * 教训：只靠一个信号一定会在某些机型/时序上翻车（实测出现过「在后台付款，但标志位仍是前台」，
 * 导致悬浮窗分支从未执行）。所以这里用两路独立信号交叉验证：
 *
 *  1) Activity 生命周期标志位（expo 的 OnActivityEntersForeground/Background + ActivityLifecycleCallbacks）
 *  2) 进程 importance（IMPORTANCE_FOREGROUND = 100 才算真的在前台）
 *
 * 判定原则：**两路都说前台才算前台**。任何一路说后台就按后台处理。
 * 代价最多是「App 明明在前台还弹了个气泡」，但绝不会漏记账单——这个取舍是刻意的。
 *
 * importance 的读取顺序（服务没有配 android:process，与 App 同在主进程，所以读到的就是 App 进程）：
 *   ① ActivityManager.getMyMemoryState()：官方 API，直接填当前进程状态，最准
 *   ② runningAppProcesses 按 pid 匹配
 *   ③ runningAppProcesses 按进程名匹配
 * 三条都拿不到就返回 -1，此时**回退到标志位**，既不硬判前台也不硬判后台。
 */
internal object ForegroundTracker {

  private const val TAG = "NotifyForeground"

  /** importance 读数 + 来源，来源要进诊断，否则没法判断准不准 */
  data class ImportanceReading(val value: Int, val source: String)

  data class Check(
    /** 最终结论 */
    val foreground: Boolean,
    /** 标志位原始值 */
    val flag: Boolean,
    /** 进程 importance，-1 表示取不到 */
    val importance: Int,
    /** importance 是从哪个 API 拿的 */
    val importanceSource: String,
    /** 进程名（服务在主进程，所以等于包名） */
    val processName: String,
    /** 结论由谁决定 */
    val source: String
  )

  /** 最近一次写入标志位的调用来源，排查用 */
  @Volatile
  var lastEventSource: String = "未收到任何生命周期回调"
    private set

  private fun setFlag(value: Boolean, source: String) {
    lastEventSource = source
    if (NotificationBridge.isAppInForeground != value) {
      Log.d(TAG, "flag=$value（来源：$source）")
    }
    NotificationBridge.isAppInForeground = value
  }

  fun onResume(source: String) = setFlag(true, source)

  fun onPause(source: String) = setFlag(false, source)

  /** JS 的 AppState 同步（第三路兜底） */
  fun setFromJs(foreground: Boolean) = setFlag(foreground, "js:AppState")

  /** 交叉验证后的结论 */
  fun check(context: Context): Check {
    val flag = NotificationBridge.isAppInForeground
    val reading = readImportance(context)
    val importance = reading.value

    val byImportance: Boolean? = when {
      importance <= 0 -> null
      importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND -> true
      importance >= ActivityManager.RunningAppProcessInfo.IMPORTANCE_SERVICE -> false
      // IMPORTANCE_VISIBLE / PERCEPTIBLE（分屏、下拉通知栏）不算前台
      else -> false
    }

    val foreground = if (byImportance == null) flag else (flag && byImportance)
    val source = when {
      byImportance == null -> "flag（importance 不可用，回退标志位）"
      foreground && flag -> "flag + importance 一致"
      !flag && byImportance -> "flag 说后台 → 按后台处理"
      else -> "importance 说后台 → 按后台处理"
    }

    return Check(
      foreground = foreground,
      flag = flag,
      importance = importance,
      importanceSource = reading.source,
      processName = context.packageName,
      source = source
    )
  }

  private fun readImportance(context: Context): ImportanceReading {
    // ① 官方 API：直接读当前进程（服务与 App 同进程）
    try {
      val info = ActivityManager.RunningAppProcessInfo()
      ActivityManager.getMyMemoryState(info)
      if (info.importance != 0) {
        return ImportanceReading(info.importance, "myMemoryState")
      }
    } catch (t: Throwable) {
      Log.w(TAG, "getMyMemoryState 失败", t)
    }

    // ② / ③ 退回进程列表
    try {
      val activityManager =
        context.applicationContext.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager

      val processes = activityManager?.runningAppProcesses
      if (processes != null) {
        val pid = Process.myPid()
        processes.firstOrNull { it.pid == pid }?.let {
          return ImportanceReading(it.importance, "runningAppProcesses(pid)")
        }
        processes.firstOrNull { it.processName == context.packageName }?.let {
          return ImportanceReading(it.importance, "runningAppProcesses(name)")
        }
      }
    } catch (t: Throwable) {
      Log.w(TAG, "读取 runningAppProcesses 失败", t)
    }

    return ImportanceReading(-1, "unavailable")
  }
}
