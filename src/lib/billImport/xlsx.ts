import JSZip from 'jszip';

/**
 * 最小 XLSX 读取器（不引第三方 xlsx 库）。
 *
 * xlsx 本质是 zip + 一堆 XML，账单文件结构极简，只需要两样：
 * - xl/sharedStrings.xml：所有字符串单元格的共享池
 * - xl/worksheets/sheetN.xml：行列数据
 *
 * 只处理账单会用到的单元格类型：s(共享字符串) / inlineStr / str / 数字。
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function unescapeXml(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}

/** 拼接 <si>/<is> 里所有 <t> 的内容（富文本会被拆成多个 <r><t>） */
function collectText(xml: string): string {
  let out = '';
  const pattern = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  let match = pattern.exec(xml);
  while (match) {
    out += match[1];
    match = pattern.exec(xml);
  }
  return unescapeXml(out);
}

function parseSharedStrings(xml: string): string[] {
  const list: string[] = [];
  const pattern = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g;
  let match = pattern.exec(xml);
  while (match) {
    list.push(collectText(match[1]));
    match = pattern.exec(xml);
  }
  return list;
}

function columnIndex(ref: string): number {
  const letters = /^([A-Z]+)/i.exec(ref);
  if (!letters) return -1;

  let value = 0;
  for (const ch of letters[1].toUpperCase()) {
    value = value * 26 + (ch.charCodeAt(0) - 64);
  }
  return value - 1;
}

function cellValue(attrs: string, body: string, shared: string[]): string {
  const type = /\bt="([^"]*)"/.exec(attrs)?.[1] ?? '';

  if (type === 'inlineStr') return collectText(body);

  const valueMatch = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(body);
  const raw = valueMatch ? unescapeXml(valueMatch[1]) : '';

  if (type === 's') {
    const index = Number.parseInt(raw, 10);
    return Number.isFinite(index) ? (shared[index] ?? '') : '';
  }

  return raw;
}

function parseSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  const rowPattern = /<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g;

  let rowMatch = rowPattern.exec(xml);
  while (rowMatch) {
    const body = rowMatch[1];
    const cells: string[] = [];

    const cellPattern = /<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch = cellPattern.exec(body);
    let fallbackIndex = 0;

    while (cellMatch) {
      const attrs = cellMatch[1] ?? '';
      const inner = cellMatch[2] ?? '';
      const ref = /\br="([A-Z]+\d+)"/i.exec(attrs)?.[1] ?? '';

      const index = ref ? columnIndex(ref) : fallbackIndex;
      if (index >= 0) {
        while (cells.length < index) cells.push('');
        cells[index] = cellValue(attrs, inner, shared);
        fallbackIndex = index + 1;
      } else {
        fallbackIndex += 1;
      }

      cellMatch = cellPattern.exec(body);
    }

    if (cells.some((cell) => cell.trim().length > 0)) rows.push(cells);
    rowMatch = rowPattern.exec(xml);
  }

  return rows;
}

/**
 * 判断一个 zip 的条目列表是不是「单个 xlsx 文件」。
 *
 * 关键：xlsx 本身就是 zip，里面装的是 xl/workbook.xml 这类 XML 部件，
 * 不会有 .csv / .xlsx 文件。之前按扩展名在 zip 里找表格，导致纯 xlsx 直接被判成空。
 */
export function isXlsxEntries(names: readonly string[]): boolean {
  if (names.includes('xl/workbook.xml')) return true;
  return names.some((name) => /^xl\/worksheets\/[^/]+\.xml$/i.test(name));
}

/**
 * 读取全部工作表。微信/支付宝导出偶尔把「说明」放在 sheet1、明细放在 sheet2，
 * 只读第一个 sheet 会拿到一堆说明文字，所以这里全读出来交给上层挑。
 */
export async function readXlsxSheets(
  bytes: Uint8Array,
): Promise<Array<{ name: string; rows: string[][] }>> {
  const zip = await JSZip.loadAsync(bytes);

  const sharedFile = zip.file('xl/sharedStrings.xml');
  const shared = sharedFile ? parseSharedStrings(await sharedFile.async('string')) : [];

  const sheetEntries = Object.values(zip.files)
    .filter((entry) => !entry.dir && /^xl\/worksheets\/[^/]+\.xml$/i.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (sheetEntries.length === 0) {
    throw new Error('xlsx 里没有工作表');
  }

  const sheets: Array<{ name: string; rows: string[][] }> = [];
  for (const entry of sheetEntries) {
    try {
      sheets.push({ name: entry.name, rows: parseSheet(await entry.async('string'), shared) });
    } catch (error) {
      console.warn('[xlsx] 工作表解析失败', entry.name, error);
    }
  }

  return sheets;
}

/** 读取 xlsx 的第一个工作表，返回二维字符串数组 */
export async function readXlsxRows(bytes: Uint8Array): Promise<string[][]> {
  const zip = await JSZip.loadAsync(bytes);

  const sharedFile = zip.file('xl/sharedStrings.xml');
  const shared = sharedFile ? parseSharedStrings(await sharedFile.async('string')) : [];

  const sheetFile =
    zip.file('xl/worksheets/sheet1.xml') ??
    Object.values(zip.files).find((entry) => !entry.dir && /^xl\/worksheets\/.*\.xml$/i.test(entry.name));

  if (!sheetFile) {
    throw new Error('xlsx 里没有工作表');
  }

  return parseSheet(await sheetFile.async('string'), shared);
}
