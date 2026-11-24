package expo.modules.notificationlistener

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationManagerCompat

/**
 * 通知里点了「餐饮 / 交通 / 购物」。
 * 只负责把意图落盘 + 收起通知，真正改分类交给 JS（它可能还没启动）。
 */
class CategoryFixReceiver : BroadcastReceiver() {

  companion object {
    private const val TAG = "CategoryFix"
    const val ACTION_FIX = "expo.modules.notificationlistener.CATEGORY_FIX"
    const val EXTRA_ID = "capture_id"
    const val EXTRA_AMOUNT = "amount_fen"
    const val EXTRA_CATEGORY = "category"
    const val EXTRA_NOTIFICATION_ID = "notification_id"
  }

  override fun onReceive(context: Context?, intent: Intent?) {
    if (context == null || intent == null) return
    if (intent.action != ACTION_FIX) return

    try {
      val id = intent.getStringExtra(EXTRA_ID).orEmpty()
      val amountFen = intent.getLongExtra(EXTRA_AMOUNT, 0L)
      val category = intent.getStringExtra(EXTRA_CATEGORY).orEmpty()
      if (category.isBlank() || amountFen <= 0L) return

      CategoryFixStore.add(
        context,
        CategoryFixStore.Fix(
          id = id,
          amountFen = amountFen,
          category = category,
          at = System.currentTimeMillis()
        )
      )

      // 收起通知，避免用户重复点
      val notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, 7300)
      NotificationManagerCompat.from(context).cancel(notificationId)
      NotificationManagerCompat.from(context).cancel(7300)

      Log.i(TAG, "记录分类修正：$category / $amountFen 分")
    } catch (t: Throwable) {
      Log.w(TAG, "处理分类修正失败", t)
    }
  }
}
