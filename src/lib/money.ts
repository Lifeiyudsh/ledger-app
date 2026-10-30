/**
 * 金额换算工具 —— 全局唯一入口。
 *
 * 铁律：内部一律用「分」(整数 number)，只在输入解析和展示时出现「元」。
 * 解析不用 parseFloat(x) * 100（19.99 * 100 = 1998.9999999999998），
 * 而是按字符串拆整数位 + 小数位，纯整数运算。
 */

/** 单笔上限：9,999,999.99 元 */
export const MAX_AMOUNT_CENTS = 999_999_999;

export type ParseAmountResult =
  | { ok: true; cents: number }
  | { ok: false; error: string };

/** 归一化用户输入：去空格/货币符号/千分位，全角转半角，补齐前导 0 */
function normalizeAmountInput(raw: string): string {
  let s = raw
    .replace(/[\s\u3000]/g, '')
    .replace(/[¥￥]/g, '')
    .replace(/元$/, '')
    .replace(/．/g, '.')
    .replace(/，/g, ',')
    .replace(/,/g, '');
  if (s.startsWith('.')) s = `0${s}`;
  if (s.endsWith('.')) s = s.slice(0, -1);
  return s;
}

/** 用户输入（元，字符串）→ 分。失败返回可直接展示的错误文案 */
export function parseAmountToCents(raw: string): ParseAmountResult {
  const s = normalizeAmountInput(raw ?? '');
  if (!s) return { ok: false, error: '请输入金额' };
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) {
    return { ok: false, error: '金额格式不对，最多 7 位整数 + 2 位小数' };
  }

  const [intPart, decPart = ''] = s.split('.');
  const cents = Number(intPart) * 100 + Number(decPart.padEnd(2, '0'));

  if (!Number.isSafeInteger(cents)) return { ok: false, error: '金额超出范围' };
  if (cents <= 0) return { ok: false, error: '金额必须大于 0' };
  if (cents > MAX_AMOUNT_CENTS) return { ok: false, error: '单笔金额不能超过 9,999,999.99 元' };
  return { ok: true, cents };
}

/** 分 → 两位小数字符串（无千分位），用于 CSV / 输入框回填：1250 → "12.50" */
export function centsToFixed(cents: number): string {
  const abs = Math.abs(Math.trunc(cents));
  const sign = cents < 0 ? '-' : '';
  const yuan = Math.floor(abs / 100);
  const fen = abs % 100;
  return `${sign}${yuan}.${String(fen).padStart(2, '0')}`;
}

/** 分 → 带千分位的展示文案：123456 → "¥1,234.56" */
export function formatYuan(cents: number, withSymbol = true): string {
  const fixed = centsToFixed(cents);
  const negative = fixed.startsWith('-');
  const body = negative ? fixed.slice(1) : fixed;
  const [yuan, fen] = body.split('.');
  const grouped = yuan.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${withSymbol ? '¥' : ''}${grouped}.${fen}`;
}

/** 汇总求和（整数相加，无精度损失） */
export function sumCents(values: readonly number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}
