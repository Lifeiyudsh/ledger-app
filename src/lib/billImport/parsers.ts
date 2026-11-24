import type { CategoryKey } from '../../constants/categories';
import { guessCategory } from '../categoryGuess';

/**
 * 支付宝 / 微信 账单 CSV 解析。
 *
 * 两个平台的格式差异：
 * - 支付宝：GBK 编码，表头前有若干说明行，表头含「交易分类」「交易订单号」，金额无货币符号
 * - 微信：UTF-8(BOM)，表头前有 8~10 行汇总，表头含「商品」「交易单号」，金额带 ¥
 *
 * 解析策略：先按「交易时间 + 收/支」定位表头行，再按列名取索引（不依赖固定列序）。
 */

export type BillSource = 'alipay' | 'wechat';

export interface ParsedBill {
  source: BillSource;
  date: string;
  direction: 'expense' | 'income';
  amountCents: number;
  category: CategoryKey;
  counterparty: string;
  description: string;
  orderId: string;
  status: string;
  /** 去重指纹 */
  fingerprint: string;
}

export interface ParseOutcome {
  source: BillSource | null;
  records: ParsedBill[];
  /** 跳过条数（不计收支 / 交易关闭 / 金额异常） */
  skipped: number;
  /** 给用户看的提示，如「未识别的文件格式」 */
  message?: string;
}

const ALIPAY_CATEGORY: Record<string, CategoryKey> = {
  餐饮美食: 'food',
  交通出行: 'transport',
  日用百货: 'daily',
  服饰装扮: 'shopping',
  数码电器: 'shopping',
  美容美发: 'daily',
  文化休闲: 'entertainment',
  医疗健康: 'medical',
  住房物业: 'housing',
  充值缴费: 'housing',
  转账红包: 'other',
  投资理财: 'investment',
  保险: 'other',
  信用借还: 'other',
  收入: 'other',
  退款: 'refund',
  其他: 'other',
};

const WECHAT_CATEGORY: Record<string, CategoryKey> = {
  退款: 'refund',
  微信红包: 'other',
  转账: 'other',
  群收款: 'other',
  零钱提现: 'other',
  信用卡还款: 'other',
  商户消费: 'other',
  扫二维码付款: 'other',
};

function findHeaderIndex(rows: string[][]): number {
  const limit = Math.min(rows.length, 60);
  for (let i = 0; i < limit; i += 1) {
    const row = rows[i].map((cell) => cell.trim());
    const joined = row.join('|');
    if (joined.includes('交易时间') && (joined.includes('交易对方') || joined.includes('交易分类'))) {
      return i;
    }
  }
  return -1;
}

function columnIndex(header: string[], names: readonly string[]): number {
  for (const name of names) {
    const exact = header.findIndex((cell) => cell === name);
    if (exact >= 0) return exact;
  }
  for (const name of names) {
    const fuzzy = header.findIndex((cell) => cell.includes(name));
    if (fuzzy >= 0) return fuzzy;
  }
  return -1;
}

function detectSource(header: string[]): BillSource | null {
  const joined = header.join('|');
  if (joined.includes('交易分类') || joined.includes('交易订单号')) return 'alipay';
  if (joined.includes('交易类型') || joined.includes('交易单号') || joined.includes('当前状态')) {
    return 'wechat';
  }
  return null;
}

/** "¥1,234.50" / "-28.00" / "28.00元" → 分 */
function amountToCents(raw: string): number | null {
  const cleaned = raw.replace(/[¥￥,，\s元]/g, '').replace(/[（(].*?[）)]/g, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;

  const negative = cleaned.startsWith('-');
  const [intPart, decPart = ''] = cleaned.replace('-', '').split('.');
  const cents = Number(intPart) * 100 + Number(decPart.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents <= 0) return null;
  return negative ? -cents : cents;
}

/** "2026-10-01 12:00:00" → "2026-10-01" */
function extractDate(raw: string): string | null {
  const match = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(raw);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return date;
}

function emptyToDash(value: string): string {
  const trimmed = (value ?? '').trim();
  return trimmed === '/' || trimmed === '' ? '' : trimmed;
}

export function parseBillRows(rows: string[][]): ParseOutcome {
  const headerIndex = findHeaderIndex(rows);
  if (headerIndex < 0) {
    return { source: null, records: [], skipped: 0, message: '没找到表头（需要包含「交易时间」的行）' };
  }

  const header = rows[headerIndex].map((cell) => cell.trim());
  const source = detectSource(header);
  if (!source) {
    return { source: null, records: [], skipped: 0, message: '不是支付宝或微信的账单格式' };
  }

  const idx = {
    date: columnIndex(header, ['交易时间', '交易创建时间']),
    category: columnIndex(header, ['交易分类', '交易类型']),
    counterparty: columnIndex(header, ['交易对方', '对方']),
    description: columnIndex(header, ['商品说明', '商品']),
    direction: columnIndex(header, ['收/支', '收支类型']),
    amount: columnIndex(header, ['金额(元)', '金额']),
    status: columnIndex(header, ['当前状态', '交易状态']),
    orderId: columnIndex(header, ['交易单号', '交易订单号']),
    note: columnIndex(header, ['备注']),
  };

  if (idx.date < 0 || idx.amount < 0) {
    return { source, records: [], skipped: 0, message: '表头缺少「交易时间」或「金额」列' };
  }

  const get = (row: string[], index: number): string => (index >= 0 ? (row[index] ?? '').trim() : '');

  const records: ParsedBill[] = [];
  let skipped = 0;

  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];
    const dateText = get(row, idx.date);
    const amountText = get(row, idx.amount);
    if (!dateText && !amountText) continue;

    const status = get(row, idx.status);
    if (/关闭|失败|已撤销|交易取消/.test(status)) {
      skipped += 1;
      continue;
    }

    const directionText = get(row, idx.direction);
    if (directionText.includes('不计')) {
      skipped += 1;
      continue;
    }

    const rawAmount = amountToCents(amountText);
    if (rawAmount === null) {
      skipped += 1;
      continue;
    }

    const date = extractDate(dateText);
    if (!date) {
      skipped += 1;
      continue;
    }

    let direction: 'expense' | 'income';
    if (directionText.includes('收入')) direction = 'income';
    else if (directionText.includes('支出')) direction = 'expense';
    else direction = rawAmount < 0 ? 'expense' : 'income';

    const amountCents = Math.abs(rawAmount);
    const counterparty = emptyToDash(get(row, idx.counterparty));
    const description = emptyToDash(get(row, idx.description)) || emptyToDash(get(row, idx.note));
    const rawCategory = get(row, idx.category);
    const orderId = emptyToDash(get(row, idx.orderId));

    const category = resolveCategory({
      source,
      rawCategory,
      counterparty,
      description,
      direction,
    });

    const fingerprint = orderId.length >= 6
      ? `${source}|${orderId}`
      : `${source}|${date}|${amountCents}|${direction}|${counterparty}|${description}`;

    records.push({
      source,
      date,
      direction,
      amountCents,
      category,
      counterparty,
      description,
      orderId,
      status,
      fingerprint,
    });
  }

  return { source, records, skipped };
}

interface CategoryInput {
  source: BillSource;
  rawCategory: string;
  counterparty: string;
  description: string;
  direction: 'expense' | 'income';
}

function resolveCategory(input: CategoryInput): CategoryKey {
  const { source, rawCategory, counterparty, description, direction } = input;
  const table = source === 'alipay' ? ALIPAY_CATEGORY : WECHAT_CATEGORY;
  const mapped = table[rawCategory];

  // 平台分类明确（且不是「其他」）时优先采信
  if (mapped && mapped !== 'other') return mapped;

  const guessed = guessCategory(`${counterparty} ${description} ${rawCategory}`, direction);
  if (guessed !== 'other') return guessed;

  return mapped ?? 'other';
}
