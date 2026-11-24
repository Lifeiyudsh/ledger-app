import type { CategoryKey } from '../constants/categories';
import type { Transaction } from '../types';
import { eachDay, isCurrentPeriod, type Period } from './period';
import { toPercentValue } from './stats';

/**
 * 报表聚合（纯函数，可单测）。
 * 全程整数「分」，只在交给图表时除以 100。
 */

export interface ReportSummary {
  expenseCents: number;
  incomeCents: number;
  count: number;
  /** 日均支出参与的天数（当前周期只算到今天，避免月初被摊薄） */
  days: number;
  dailyAvgCents: number;
}

function daysElapsed(period: Period, today: Date): number {
  if (!isCurrentPeriod(period, today)) return period.days;
  const startMs = new Date(`${period.start}T00:00:00`).getTime();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`;
  const todayMs = new Date(`${todayIso}T00:00:00`).getTime();
  const elapsed = Math.floor((todayMs - startMs) / (24 * 60 * 60 * 1000)) + 1;
  return Math.min(Math.max(elapsed, 1), period.days);
}

export function summarize(rows: Transaction[], period: Period, today: Date = new Date()): ReportSummary {
  let expenseCents = 0;
  let incomeCents = 0;

  for (const row of rows) {
    if (row.direction === 'income') incomeCents += row.amountCents;
    else expenseCents += row.amountCents;
  }

  const days = daysElapsed(period, today);
  return {
    expenseCents,
    incomeCents,
    count: rows.length,
    days,
    dailyAvgCents: Math.round(expenseCents / days),
  };
}

export interface TrendPoint {
  key: string;
  label: string;
  expenseCents: number;
}

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

/**
 * 支出趋势：周=7 点（周一到周日）、月=按日、年=12 个月。
 * 标签只在对齐的节点显示，避免 31 个点挤在一起。
 */
export function buildTrend(rows: Transaction[], period: Period): TrendPoint[] {
  const bucket = new Map<string, number>();
  for (const row of rows) {
    if (row.direction !== 'expense') continue;
    const key = period.kind === 'year' ? row.date.slice(0, 7) : row.date;
    bucket.set(key, (bucket.get(key) ?? 0) + row.amountCents);
  }

  if (period.kind === 'week') {
    return eachDay(period).map((iso, index) => ({
      key: iso,
      label: WEEK_LABELS[index] ?? '',
      expenseCents: bucket.get(iso) ?? 0,
    }));
  }

  if (period.kind === 'month') {
    const days = eachDay(period);
    const lastDay = days.length;
    return days.map((iso, index) => {
      const day = index + 1;
      const show = day === 1 || day % 5 === 0 || day === lastDay;
      return { key: iso, label: show ? String(day) : '', expenseCents: bucket.get(iso) ?? 0 };
    });
  }

  const year = period.start.slice(0, 4);
  return Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, '0');
    return {
      key: `${year}-${month}`,
      label: index % 2 === 0 ? `${index + 1}` : '',
      expenseCents: bucket.get(`${year}-${month}`) ?? 0,
    };
  });
}

export interface CategoryRank {
  category: CategoryKey;
  totalCents: number;
  count: number;
  /** 占总支出的百分比（0-100，保留 1 位） */
  percent: number;
}

export function buildCategoryRank(
  rows: Transaction[],
  direction: 'expense' | 'income' = 'expense',
): CategoryRank[] {
  const totals = new Map<CategoryKey, { totalCents: number; count: number }>();
  let grandTotal = 0;

  for (const row of rows) {
    if (row.direction !== direction) continue;
    const current = totals.get(row.category) ?? { totalCents: 0, count: 0 };
    current.totalCents += row.amountCents;
    current.count += 1;
    totals.set(row.category, current);
    grandTotal += row.amountCents;
  }

  return [...totals.entries()]
    .map(([category, value]) => ({
      category,
      totalCents: value.totalCents,
      count: value.count,
      percent: toPercentValue(value.totalCents, grandTotal),
    }))
    .sort((a, b) => b.totalCents - a.totalCents);
}
