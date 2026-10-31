import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import { DB_NAME, MIGRATIONS } from './schema';

let db: SQLiteDatabase | null = null;
let migrated = false;

function migrate(database: SQLiteDatabase): void {
  database.execSync('PRAGMA journal_mode = WAL;');
  const row = database.getFirstSync<{ user_version: number }>('PRAGMA user_version;');
  const current = row?.user_version ?? 0;

  for (let version = current; version < MIGRATIONS.length; version++) {
    database.withTransactionSync(() => {
      database.execSync(MIGRATIONS[version]);
      // user_version 不支持参数绑定，此处版本号来自本地常量，无注入风险
      database.execSync(`PRAGMA user_version = ${version + 1};`);
    });
  }
}

/** 获取数据库单例（首次调用时建表 / 升级） */
export function getDb(): SQLiteDatabase {
  if (!db) {
    db = openDatabaseSync(DB_NAME);
  }
  if (!migrated) {
    migrate(db);
    migrated = true;
  }
  return db;
}

/** App 启动时显式初始化，便于把建表开销前置到冷启动阶段 */
export function initDb(): void {
  getDb();
}
