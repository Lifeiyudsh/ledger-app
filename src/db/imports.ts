import { getDb } from './index';

/** 账单导入指纹：防止同一份账单被重复导入 */

export function existingFingerprints(fingerprints: readonly string[]): Set<string> {
  const result = new Set<string>();
  if (fingerprints.length === 0) return result;

  const db = getDb();
  const chunkSize = 300; // SQLite 变量上限 999，留足余量

  for (let i = 0; i < fingerprints.length; i += chunkSize) {
    const chunk = fingerprints.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = db.getAllSync<{ fingerprint: string }>(
      `SELECT fingerprint FROM imported_bills WHERE fingerprint IN (${placeholders});`,
      chunk as unknown as string[],
    );
    for (const row of rows) result.add(row.fingerprint);
  }

  return result;
}

export function markImported(entries: ReadonlyArray<{ fingerprint: string; source: string }>): void {
  if (entries.length === 0) return;
  const db = getDb();
  const statement = db.prepareSync(
    `INSERT OR IGNORE INTO imported_bills (fingerprint, source) VALUES (?, ?);`,
  );

  try {
    for (const entry of entries) {
      statement.executeSync([entry.fingerprint, entry.source]);
    }
  } finally {
    statement.finalizeSync();
  }
}

export function countImportedBills(): number {
  const row = getDb().getFirstSync<{ total: number }>(
    `SELECT COUNT(*) AS total FROM imported_bills;`,
  );
  return row?.total ?? 0;
}

/** 清空导入记录（用户主动重置时才用，清空后可重新导入同一份账单） */
export function clearImportedBills(): void {
  getDb().execSync(`DELETE FROM imported_bills;`);
}
