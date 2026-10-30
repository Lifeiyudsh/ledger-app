import { useSyncExternalStore } from 'react';
import type { Direction } from '../types';
import { todayISO } from './date';

/**
 * 「待确认」的自动记账捕获。
 *
 * 铁律：这里的数据**绝不直接落库**，只是暂存在内存里等用户确认。
 * 用户点横幅 → 进入「记一笔」并预填 → 用户选分类并保存后才会写 ledger2.db。
 */

export interface NotificationTransactionPayload {
  /** 元（浮点，仅供展示，不要拿它算钱） */
  amount: number;
  /** 分（整数，唯一可信的金额） */
  amountFen: number;
  type: Direction;
  /** 命中的交易动词，如「支付成功」 */
  keyword: string;
  /** 该条通知能拿到的全部文本 */
  rawText: string;
  title: string;
  packageName: string;
  appName: string;
  postedAt: number;
}

export interface PendingCapture {
  /** 去重/消费用的唯一 id */
  id: string;
  amountCents: number;
  direction: Direction;
  /** 预填到备注里的商户名 */
  note: string;
  /** 'YYYY-MM-DD' */
  date: string;
  appName: string;
  packageName: string;
  keyword: string;
  rawText: string;
  capturedAt: number;
}

/** 同金额同文本在这个时间窗内重复上报，视为同一条通知 */
const DEDUPE_WINDOW_MS = 60_000;

let pending: PendingCapture | null = null;
const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): PendingCapture | null {
  return pending;
}

/** 把「张三 ¥100.00」「星巴克 25.00」这类尾巴去掉，只留商户名 */
function cleanMerchant(raw: string): string {
  return raw
    .replace(/[¥￥][\s\S]*$/, '') // 从货币符号起全部截断
    .replace(/\s*\d[\d.,]*\s*元?\s*$/, '') // 去掉尾部纯金额
    .replace(/[，,。.;；:：]+$/, '')
    .trim()
    .slice(0, 24);
}

/** 从通知文本里尽量捞一个商户名，捞不到返回空串 */
export function extractMerchant(rawText: string, title: string): string {
  const text = `${rawText ?? ''}\n${title ?? ''}`;
  const patterns = [
    /收款方[:：]\s*([^\n|]{1,40})/,
    /商户名?称?[:：]\s*([^\n|]{1,40})/,
    /付款给\s*([^\n|]{1,40})/,
    /向\s*([^\n|]{1,40})\s*付款/,
    /转给\s*([^\n|]{1,40})/,
  ];

  for (const pattern of patterns) {
    const matched = pattern.exec(text);
    const value = cleanMerchant(matched?.[1] ?? '');
    if (value && !/^[¥￥\d]/.test(value)) return value;
  }

  // 标题常常就是「微信支付 / 支付宝」这类品牌词，做备注没意义
  const trimmedTitle = cleanMerchant(title ?? '');
  if (trimmedTitle && !/微信支付|支付宝|云闪付|通知/.test(trimmedTitle)) {
    return trimmedTitle;
  }
  return '';
}

/**
 * 收到一条原生捕获 → 放进待确认槽。
 * 同一条通知重复上报（native 侧 group 展开可能触发两次）会被去重。
 */
export function pushCapture(payload: NotificationTransactionPayload): boolean {
  if (!Number.isSafeInteger(payload.amountFen) || payload.amountFen <= 0) return false;

  const note = extractMerchant(payload.rawText, payload.title);
  const capturedAt = Date.now();

  if (
    pending &&
    capturedAt - pending.capturedAt < DEDUPE_WINDOW_MS &&
    pending.amountCents === payload.amountFen &&
    pending.rawText === payload.rawText
  ) {
    return false;
  }

  pending = {
    id: `${payload.postedAt || capturedAt}-${payload.amountFen}`,
    amountCents: payload.amountFen,
    direction: payload.type === 'income' ? 'income' : 'expense',
    note: note || `${payload.appName || '通知'} 自动识别`,
    date: todayISO(),
    appName: payload.appName || payload.packageName || '未知应用',
    packageName: payload.packageName || '',
    keyword: payload.keyword || '',
    rawText: payload.rawText || '',
    capturedAt,
  };

  emitChange();
  return true;
}

/** 用户已确认记账 / 主动忽略 */
export function clearPendingCapture(): void {
  if (!pending) return;
  pending = null;
  emitChange();
}

/** 订阅当前待确认项（无则 null） */
export function usePendingCapture(): PendingCapture | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** 仅供测试/调试：直接读取当前值 */
export function getPendingCapture(): PendingCapture | null {
  return pending;
}
