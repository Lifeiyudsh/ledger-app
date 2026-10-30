import { useEffect } from 'react';
import { AppState } from 'react-native';
import { guessCategory } from './categoryGuess';
import { createTransaction } from '../db/transactions';
import { toISODate } from './date';
import {
  clearPendingAutoRecords,
  getPendingAutoRecords,
  subscribeOverlayConfirmed,
  type OverlayConfirmedPayload,
  type PendingAutoRecord,
} from './notificationBridge';

/**
 * 悬浮窗气泡确认后的「自动记账」。
 *
 * 数据链路：气泡点击 → 原生写 SharedPreferences 队列 → 这里 drain 入库 → 清空队列。
 * 即使点击时 JS runtime 已经死了，下次启动 App 也会把队列补齐（不丢数据）。
 */

const listeners = new Set<() => void>();

/** 补录成功后通知外部（列表页用它重新读库） */
export function subscribeAutoBookkeepingDone(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyDone() {
  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      console.warn('[auto-bookkeeping] 通知刷新失败', error);
    }
  }
}

/** 单条入库：备注强制带「自动」前缀，方便日后筛出来核对/撤销 */
function insertRecord(record: Partial<PendingAutoRecord>): void {
  const amountCents = Math.trunc(Number(record.amountFen ?? 0));
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new Error(`金额非法：${record.amountFen}`);
  }

  const direction = record.direction === 'income' ? 'income' : 'expense';
  const merchant = (record.note || record.appName || '通知').trim() || '通知';
  const category = guessCategory(`${record.note ?? ''} ${record.rawText ?? ''}`, direction);

  const timestamp = Number(record.postedAt) > 0 ? Number(record.postedAt) : Number(record.confirmedAt) || Date.now();

  createTransaction({
    direction,
    amountCents,
    category,
    note: `自动 · ${merchant}`.slice(0, 100),
    date: toISODate(new Date(timestamp)),
  });
}

let draining = false;

/**
 * 把原生队列里的记录全部入库。
 * 全部成功才清空队列；中途失败保留队列，下次再试（宁可重试，也不丢数据）。
 */
export async function drainPendingAutoRecords(): Promise<{ inserted: number; failed: boolean }> {
  if (draining) return { inserted: 0, failed: false };
  draining = true;

  try {
    const records = await getPendingAutoRecords();
    if (records.length === 0) return { inserted: 0, failed: false };

    let inserted = 0;
    for (const record of records) {
      insertRecord(record);
      inserted += 1;
    }

    await clearPendingAutoRecords();
    if (inserted > 0) notifyDone();

    return { inserted, failed: false };
  } catch (error) {
    console.warn('[auto-bookkeeping] 补录失败，队列保留待下次重试', error);
    return { inserted: 0, failed: true };
  } finally {
    draining = false;
  }
}

/** 根组件挂一次：启动补录 + 监听气泡确认 + 回前台补录 */
export function useAutoBookkeeping(): void {
  useEffect(() => {
    void drainPendingAutoRecords();

    const unsubscribe = subscribeOverlayConfirmed((payload: OverlayConfirmedPayload) => {
      // 极端情况：原生队列写失败，数据跟着事件过来了，直接入库
      if (payload?.fallback && Number(payload.amountFen) > 0) {
        try {
          insertRecord(payload);
          notifyDone();
        } catch (error) {
          console.warn('[auto-bookkeeping] 事件兜底入库失败', error);
        }
      }
      void drainPendingAutoRecords();
    });

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void drainPendingAutoRecords();
    });

    return () => {
      unsubscribe();
      appStateSub.remove();
    };
  }, []);
}
