import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { listTransactionsForExport } from '../db/transactions';
import { formatMonthLabel } from './date';
import { buildCsv, csvFileName } from './csv';

export interface ExportResult {
  count: number;
  uri: string;
}

/**
 * 导出指定月份的账单为 CSV：写入缓存目录 → 调起系统分享面板。
 * 失败时抛出的 Error.message 可以直接展示给用户。
 */
export async function exportTransactionsCsv(month: string): Promise<ExportResult> {
  const rows = listTransactionsForExport(month);
  if (rows.length === 0) {
    throw new Error(`${formatMonthLabel(month)}没有账单可以导出`);
  }

  const file = new File(Paths.cache, csvFileName(month));
  if (file.exists) file.delete();
  file.create({ overwrite: true, intermediates: true });
  file.write(buildCsv(rows));

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error(`当前设备不支持分享文件，CSV 已保存到：${file.uri}`);
  }

  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    dialogTitle: `导出 ${formatMonthLabel(month)} 账单`,
    UTI: 'public.comma-separated-values-text',
  });

  return { count: rows.length, uri: file.uri };
}
