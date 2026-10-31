import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * 每月预算的本地存储。
 * - key 形如 `budget_2026_10`，一个月一条，互不影响；
 * - value 存「分」的整数字符串（如 300000），绝不写浮点。
 */

const KEY_PREFIX = 'budget_';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function storageKey(month: string): string {
  return `${KEY_PREFIX}${month.replace('-', '_')}`;
}

export function isValidMonthKey(month: string): boolean {
  return MONTH_RE.test(month);
}

/** 读某月预算（分）；没设置或数据损坏都返回 null */
export async function getBudgetCents(month: string): Promise<number | null> {
  if (!isValidMonthKey(month)) return null;
  try {
    const raw = await AsyncStorage.getItem(storageKey(month));
    if (raw === null) return null;
    const cents = Number(raw);
    return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
  } catch {
    return null;
  }
}

/** 写某月预算（分）。调用方必须传正整数 */
export async function setBudgetCents(month: string, cents: number): Promise<void> {
  if (!isValidMonthKey(month)) {
    throw new Error(`月份格式不合法：${month}`);
  }
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new Error('预算必须是正整数（分）');
  }
  await AsyncStorage.setItem(storageKey(month), String(cents));
}

/** 清除某月预算 */
export async function clearBudgetCents(month: string): Promise<void> {
  if (!isValidMonthKey(month)) return;
  await AsyncStorage.removeItem(storageKey(month));
}
