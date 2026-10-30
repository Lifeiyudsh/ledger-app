/**
 * 统计页的纯计算函数（可单测）。
 * 原则：中间计算全程用整数「分」，只在交给图表组件时才除以 100 变「元」。
 */

/** 分 → 图表用的元（唯一一处允许出现小数的转换） */
export function centsToYuanValue(cents: number): number {
  return Math.round(cents) / 100;
}

/** 占比，保留 1 位小数（用整数运算避免浮点漂移）：30/70 → 42.9 */
export function toPercentValue(partCents: number, totalCents: number): number {
  if (totalCents <= 0) return 0;
  return Math.round((partCents * 1000) / totalCents) / 10;
}

/** 占比展示文案：42.9% */
export function formatPercent(partCents: number, totalCents: number): string {
  return `${toPercentValue(partCents, totalCents).toFixed(1)}%`;
}
