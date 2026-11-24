/**
 * 报表周期（周 / 月 / 年）的纯计算，不碰数据库和 UI，方便单测。
 *
 * 约定：
 * - 日期一律 'YYYY-MM-DD'，闭区间 [start, end]
 * - 周从周一开始（国内习惯），到周日结束
 * - 所有函数不修改入参
 */

export type PeriodKind = 'week' | 'month' | 'year';

export interface Period {
  kind: PeriodKind;
  start: string;
  end: string;
  /** 周期天数（年按真实天数算，闰年 366） */
  days: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function toIso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date: Date, delta: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + delta);
  return next;
}

function diffDays(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
}

/** 周一为一周第一天 */
function startOfWeek(date: Date): Date {
  const weekday = date.getDay(); // 0 = 周日
  const offset = weekday === 0 ? -6 : 1 - weekday;
  return addDays(date, offset);
}

export function makePeriod(kind: PeriodKind, anchor: Date): Period {
  if (kind === 'week') {
    const start = startOfWeek(anchor);
    const end = addDays(start, 6);
    return { kind, start: toIso(start), end: toIso(end), days: 7 };
  }

  if (kind === 'month') {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return { kind, start: toIso(start), end: toIso(end), days: end.getDate() };
  }

  const start = new Date(anchor.getFullYear(), 0, 1);
  const end = new Date(anchor.getFullYear(), 11, 31);
  return { kind, start: toIso(start), end: toIso(end), days: diffDays(start, end) };
}

export function currentPeriod(kind: PeriodKind, today: Date = new Date()): Period {
  return makePeriod(kind, today);
}

/** 前后翻页：周 ±7 天，月/年按日历滚动 */
export function shiftPeriod(period: Period, delta: number): Period {
  const start = fromIso(period.start);

  if (period.kind === 'week') return makePeriod('week', addDays(start, delta * 7));
  if (period.kind === 'month') return makePeriod('month', new Date(start.getFullYear(), start.getMonth() + delta, 1));
  return makePeriod('year', new Date(start.getFullYear() + delta, 0, 1));
}

export function periodLabel(period: Period): string {
  const start = fromIso(period.start);
  const end = fromIso(period.end);

  if (period.kind === 'week') {
    return `${start.getMonth() + 1}.${start.getDate()} - ${end.getMonth() + 1}.${end.getDate()}`;
  }
  if (period.kind === 'month') {
    return `${start.getFullYear()}年${start.getMonth() + 1}月`;
  }
  return `${start.getFullYear()}年`;
}

/** 周期内每一天的 ISO 日期（趋势图的横轴） */
export function eachDay(period: Period): string[] {
  const out: string[] = [];
  const start = fromIso(period.start);
  for (let i = 0; i < period.days; i += 1) {
    out.push(toIso(addDays(start, i)));
  }
  return out;
}

/** 周期是否为「当前」的周/月/年（决定趋势图要不要截断到今天） */
export function isCurrentPeriod(period: Period, today: Date = new Date()): boolean {
  const current = makePeriod(period.kind, today);
  return current.start === period.start;
}
