package expo.modules.notificationlistener

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * 「通知里点了分类」→ JS 侧据此改分类。
 *
 * 为什么要过一道队列：点通知按钮时 JS 很可能没在跑（付款瞬间），
 * 所以先把指令落盘，等 JS 下一次启动/回前台再统一应用，不丢。
 */
internal object CategoryFixStore {

  private const val PREFS_NAME = "category_fix_queue"
  private const val KEY_ITEMS = "items"
  private const val MAX_ITEMS = 20

  private val lock = Any()

  data class Fix(
    val id: String,
    val amountFen: Long,
    /** category / note / delete */
    val action: String,
    /** 空串表示这次只改备注，不动分类 */
    val category: String,
    /** 空串表示这次只改分类，不动备注 */
    val note: String,
    val at: Long
  )

  fun add(context: Context, fix: Fix) {
    synchronized(lock) {
      try {
        val prefs = context.applicationContext
          .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val existing = readArray(prefs.getString(KEY_ITEMS, null))

        val next = JSONArray()
        next.put(
          JSONObject().apply {
            put("id", fix.id)
            put("amountFen", fix.amountFen)
            put("action", fix.action)
            put("category", fix.category)
            put("note", fix.note)
            put("at", fix.at)
          }
        )

        for (i in 0 until existing.length()) {
          if (next.length() >= MAX_ITEMS) break
          next.put(existing.opt(i))
        }

        prefs.edit().putString(KEY_ITEMS, next.toString()).apply()
      } catch (t: Throwable) {
        // 写失败就放弃这次修改，不影响已入库的记录
      }
    }
  }

  fun readAll(context: Context): List<Fix> {
    synchronized(lock) {
      return try {
        val prefs = context.applicationContext
          .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val array = readArray(prefs.getString(KEY_ITEMS, null))

        (0 until array.length()).mapNotNull { index ->
          val item = array.optJSONObject(index) ?: return@mapNotNull null
          Fix(
            id = item.optString("id"),
            amountFen = item.optLong("amountFen"),
            action = item.optString("action").ifBlank { "category" },
            category = item.optString("category"),
            note = item.optString("note"),
            at = item.optLong("at")
          )
        }
      } catch (t: Throwable) {
        emptyList()
      }
    }
  }

  fun clear(context: Context) {
    synchronized(lock) {
      try {
        context.applicationContext
          .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
          .edit()
          .remove(KEY_ITEMS)
          .apply()
      } catch (t: Throwable) {
        // 忽略
      }
    }
  }

  private fun readArray(raw: String?): JSONArray = try {
    if (raw.isNullOrBlank()) JSONArray() else JSONArray(raw)
  } catch (t: Throwable) {
    JSONArray()
  }
}
