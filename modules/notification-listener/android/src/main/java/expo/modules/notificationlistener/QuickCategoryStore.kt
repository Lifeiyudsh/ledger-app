package expo.modules.notificationlistener

import android.content.Context
import org.json.JSONArray

/**
 * 悬浮条上显示的三个快捷分类。
 *
 * 默认写死「餐饮/交通/购物」，但每个人的高频分类不同；
 * JS 侧按最近 30 天的支出频次算好后存在这里，悬浮条照着显示。
 */
internal object QuickCategoryStore {

  private const val PREFS_NAME = "quick_categories"
  private const val KEY_ITEMS = "items"

  data class Item(val key: String, val label: String)

  val DEFAULT: List<Item> = listOf(
    Item("food", "餐饮"),
    Item("transport", "交通"),
    Item("shopping", "购物")
  )

  fun read(context: Context): List<Item> {
    return try {
      val raw = context.applicationContext
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .getString(KEY_ITEMS, null)

      if (raw.isNullOrBlank()) return DEFAULT

      val array = JSONArray(raw)
      val items = (0 until array.length()).mapNotNull { index ->
        val obj = array.optJSONObject(index) ?: return@mapNotNull null
        val key = obj.optString("key")
        val label = obj.optString("label")
        if (key.isBlank() || label.isBlank()) null else Item(key, label)
      }

      if (items.isEmpty()) DEFAULT else items.take(3)
    } catch (t: Throwable) {
      DEFAULT
    }
  }

  fun write(context: Context, items: List<Item>) {
    try {
      val array = JSONArray()
      items.take(3).forEach { item ->
        array.put(
          org.json.JSONObject().apply {
            put("key", item.key)
            put("label", item.label)
          }
        )
      }
      context.applicationContext
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .putString(KEY_ITEMS, array.toString())
        .apply()
    } catch (t: Throwable) {
      // 忽略：读的时候会退回默认值
    }
  }
}
