import type { CategoryKey } from '../constants/categories';

/** 收支方向 */
export type Direction = 'expense' | 'income';

/** 数据库原始行（下划线命名） */
export interface TransactionRow {
  id: number;
  direction: string;
  amount_cents: number;
  category: string;
  note: string | null;
  date: string;
  created_at: string;
  updated_at: string | null;
}

/** 应用内实体（驼峰命名） */
export interface Transaction {
  id: number;
  direction: Direction;
  /** 金额，单位「分」的正整数，永远不要当浮点用 */
  amountCents: number;
  category: CategoryKey;
  note: string | null;
  /** 'YYYY-MM-DD' */
  date: string;
  createdAt: string;
  updatedAt: string | null;
}

export interface NewTransaction {
  direction: Direction;
  amountCents: number;
  category: CategoryKey;
  note?: string | null;
  date: string;
}

/** 月度汇总（金额单位：分） */
export interface MonthSummary {
  /** 'YYYY-MM' */
  month: string;
  expenseCents: number;
  incomeCents: number;
  /** 结余 = 收入 - 支出，可能为负 */
  netCents: number;
  count: number;
}

/** 从备份文件导入时的一条记录（可带原始创建时间） */
export interface TransactionImport {
  direction: Direction;
  amountCents: number;
  category: CategoryKey;
  note: string | null;
  date: string;
  createdAt?: string | null;
}
