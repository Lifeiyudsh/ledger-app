import { getCategoryLabel } from '../constants/categories';
import { centsToFixed } from './money';
import type { Transaction } from '../types';

/** Excel 识别 UTF-8 需要 BOM，否则中文分类名会乱码 */
const BOM = '\uFEFF';
const EOL = '\r\n';

export const CSV_HEADER = ['日期', '类型', '分类', '金额(元)', '金额(分)', '备注', '记录ID'] as const;

/** 防 CSV 公式注入：以这些字符开头的文本可能被 Excel 当公式执行 */
function escapeField(value: string): string {
  let v = value;
  if (/^[=+@\t\r]/.test(v)) v = `'${v}`;
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function toRowCells(t: Transaction): string[] {
  return [
    t.date,
    t.direction === 'income' ? '收入' : '支出',
    getCategoryLabel(t.category),
    centsToFixed(t.amountCents), // 元：字符串，保持两位小数
    String(t.amountCents),       // 分：整数，绝不丢精度
    t.note ?? '',
    String(t.id),
  ];
}

/**
 * 生成 CSV 文本。
 * 明细之后追加汇总块；所有金额求和都在「分」上做整数加法，无浮点误差。
 */
export function buildCsv(rows: readonly Transaction[]): string {
  const lines: string[] = [CSV_HEADER.map(escapeField).join(',')];

  for (const row of rows) {
    lines.push(toRowCells(row).map(escapeField).join(','));
  }

  let expenseCents = 0;
  let incomeCents = 0;
  for (const row of rows) {
    if (row.direction === 'income') incomeCents += row.amountCents;
    else expenseCents += row.amountCents;
  }

  const summary = (label: string, cents: number, extra: string) =>
    ['合计', label, '', centsToFixed(cents), String(cents), extra, ''].map(escapeField).join(',');

  lines.push('');
  lines.push(summary('支出', expenseCents, `${rows.length} 笔记录`));
  lines.push(summary('收入', incomeCents, ''));
  lines.push(summary('结余', incomeCents - expenseCents, '收入 - 支出'));

  return BOM + lines.join(EOL) + EOL;
}

/** 导出文件名按月份命名：ledger-2026-10.csv */
export function csvFileName(month: string): string {
  return `ledger-${month}.csv`;
}
