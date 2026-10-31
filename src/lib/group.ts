import type { Transaction } from '../types';

export interface DaySection {
  /** 'YYYY-MM-DD' */
  title: string;
  data: Transaction[];
  expenseCents: number;
  incomeCents: number;
}

/** 按日期倒序分组，同日保持传入顺序（列表页与搜索页共用） */
export function buildDaySections(rows: readonly Transaction[]): DaySection[] {
  const byDate = new Map<string, Transaction[]>();
  for (const row of rows) {
    const bucket = byDate.get(row.date);
    if (bucket) bucket.push(row);
    else byDate.set(row.date, [row]);
  }

  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([date, items]) => {
      let expenseCents = 0;
      let incomeCents = 0;
      for (const item of items) {
        if (item.direction === 'income') incomeCents += item.amountCents;
        else expenseCents += item.amountCents;
      }
      return { title: date, data: items, expenseCents, incomeCents };
    });
}

/** 一批记录的收支合计（整数「分」相加） */
export function sumByDirection(rows: readonly Transaction[]): {
  expenseCents: number;
  incomeCents: number;
  netCents: number;
  count: number;
} {
  let expenseCents = 0;
  let incomeCents = 0;
  for (const row of rows) {
    if (row.direction === 'income') incomeCents += row.amountCents;
    else expenseCents += row.amountCents;
  }
  return { expenseCents, incomeCents, netCents: incomeCents - expenseCents, count: rows.length };
}
