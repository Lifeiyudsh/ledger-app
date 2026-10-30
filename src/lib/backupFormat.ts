/**
 * 备份内容格式（纯函数，不碰数据库与平台 API，便于单测）。
 *
 * 结构：{ "format": "ledger-backup", "version": 1, "exportedAt": "...", "count": n, "data": [...] }
 * 字段刻意沿用数据库列名（snake_case），备份 → 恢复 不需要中间映射，也不丢 created_at。
 */

import { isCategoryAllowed, type CategoryKey } from '../constants/categories';
import { isValidISODate } from './date';
import type { Direction } from '../types';

export const BACKUP_FORMAT = 'ledger-backup';
export const BACKUP_VERSION = 1;

export interface BackupRecord {
  direction: Direction;
  /** 金额，整数「分」 */
  amount_cents: number;
  category: CategoryKey;
  note: string | null;
  /** 'YYYY-MM-DD' */
  date: string;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface BackupDoc {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  count: number;
  data: BackupRecord[];
}

export interface ParseResult {
  doc: BackupDoc;
  /** 通过校验、可以入库的记录 */
  accepted: BackupRecord[];
  /** 校验失败被跳过的条数 */
  rejected: number;
}

/** 生成备份文本（缩进 2 空格，方便在聊天窗口里肉眼检查） */
export function serializeBackup(
  records: readonly BackupRecord[],
  exportedAt: Date = new Date(),
): string {
  const doc: BackupDoc = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: exportedAt.toISOString(),
    count: records.length,
    data: [...records],
  };
  return JSON.stringify(doc, null, 2);
}

function toDirection(value: unknown): Direction | null {
  return value === 'expense' || value === 'income' ? value : null;
}

/** 单条校验：任一项不合格就返回 null，由调用方计入 rejected */
export function normalizeRecord(raw: unknown): BackupRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;

  const direction = toDirection(item.direction);
  if (!direction) return null;

  const amount = item.amount_cents;
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) return null;

  const category = typeof item.category === 'string' ? item.category.trim() : '';
  if (!category || !isCategoryAllowed(direction, category)) return null;

  const date = typeof item.date === 'string' ? item.date.trim() : '';
  if (!isValidISODate(date)) return null;

  const rawNote = item.note;
  if (rawNote !== null && rawNote !== undefined && typeof rawNote !== 'string') return null;
  const note = typeof rawNote === 'string' && rawNote.trim() ? rawNote.trim().slice(0, 500) : null;

  const pickTimestamp = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() ? value.trim() : null;

  return {
    direction,
    amount_cents: amount,
    category: category as CategoryKey,
    note,
    date,
    created_at: pickTimestamp(item.created_at),
    updated_at: pickTimestamp(item.updated_at),
  };
}

/**
 * 解析 + 逐条校验。
 * 整体格式不对直接抛错（调用方把 message 弹给用户），单条脏数据只跳过不中断。
 */
export function parseBackup(text: string): ParseResult {
  if (!text || !text.trim()) {
    throw new Error('剪贴板是空的，请先复制备份内容');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('剪贴板内容不是合法的 JSON');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('剪贴板内容不是备份数据');
  }

  const root = parsed as Record<string, unknown>;
  // data 为当前格式；transactions 兼容早期文件备份版本
  const list = Array.isArray(root.data)
    ? root.data
    : Array.isArray(root.transactions)
      ? root.transactions
      : null;
  if (!list) {
    throw new Error('剪贴板内容里没有 data 列表，可能不是本 App 的备份');
  }

  const version = typeof root.version === 'number' ? root.version : BACKUP_VERSION;
  if (version > BACKUP_VERSION) {
    throw new Error(`备份版本（v${version}）高于当前 App 支持的 v${BACKUP_VERSION}`);
  }

  const accepted: BackupRecord[] = [];
  let rejected = 0;
  for (const raw of list) {
    const record = normalizeRecord(raw);
    if (record) accepted.push(record);
    else rejected++;
  }

  if (accepted.length === 0) {
    throw new Error(
      rejected > 0 ? `${rejected} 条记录全部校验失败，无法恢复` : '备份里没有可恢复的记录',
    );
  }

  const doc: BackupDoc = {
    format: BACKUP_FORMAT,
    version,
    exportedAt: typeof root.exportedAt === 'string' ? root.exportedAt : '',
    count: accepted.length,
    data: accepted,
  };

  return { doc, accepted, rejected };
}
