import * as Clipboard from 'expo-clipboard';
import { listAllTransactionsForBackup } from '../db/transactions';
import {
  parseBackup,
  serializeBackup,
  type BackupRecord,
  type ParseResult,
} from './backupFormat';

/** 把全部账单序列化成 JSON 并复制到系统剪贴板，返回条目数 */
export async function copyBackupToClipboard(): Promise<number> {
  const rows = listAllTransactionsForBackup();
  if (rows.length === 0) {
    throw new Error('还没有账单可以备份');
  }

  const records: BackupRecord[] = rows.map((row) => ({
    direction: row.direction,
    amount_cents: row.amountCents,
    category: row.category,
    note: row.note,
    date: row.date,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }));

  await Clipboard.setStringAsync(serializeBackup(records));
  return records.length;
}

/** 读取剪贴板并解析校验；内容为空或格式不对时抛出可直接展示的错误 */
export async function readBackupFromClipboard(): Promise<ParseResult> {
  const text = await Clipboard.getStringAsync();
  return parseBackup(text ?? '');
}
