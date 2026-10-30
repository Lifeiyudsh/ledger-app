import type { Direction } from '../types';

/** 分类项：key 存库，label/emoji 展示 */
export interface Category {
  key: CategoryKey;
  label: string;
  emoji: string;
}

/** 支出分类（9 个） */
export const EXPENSE_CATEGORIES = [
  { key: 'food', label: '餐饮', emoji: '🍜' },
  { key: 'transport', label: '交通', emoji: '🚌' },
  { key: 'shopping', label: '购物', emoji: '🛍️' },
  { key: 'housing', label: '居住', emoji: '🏠' },
  { key: 'daily', label: '日用', emoji: '🧴' },
  { key: 'entertainment', label: '娱乐', emoji: '🎬' },
  { key: 'medical', label: '医疗', emoji: '💊' },
  { key: 'study', label: '学习', emoji: '📚' },
  { key: 'other', label: '其他', emoji: '📦' },
] as const;

/** 收入分类（6 个） */
export const INCOME_CATEGORIES = [
  { key: 'salary', label: '工资', emoji: '💰' },
  { key: 'bonus', label: '奖金', emoji: '🎁' },
  { key: 'investment', label: '理财', emoji: '📈' },
  { key: 'parttime', label: '兼职', emoji: '💼' },
  { key: 'refund', label: '退款', emoji: '💸' },
  { key: 'other', label: '其他', emoji: '📦' },
] as const;

export type ExpenseCategoryKey = (typeof EXPENSE_CATEGORIES)[number]['key'];
export type IncomeCategoryKey = (typeof INCOME_CATEGORIES)[number]['key'];
/** 全部分类 key：类型层面就不允许写入两张表以外的值 */
export type CategoryKey = ExpenseCategoryKey | IncomeCategoryKey;

/** 方向 → 该方向可用的分类表 */
export const CATEGORIES_BY_DIRECTION: Record<Direction, readonly Category[]> = {
  expense: EXPENSE_CATEGORIES,
  income: INCOME_CATEGORIES,
};

export function getCategories(direction: Direction): readonly Category[] {
  return CATEGORIES_BY_DIRECTION[direction];
}

/** key 是否属于该方向的分类（切方向、写库前都用它兜底） */
export function isCategoryAllowed(
  direction: Direction,
  key: string | null | undefined,
): boolean {
  if (!key) return false;
  return getCategories(direction).some((category) => category.key === key);
}

/** 该方向的默认分类（新建表单的初始选中项） */
export function getDefaultCategory(direction: Direction): CategoryKey {
  return getCategories(direction)[0].key;
}

/** 合并查找表：'other' 两边都有，保留先出现的那个 */
const MAP = new Map<string, Category>();
for (const category of [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]) {
  if (!MAP.has(category.key)) MAP.set(category.key, category);
}

const FALLBACK: Category = { key: 'other', label: '其他', emoji: '📦' };

/** 数据库里的 key → 展示信息；未知 key 兜底为「其他」 */
export function getCategory(key: string): Category {
  return MAP.get(key) ?? FALLBACK;
}

export function getCategoryLabel(key: string): string {
  return getCategory(key).label;
}
