package expo.modules.notificationlistener

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * 用 SharedPreferences 落盘最近 50 条通知原文，App 切回前台时直接读，
 * 不依赖 JS 在后台存活 —— 这是「后台收到通知也能看到」的关键。
 */
internal object DebugLogStore {

  private const val PREFS_NAME = "notify_poc_debug"
  private const val KEY_ENTRIES = "entries"
  private const val MAX_ENTRIES = 50

  private val lock = Any()

  data class Entry(
    val timestamp: Long,
    val packageName: String,
    val title: String,
    val text: String,
    val bigText: String,
    val subText: String,
    val tickerText: String,
    val extrasDump: String,
    val isMatch: Boolean,
    val amountFen: Long?,
    val matchedKeyword: String
  )

  fun append(context: Context, entry: Entry) {
    synchronized(lock) {
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val existing = parseArray(prefs.getString(KEY_ENTRIES, null))

      // 新条目置顶，超出 50 条丢最旧的
      val next = JSONArray()
      next.put(toJson(entry))
      for (i in 0 until existing.length()) {
        if (next.length() >= MAX_ENTRIES) break
        next.put(existing.opt(i))
      }

      prefs.edit().putString(KEY_ENTRIES, next.toString()).apply()
    }
  }

  fun readAll(context: Context): List<Entry> {
    synchronized(lock) {
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val array = parseArray(prefs.getString(KEY_ENTRIES, null))

      return (0 until array.length()).mapNotNull { index ->
        array.optJSONObject(index)?.let { fromJson(it) }
      }
    }
  }

  fun clear(context: Context) {
    synchronized(lock) {
      context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .remove(KEY_ENTRIES)
        .apply()
    }
  }

  fun toJsMap(entry: Entry): Map<String, Any?> = mapOf(
    "timestamp" to entry.timestamp,
    "packageName" to entry.packageName,
    "title" to entry.title,
    "text" to entry.text,
    "bigText" to entry.bigText,
    "subText" to entry.subText,
    "tickerText" to entry.tickerText,
    "extrasDump" to entry.extrasDump,
    "isMatch" to entry.isMatch,
    "amountFen" to entry.amountFen,
    "matchedKeyword" to entry.matchedKeyword
  )

  private fun parseArray(raw: String?): JSONArray = try {
    if (raw.isNullOrBlank()) JSONArray() else JSONArray(raw)
  } catch (e: Exception) {
    JSONArray()
  }

  private fun toJson(entry: Entry): JSONObject = JSONObject().apply {
    put("timestamp", entry.timestamp)
    put("packageName", entry.packageName)
    put("title", entry.title)
    put("text", entry.text)
    put("bigText", entry.bigText)
    put("subText", entry.subText)
    put("tickerText", entry.tickerText)
    put("extrasDump", entry.extrasDump)
    put("isMatch", entry.isMatch)
    put("amountFen", entry.amountFen ?: JSONObject.NULL)
    put("matchedKeyword", entry.matchedKeyword)
  }

  private fun fromJson(json: JSONObject): Entry = Entry(
    timestamp = json.optLong("timestamp", 0L),
    packageName = json.optString("packageName", ""),
    title = json.optString("title", ""),
    text = json.optString("text", ""),
    bigText = json.optString("bigText", ""),
    subText = json.optString("subText", ""),
    tickerText = json.optString("tickerText", ""),
    extrasDump = json.optString("extrasDump", ""),
    isMatch = json.optBoolean("isMatch", false),
    amountFen = if (json.isNull("amountFen")) null else json.optLong("amountFen", 0L),
    matchedKeyword = json.optString("matchedKeyword", "")
  )
}
