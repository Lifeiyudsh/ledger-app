package expo.modules.notificationlistener

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * 「已确认待入库」队列。
 *
 * 气泡被点击时，JS runtime 很可能已经死了（App 在后台），所以不能只发事件：
 * 必须先把记录落进 SharedPreferences，再由 JS 下次启动时补录（drain）。
 * 只要这里写成功，数据就一定不会丢。
 */
internal object PendingQueueStore {

  private const val PREFS_NAME = "notify_auto_pending_v1"
  private const val KEY_QUEUE = "queue"

  /** 队列上限，避免长期不打开 App 导致无限增长 */
  private const val MAX_SIZE = 200

  data class Entry(
    val id: String,
    val amountFen: Long,
    val direction: String,
    val note: String,
    val rawText: String,
    val appName: String,
    val packageName: String,
    val postedAt: Long,
    val confirmedAt: Long
  )

  private fun prefs(context: Context) =
    context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  /** 追加一条；返回是否写入成功（失败时调用方要降级处理） */
  fun append(context: Context, entry: Entry): Boolean {
    return try {
      val store = prefs(context)
      val array = JSONArray(store.getString(KEY_QUEUE, "[]") ?: "[]")
      array.put(toJson(entry))

      val start = maxOf(0, array.length() - MAX_SIZE)
      val trimmed = JSONArray()
      for (index in start until array.length()) {
        trimmed.put(array.get(index))
      }

      store.edit().putString(KEY_QUEUE, trimmed.toString()).apply()
      true
    } catch (t: Throwable) {
      false
    }
  }

  fun readAll(context: Context): List<Entry> {
    return try {
      val raw = prefs(context).getString(KEY_QUEUE, "[]") ?: "[]"
      val array = JSONArray(raw)
      val result = ArrayList<Entry>(array.length())
      for (index in 0 until array.length()) {
        fromJson(array.optJSONObject(index))?.let { result.add(it) }
      }
      result
    } catch (t: Throwable) {
      emptyList()
    }
  }

  fun clear(context: Context) {
    try {
      prefs(context).edit().remove(KEY_QUEUE).apply()
    } catch (t: Throwable) {
      // 清理失败不影响主流程，下次补录时会再做一次幂等处理
    }
  }

  fun toJsMap(entry: Entry): Map<String, Any?> = mapOf(
    "id" to entry.id,
    "amountFen" to entry.amountFen,
    "direction" to entry.direction,
    "note" to entry.note,
    "rawText" to entry.rawText,
    "appName" to entry.appName,
    "packageName" to entry.packageName,
    "postedAt" to entry.postedAt.toDouble(),
    "confirmedAt" to entry.confirmedAt.toDouble()
  )

  private fun toJson(entry: Entry): JSONObject = JSONObject().apply {
    put("id", entry.id)
    put("amountFen", entry.amountFen)
    put("direction", entry.direction)
    put("note", entry.note)
    put("rawText", entry.rawText)
    put("appName", entry.appName)
    put("packageName", entry.packageName)
    put("postedAt", entry.postedAt)
    put("confirmedAt", entry.confirmedAt)
  }

  private fun fromJson(json: JSONObject?): Entry? {
    if (json == null) return null
    return try {
      val amountFen = json.getLong("amountFen")
      if (amountFen <= 0L) return null

      Entry(
        id = json.optString("id", ""),
        amountFen = amountFen,
        direction = if (json.optString("direction") == DIRECTION_INCOME) DIRECTION_INCOME else DIRECTION_EXPENSE,
        note = json.optString("note", ""),
        rawText = json.optString("rawText", ""),
        appName = json.optString("appName", ""),
        packageName = json.optString("packageName", ""),
        postedAt = json.optLong("postedAt", 0L),
        confirmedAt = json.optLong("confirmedAt", 0L)
      )
    } catch (t: Throwable) {
      null
    }
  }
}
