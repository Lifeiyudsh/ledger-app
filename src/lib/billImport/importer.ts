import { File } from 'expo-file-system';
import JSZip from 'jszip';
import { getDb } from '../../db';
import { existingFingerprints, markImported } from '../../db/imports';
import { createTransaction } from '../../db/transactions';
import { parseCsv } from './csv';
import { decodeBillFile } from './decode';
import { parseBillRows, type BillSource, type ParsedBill } from './parsers';

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
  message?: string;
}

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

async function readBytes(uri: string): Promise<Uint8Array> {
  const buffer = await new File(uri).arrayBuffer();
  return new Uint8Array(buffer);
}

function isZip(bytes: Uint8Array): boolean {
  return ZIP_MAGIC.every((value, index) => bytes[index] === value);
}

/** 取出所有 CSV 候选（zip 里可能有说明文件，按大小倒序） */
async function extractCsvCandidates(
  bytes: Uint8Array,
  fileName: string,
): Promise<Array<{ name: string; text: string }>> {
  if (isZip(bytes)) {
    const zip = await JSZip.loadAsync(bytes);
    const entries = Object.values(zip.files)
      .filter((entry) => !entry.dir && /\.csv$/i.test(entry.name))
      .sort((a, b) => a.name.localeCompare(b.name));

    const candidates: Array<{ name: string; text: string }> = [];
    for (const entry of entries) {
      const data = await entry.async('uint8array');
      candidates.push({ name: entry.name, text: decodeBillFile(data) });
    }
    // 明细文件通常更大，先试大的
    candidates.sort((a, b) => b.text.length - a.text.length);
    return candidates;
  }

  return [{ name: fileName, text: decodeBillFile(bytes) }];
}

export async function previewBillFile(uri: string, fileName: string): Promise<ImportPreview> {
  const bytes = await readBytes(uri);
  if (bytes.length === 0) {
    return { source: null, records: [], duplicates: 0, skipped: 0, message: '文件是空的' };
  }

  const candidates = await extractCsvCandidates(bytes, fileName);
  if (candidates.length === 0) {
    return {
      source: null,
      records: [],
      duplicates: 0,
      skipped: 0,
      message: '压缩包里没找到 CSV，请确认是账单导出文件',
    };
  }

  let totalSkipped = 0;
  for (const candidate of candidates) {
    const outcome = parseBillRows(parseCsv(candidate.text));
    if (!outcome.source) {
      totalSkipped += outcome.skipped;
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

    return {
      source: outcome.source,
      records: fresh,
      duplicates: unique.length - fresh.length,
      skipped: totalSkipped + outcome.skipped,
    };
  }

  return {
    source: null,
    records: [],
    duplicates: 0,
    skipped: totalSkipped,
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
