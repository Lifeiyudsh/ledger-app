import { getDb } from './index';
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  isCategoryAllowed,
  type CategoryKey,
} from '../constants/categories';
import { isValidISODate, nextMonthStart } from '../lib/date';
import type {
  Direction,
  MonthSummary,
  NewTransaction,
  Transaction,
  TransactionImport,
  TransactionRow,
} from '../types';

const COLUMNS = 'id, direction, amount_cents, category, note, date, created_at, updated_at';

function toEntity(row: TransactionRow): Transaction {
  return {
    id: row.id,
    direction: row.direction === 'income' ? 'income' : 'expense',
    amountCents: row.amount_cents,
    category: row.category as Transaction['category'],
    note: row.note,
    date: row.date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 写入前的统一校验：金额整数、日期合法、分类归属 */
function assertValidEntry(input: NewTransaction): void {
  if (!Number.isInteger(input.amountCents)) {
    throw new Error(`amountCents 必须是整数（分），收到：${input.amountCents}`);
  }
  if (input.amountCents <= 0) {
    throw new Error('金额必须大于 0');
  }
  if (!isValidISODate(input.date)) {
    throw new Error(`日期不合法：${input.date}`);
  }
  // 分类必须属于该收支方向：挡掉「收入 + 餐饮」这类跨方向脏数据
  if (!isCategoryAllowed(input.direction, input.category)) {
    const scope = input.direction === 'income' ? '收入' : '支出';
    throw new Error(`分类「${input.category}」不属于${scope}分类`);
  }
}

function normalizeNote(note: string | null | undefined): string | null {
  return note?.trim() ? note.trim() : null;
}

/** 新增一笔，返回新记录 id。参数全部走绑定，无字符串拼接 */
export function createTransaction(input: NewTransaction): number {
  assertValidEntry(input);

  const result = getDb().runSync(
    `INSERT INTO transactions (direction, amount_cents, category, note, date) VALUES (?, ?, ?, ?, ?);`,
    [input.direction, input.amountCents, input.category, normalizeNote(input.note), input.date],
  );
  return Number(result.lastInsertRowId);
}

/** 按 id 改一笔，返回是否命中记录 */
export function updateTransaction(id: number, input: NewTransaction): boolean {
  assertValidEntry(input);

  const result = getDb().runSync(
    `UPDATE transactions
        SET direction = ?, amount_cents = ?, category = ?, note = ?, date = ?,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ?;`,
    [
      input.direction,
      input.amountCents,
      input.category,
      normalizeNote(input.note),
      input.date,
      id,
    ],
  );
  return result.changes > 0;
}

/** 编辑页回填用 */
export function getTransactionById(id: number): Transaction | null {
  const row = getDb().getFirstSync<TransactionRow>(
    `SELECT ${COLUMNS} FROM transactions WHERE id = ?;`,
    [id],
  );
  return row ? toEntity(row) : null;
}

/** 'YYYY-MM' → [月初, 下月初) 半开区间，date 是文本但仍可走 idx_transactions_date */
function monthRange(month: string): { start: string; end: string } {
  return { start: `${month}-01`, end: nextMonthStart(month) };
}

/**
 * 按月取账单：过滤下推到 SQL，不捞全表。
 * 日期倒序，同日按写入顺序倒序。
 */
export function listTransactionsByMonth(
  month: string,
  options: { limit?: number; offset?: number } = {},
): Transaction[] {
  const { start, end } = monthRange(month);
  const limit = options.limit ?? 500;
  const offset = options.offset ?? 0;
  const rows = getDb().getAllSync<TransactionRow>(
    `SELECT ${COLUMNS}
       FROM transactions
      WHERE date >= ? AND date < ?
      ORDER BY date DESC, id DESC
      LIMIT ? OFFSET ?;`,
    [start, end, limit, offset],
  );
  return rows.map(toEntity);
}

/** 导出用：只取指定月份，按时间正序（CSV 阅读习惯） */
export function listTransactionsForExport(month: string): Transaction[] {
  const { start, end } = monthRange(month);
  const rows = getDb().getAllSync<TransactionRow>(
    `SELECT ${COLUMNS}
       FROM transactions
      WHERE date >= ? AND date < ?
      ORDER BY date ASC, id ASC;`,
    [start, end],
  );
  return rows.map(toEntity);
}

/**
 * 全库模糊搜索（不看月份）。
 *
 * 备注直接 LIKE；分类因为库里存英文 key，先在应用层把关键词映射成
 * 命中的 key 列表，再用参数化的 IN (...) 查询，不做任何字符串拼接。
 * LIKE 的 % _ \ 会被转义，避免用户输入 % 时全表命中。
 */
export function searchTransactions(
  keyword: string,
  options: { limit?: number } = {},
): Transaction[] {
  const trimmed = keyword.trim();
  if (!trimmed) return [];

  const pattern = `%${trimmed.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
  const limit = options.limit ?? 500;

  const matchedCategoryKeys = [
    ...new Set(
      [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]
        .filter((category) => category.label.includes(trimmed))
        .map((category) => category.key),
    ),
  ];

  const database = getDb();

  if (matchedCategoryKeys.length === 0) {
    const rows = database.getAllSync<TransactionRow>(
      `SELECT ${COLUMNS}
         FROM transactions
        WHERE note LIKE ? ESCAPE '\\'
        ORDER BY date DESC, id DESC
        LIMIT ?;`,
      [pattern, limit],
    );
    return rows.map(toEntity);
  }

  const placeholders = matchedCategoryKeys.map(() => '?').join(', ');
  const rows = database.getAllSync<TransactionRow>(
    `SELECT ${COLUMNS}
       FROM transactions
      WHERE note LIKE ? ESCAPE '\\' OR category IN (${placeholders})
      ORDER BY date DESC, id DESC
      LIMIT ?;`,
    [pattern, ...matchedCategoryKeys, limit],
  );
  return rows.map(toEntity);
}

/** 删除单笔，返回是否真的删掉了 */
export function deleteTransaction(id: number): boolean {
  const result = getDb().runSync('DELETE FROM transactions WHERE id = ?;', [id]);
  return result.changes > 0;
}

// ---------------- 备份 / 恢复 ----------------

/** 全量记录数 */
export function countAllTransactions(): number {
  const row = getDb().getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM transactions;');
  return row?.n ?? 0;
}

/** 备份用：全量拉取（含 created_at / updated_at） */
export function listAllTransactionsForBackup(): Transaction[] {
  const rows = getDb().getAllSync<TransactionRow>(
    `SELECT ${COLUMNS} FROM transactions ORDER BY date ASC, id ASC;`,
  );
  return rows.map(toEntity);
}

/** 单条插入，createdAt 有值就保留原始时间，否则用当前时间 */
function insertImported(database: ReturnType<typeof getDb>, item: TransactionImport): void {
  database.runSync(
    `INSERT INTO transactions (direction, amount_cents, category, note, date, created_at)
     VALUES (?, ?, ?, ?, ?, COALESCE(?, strftime('%Y-%m-%dT%H:%M:%fZ','now')));`,
    [
      item.direction,
      item.amountCents,
      item.category,
      normalizeNote(item.note),
      item.date,
      item.createdAt ?? null,
    ],
  );
}

/**
 * 覆盖恢复：清空现有数据后整批导入，全部在同一个事务里。
 * 中途任一条不合法就整体回滚，不会出现「清空了但没导进去」。
 */
export function replaceAllTransactions(items: readonly TransactionImport[]): number {
  for (const item of items) assertValidEntry(item);

  const database = getDb();
  database.withTransactionSync(() => {
    database.runSync('DELETE FROM transactions;');
    for (const item of items) insertImported(database, item);
  });
  return items.length;
}

/** 单个分类的支出聚合（金额仍是整数「分」） */
export interface CategoryExpenseBucket {
  category: CategoryKey;
  totalCents: number;
  count: number;
}

/**
 * 按月统计支出：SQL 层按分类 GROUP BY 累加，金额按「分」整数返回。
 * 不改动任何现有查询函数，只做新增。
 */
export function listExpenseByCategory(month: string): CategoryExpenseBucket[] {
  const { start, end } = monthRange(month);
  const rows = getDb().getAllSync<{ category: string; total: number; n: number }>(
    `SELECT category, SUM(amount_cents) AS total, COUNT(*) AS n
       FROM transactions
      WHERE direction = 'expense' AND date >= ? AND date < ?
      GROUP BY category
      ORDER BY total DESC;`,
    [start, end],
  );
  return rows.map((row) => ({
    category: row.category as CategoryKey,
    totalCents: row.total,
    count: row.n,
  }));
}

/** 按月汇总：一次 GROUP BY 拿到支出/收入，同样只在 SQL 层过滤该月 */
export function getMonthSummary(month: string): MonthSummary {
  const { start, end } = monthRange(month);
  const rows = getDb().getAllSync<{ direction: Direction; total: number; n: number }>(
    `SELECT direction, SUM(amount_cents) AS total, COUNT(*) AS n
       FROM transactions
      WHERE date >= ? AND date < ?
      GROUP BY direction;`,
    [start, end],
  );

  let expenseCents = 0;
  let incomeCents = 0;
  let count = 0;
  for (const row of rows) {
    count += row.n;
    if (row.direction === 'income') incomeCents += row.total;
    else expenseCents += row.total;
  }

  return {
    month,
    expenseCents,
    incomeCents,
    netCents: incomeCents - expenseCents,
    count,
  };
}
