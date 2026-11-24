import { File } from 'expo-file-system';
import JSZip from 'jszip';
import { getDb } from '../../db';
import { existingFingerprints, markImported } from '../../db/imports';
import { createTransaction } from '../../db/transactions';
import { parseCsv } from './csv';
import { decodeBillFile } from './decode';
import { parseBillRows, type BillSource, type ParsedBill, type SkipReasons } from './parsers';
import { isXlsxEntries, readXlsxRows, readXlsxSheets } from './xlsx';

/**
 * 账单文件 → 待导入记录。
 *
 * 支付宝/微信导出的都是 zip（里面一个 CSV），也支持直接选 CSV。
 * 流程：读字节 → 解压 → 解码(UTF-8/GBK) → CSV 解析 → 识别格式 → 指纹去重。
 */

export interface ImportPreview {
  source: BillSource | null;
  /** 已去重后、可以入库的记录 */
  records: ParsedBill[];
  /** 库里已有、本次跳过的条数 */
  duplicates: number;
  /** 文件里被规则跳过的条数（不计收支、交易关闭等） */
  skipped: number;
  /** 跳过原因细分，方便定位「为什么一条都没进来」 */
  reasons: SkipReasons;
  message?: string;
}

const EMPTY_REASONS: SkipReasons = { status: 0, notCounted: 0, amount: 0, date: 0 };

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

async function readBytes(uri: string): Promise<Uint8Array> {
  const buffer = await new File(uri).arrayBuffer();
  return new Uint8Array(buffer);
}

function isZip(bytes: Uint8Array): boolean {
  return ZIP_MAGIC.every((value, index) => bytes[index] === value);
}

/**
 * 取出所有可解析的表格：
 * - zip 里可能是 csv（微信旧版）也可能是 xlsx（夸克/浏览器下载会改名）
 * - 直接选 xlsx 时，xlsx 本身也是 zip，同样走这一条
 * - 直接选 csv 时按文本解码
 */
async function extractTables(
  bytes: Uint8Array,
  fileName: string,
): Promise<Array<{ name: string; rows: string[][] }>> {
  if (!isZip(bytes)) {
    return [{ name: fileName, rows: parseCsv(decodeBillFile(bytes)) }];
  }

  const zip = await JSZip.loadAsync(bytes);

  // 情况一：这个 zip 本身就是一个 xlsx（微信/夸克下载的常见形态）
  if (isXlsxEntries(Object.keys(zip.files))) {
    try {
      // 全部工作表都当成候选，上层会挑能识别出货表格式的那个
      const sheets = await readXlsxSheets(bytes);
      const usable = sheets.filter((sheet) => sheet.rows.length > 0);
      return usable.length > 0 ? usable : [{ name: fileName, rows: await readXlsxRows(bytes) }];
    } catch (error) {
      console.warn('[billImport] xlsx 解析失败', error);
      return [];
    }
  }

  // 情况二：压缩包里装着 csv / xlsx（支付宝、微信导出的账单包）
  const entries = Object.values(zip.files).filter(
    (entry) => !entry.dir && /\.(csv|xlsx|xls)$/i.test(entry.name),
  );

  const tables: Array<{ name: string; rows: string[][] }> = [];

  for (const entry of entries) {
    try {
      if (/\.xlsx$/i.test(entry.name)) {
        tables.push({ name: entry.name, rows: await readXlsxRows(await entry.async('uint8array')) });
      } else if (/\.csv$/i.test(entry.name)) {
        const data = await entry.async('uint8array');
        tables.push({ name: entry.name, rows: parseCsv(decodeBillFile(data)) });
      }
      // .xls（老二进制格式）跳过
    } catch (error) {
      console.warn('[billImport] 解析失败', entry.name, error);
    }
  }

  // 明细表通常行数最多，先试大的
  tables.sort((a, b) => b.rows.length - a.rows.length);
  return tables;
}

export async function previewBillFile(uri: string, fileName: string): Promise<ImportPreview> {
  const bytes = await readBytes(uri);
  if (bytes.length === 0) {
    return {
      source: null,
      records: [],
      duplicates: 0,
      skipped: 0,
      reasons: EMPTY_REASONS,
      message: '文件是空的',
    };
  }

  const candidates = await extractTables(bytes, fileName);
  if (candidates.length === 0) {
    return {
      source: null,
      records: [],
      duplicates: 0,
      skipped: 0,
      reasons: EMPTY_REASONS,
      message:
        '没从这个文件里读到表格。\n\n如果它是压缩包，请在文件管理器里解压后选里面的 .csv 或 .xlsx；如果它本身就是 Excel 文件，可能是加密或损坏的版本。',
    };
  }

  let totalSkipped = 0;
  const mergedReasons: SkipReasons = { ...EMPTY_REASONS };

  const mergeReasons = (reasons: SkipReasons) => {
    mergedReasons.status += reasons.status;
    mergedReasons.notCounted += reasons.notCounted;
    mergedReasons.amount += reasons.amount;
    mergedReasons.date += reasons.date;
  };

  for (const candidate of candidates) {
    const outcome = parseBillRows(candidate.rows);
    if (!outcome.source) {
      totalSkipped += outcome.skipped;
      mergeReasons(outcome.reasons);
      continue;
    }

    // 同一份账单里可能出现重复行，先按指纹自去重
    const seen = new Set<string>();
    const unique = outcome.records.filter((record) => {
      if (seen.has(record.fingerprint)) return false;
      seen.add(record.fingerprint);
      return true;
    });

    const existing = existingFingerprints(unique.map((record) => record.fingerprint));
    const fresh = unique.filter((record) => !existing.has(record.fingerprint));

    mergeReasons(outcome.reasons);

    return {
      source: outcome.source,
      records: fresh,
      duplicates: unique.length - fresh.length,
      skipped: totalSkipped + outcome.skipped,
      reasons: mergedReasons,
    };
  }

  return {
    source: null,
    records: [],
    duplicates: 0,
    skipped: totalSkipped,
    reasons: mergedReasons,
    message: '没识别出支付宝或微信的账单格式',
  };
}

function buildNote(record: ParsedBill): string {
  const parts = [record.counterparty, record.description].filter((part) => part.length > 0);
  const body = parts.join(' · ') || '账单导入';
  return `导入 · ${body}`.slice(0, 100);
}

/** 确认导入：一个事务里写完交易 + 指纹，任一失败整体回滚 */
export function commitImport(preview: ImportPreview): { inserted: number } {
  if (preview.records.length === 0) return { inserted: 0 };

  let inserted = 0;
  getDb().withTransactionSync(() => {
    for (const record of preview.records) {
      createTransaction({
        direction: record.direction,
        amountCents: record.amountCents,
        category: record.category,
        note: buildNote(record),
        date: record.date,
      });
      inserted += 1;
    }

    markImported(
      preview.records.map((record) => ({ fingerprint: record.fingerprint, source: record.source })),
    );
  });

  return { inserted };
}
