/**
 * 分类配色（饼图 / 图例用）。
 * 与 src/theme.ts 的整体色板协调：支出主色 #e5484d、主色 #2f6fed。
 * 只用于展示，不落库。
 */

import type { CategoryKey } from './categories';

/** 9 个支出分类 → 颜色 */
export const EXPENSE_CATEGORY_COLORS: Record<string, string> = {
  food: '#f97316',          // 餐饮 - 橙红
  transport: '#3b82f6',     // 交通 - 蓝
  shopping: '#ec4899',      // 购物 - 玫粉
  housing: '#8b5cf6',       // 居住 - 紫
  daily: '#14b8a6',         // 日用 - 青绿
  entertainment: '#f59e0b', // 娱乐 - 琥珀
  medical: '#e11d48',       // 医疗 - 洋红
  study: '#6366f1',         // 学习 - 靛蓝
  other: '#94a3b8',         // 其他 - 灰蓝
};

const FALLBACK_COLOR = '#94a3b8';

export function getCategoryColor(category: CategoryKey | string): string {
  return EXPENSE_CATEGORY_COLORS[category] ?? FALLBACK_COLOR;
}
