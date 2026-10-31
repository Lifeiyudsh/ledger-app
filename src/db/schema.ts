/**
 * 数据库结构定义与迁移脚本。
 *
 * 设计要点：
 * 1. 金额一律以「分」为单位的正整数存储（amount_cents），收支方向用 direction 单独表达，
 *    不靠正负号，避免导出/汇总时被符号绕晕。
 * 2. 日期存 'YYYY-MM-DD' 文本，字典序 == 时间序，直接用于 ORDER BY。
 * 3. 迁移用 PRAGMA user_version 做版本号，新增结构只追加不修改历史项。
 */

export const DB_NAME = 'ledger2.db';

/** 每次结构变更追加一条 SQL，索引即版本号（v1 = MIGRATIONS[0]） */
export const MIGRATIONS: readonly string[] = [
  // ---------- v1 ----------
  `
  CREATE TABLE IF NOT EXISTS transactions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    -- 收支方向：expense 支出 / income 收入
    direction    TEXT    NOT NULL DEFAULT 'expense'
                 CHECK (direction IN ('expense', 'income')),
    -- 金额：正整数「分」。12.50 元存 1250。
    -- CAST(amount_cents AS INTEGER) = amount_cents 用于拒绝 12.5 这类带小数的写入，
    -- 同时容忍驱动把 1250 以 REAL 类型绑定（不会误杀）。
    amount_cents INTEGER NOT NULL
                 CHECK (amount_cents > 0 AND CAST(amount_cents AS INTEGER) = amount_cents),
    -- 分类：存稳定 key（如 'food'），展示文案在 src/constants/categories.ts
    category     TEXT    NOT NULL CHECK (length(trim(category)) BETWEEN 1 AND 32),
    note         TEXT             CHECK (note IS NULL OR length(note) <= 500),
    -- 记账日期（本地日期，不含时区），格式强校验 YYYY-MM-DD
    date         TEXT    NOT NULL
                 CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at   TEXT
  );

  -- 列表页：按日期倒序，同日按录入顺序倒序；同时服务按月汇总的范围扫描
  CREATE INDEX IF NOT EXISTS idx_transactions_date
    ON transactions (date DESC, id DESC);
  `,
];
