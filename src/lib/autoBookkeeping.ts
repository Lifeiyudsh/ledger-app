import { useEffect } from 'react';
import { AppState } from 'react-native';
import { getCategoryLabel, type CategoryKey } from '../constants/categories';
import { guessCategory } from './categoryGuess';
import { createTransaction, deleteRecentByAmount, patchRecentByAmount } from '../db/transactions';
import { toISODate } from './date';
import {
  clearCategoryFixes,
  clearPendingAutoRecords,
  getCategoryFixes,
  getPendingAutoRecords,
  subscribeOverlayConfirmed,
  type OverlayConfirmedPayload,
  type PendingAutoRecord,
} from './notificationBridge';

/**
 * 自动记账的入库侧。
 *
 * 数据链路：原生捕获（通知/读屏/短信）→ 写 SharedPreferences 队列 → 这里 drain 入库 → 清空队列 → toast 提示。
 * 即使捕获时 JS runtime 已经死了，下次启动 App 也会把队列补齐（不丢数据）。
 * 「免确认」开关打开时链路完全一样，只是无需用户点气泡/横幅。
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
interface InsertedInfo {
  amountCents: number;
  categoryLabel: string;
}

function insertRecord(record: Partial<PendingAutoRecord>): InsertedInfo {
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

  return { amountCents, categoryLabel: getCategoryLabel(category) };
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

    const insertedItems: InsertedInfo[] = [];
    for (const record of records) {
      insertedItems.push(insertRecord(record));
    }

    await clearPendingAutoRecords();
    if (insertedItems.length > 0) notifyDone();

    return { inserted: insertedItems.length, failed: false };
  } catch (error) {
    console.warn('[auto-bookkeeping] 补录失败，队列保留待下次重试', error);
    return { inserted: 0, failed: true };
  } finally {
    draining = false;
  }
}

/** 通知栏点过的分类：把最近一笔同金额的记录改过去 */
export async function applyCategoryFixes(): Promise<number> {
  const fixes = await getCategoryFixes();
  if (fixes.length === 0) return 0;

  const since = toISODate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  let applied = 0;

  for (const fix of fixes) {
    const amount = Math.trunc(Number(fix.amountFen));
    if (!Number.isSafeInteger(amount) || amount <= 0) continue;

    try {
      if (fix.action === 'delete') {
        applied += deleteRecentByAmount(amount, since);
        continue;
      }

      const patch: { category?: CategoryKey; note?: string } = {};
      if (fix.category) patch.category = fix.category as CategoryKey;
      if (fix.note && fix.note.trim().length > 0) patch.note = fix.note.trim();
      applied += patchRecentByAmount(amount, patch, since);
    } catch (error) {
      console.warn('[auto-bookkeeping] 应用修正失败', error);
    }
  }

  await clearCategoryFixes();
  if (applied > 0) notifyDone();
  return applied;
}

/** 根组件挂一次：启动补录 + 监听气泡确认 + 回前台补录 */
export function useAutoBookkeeping(): void {
  useEffect(() => {
    void drainPendingAutoRecords().then(() => applyCategoryFixes());

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
      void drainPendingAutoRecords().then(() => applyCategoryFixes());
    });

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void drainPendingAutoRecords().then(() => applyCategoryFixes());
      }
    });

    return () => {
      unsubscribe();
      appStateSub.remove();
    };
  }, []);
}
