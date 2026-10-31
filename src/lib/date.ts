/**
 * 日期工具。全部围绕 'YYYY-MM-DD' 文本 + 本地时区，
 * 不引入 UTC 偏移概念（记账只关心「哪天」，不关心几点）。
 */

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const;

const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * 严格解析 'YYYY-MM-DD'。
 * Date 构造器会把 2026-10-32 悄悄进位成 11-01，所以必须回读比对，不一致即非法。
 */
export function parseISODate(value: string): Date | null {
  const matched = ISO_DATE_RE.exec((value ?? '').trim());
  if (!matched) return null;

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null; // 2026-02-30、2026-10-32 这类脏数据在这里被拦下
  }
  return date;
}

/** 业务层日期合法性校验（表单提交前调用） */
export function isValidISODate(value: string): boolean {
  return parseISODate(value) !== null;
}

/** Date → 'YYYY-MM-DD'（本地时区） */
export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

/** 'YYYY-MM-DD' → 'YYYY-MM' */
export function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function currentMonthKey(): string {
  return monthKey(todayISO());
}

/** 'YYYY-MM' 的下个月 1 号，用于 [本月1号, 下月1号) 的范围查询 */
export function nextMonthStart(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${pad2(m + 1)}-01`;
}

/** 'YYYY-MM' → '2026年10月' */
export function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-');
  return `${y}年${Number(m)}月`;
}

/** 月份位移：('2026-01', -1) → '2025-12'；('2026-12', 1) → '2027-01' */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  const year = Math.floor(total / 12);
  const monthIndex = ((total % 12) + 12) % 12;
  return `${year}-${pad2(monthIndex + 1)}`;
}

/** 月份比较：a 早于 b 返回负数，相等 0，晚于正数（'YYYY-MM' 可直接字符串比大小） */
export function compareMonth(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** 是否是当前月 */
export function isCurrentMonth(month: string): boolean {
  return month === currentMonthKey();
}

/** '2026-10-28' → '10月28日 周三'，今天/昨天特殊处理 */
export function formatDateLabel(isoDate: string): string {
  const date = parseISODate(isoDate);
  if (!date) return isoDate;

  const today = todayISO();
  if (isoDate === today) return '今天';
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (isoDate === toISODate(yesterday)) return '昨天';

  return `${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAYS[date.getDay()]}`;
}

/** '2026-10-28' → '2026年10月28日 周三'（表单回显用） */
export function formatFullDate(isoDate: string): string {
  const date = parseISODate(isoDate);
  if (!date) return isoDate;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAYS[date.getDay()]}`;
}
