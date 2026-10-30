/**
 * 预算判定的纯计算（不碰存储，可单测）。
 * 全程整数「分」，阈值判断也用整数乘法，避免 0.8 这类浮点比较。
 */

export type BudgetStatus =
  | { level: 'none' }
  | { level: 'safe'; remainingCents: number }
  | { level: 'warning'; remainingCents: number }
  | { level: 'over'; overCents: number };

/** 80% 预警线 */
export const WARNING_THRESHOLD_PERCENT = 80;

/**
 * 根据「已支出」和「预算」判定提示级别：
 * - 未设预算（null / <=0）→ none，不显示
 * - 支出 >= 预算 → over
 * - 支出 >= 预算的 80% → warning
 * - 其余 → safe
 */
export function evaluateBudget(spentCents: number, budgetCents: number | null | undefined): BudgetStatus {
  if (budgetCents === null || budgetCents === undefined || budgetCents <= 0) {
    return { level: 'none' };
  }

  const spent = Math.max(0, Math.trunc(spentCents));

  if (spent >= budgetCents) {
    return { level: 'over', overCents: spent - budgetCents };
  }

  const remainingCents = budgetCents - spent;
  // spent / budget >= 80%  ⇔  spent * 100 >= budget * 80，纯整数比较
  if (spent * 100 >= budgetCents * WARNING_THRESHOLD_PERCENT) {
    return { level: 'warning', remainingCents };
  }

  return { level: 'safe', remainingCents };
}

/** 当月剩余可用额度（负数表示超支），用于「今日可花」之类的扩展 */
export function remainingCents(spentCents: number, budgetCents: number | null | undefined): number | null {
  if (budgetCents === null || budgetCents === undefined || budgetCents <= 0) return null;
  return budgetCents - Math.max(0, Math.trunc(spentCents));
}
