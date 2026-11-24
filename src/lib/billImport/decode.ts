import { GBK_TABLE } from './gbkTable';

/**
 * 账单文件解码。
 *
 * 支付宝导出的 CSV 是 GBK，微信是 UTF-8（带 BOM）。
 * Hermes 的 TextDecoder 只保证 UTF-8，所以这里自带一套解码：
 * 先严格校验 UTF-8，失败再按 GBK 双字节查表。
 */

function decodeUtf8(bytes: Uint8Array, start: number): string | null {
  const out: string[] = [];
  let i = start;

  while (i < bytes.length) {
    const b0 = bytes[i];

    if (b0 < 0x80) {
      out.push(String.fromCharCode(b0));
      i += 1;
      continue;
    }

    let need = 0;
    let code = 0;

    if (b0 >= 0xc2 && b0 <= 0xdf) {
      need = 1;
      code = b0 & 0x1f;
    } else if (b0 >= 0xe0 && b0 <= 0xef) {
      need = 2;
      code = b0 & 0x0f;
    } else if (b0 >= 0xf0 && b0 <= 0xf4) {
      need = 3;
      code = b0 & 0x07;
    } else {
      return null;
    }

    if (i + need >= bytes.length) return null;

    for (let k = 1; k <= need; k += 1) {
      const bk = bytes[i + k];
      if ((bk & 0xc0) !== 0x80) return null;
      code = (code << 6) | (bk & 0x3f);
    }

    // 拒绝过长编码与代理区
    if (need === 2 && code < 0x800) return null;
    if (need === 3 && code < 0x10000) return null;
    if (code >= 0xd800 && code <= 0xdfff) return null;
    if (code > 0x10ffff) return null;

    out.push(String.fromCodePoint(code));
    i += need + 1;

    // 大文件时避免数组无限增长
    if (out.length > 20000) {
      const merged = out.join('');
      out.length = 0;
      out.push(merged);
    }
  }

  return out.join('');
}

function decodeGbk(bytes: Uint8Array): string {
  const out: string[] = [];
  let i = 0;

  while (i < bytes.length) {
    const b0 = bytes[i];

    if (b0 < 0x80) {
      out.push(String.fromCharCode(b0));
      i += 1;
      continue;
    }

    if (i + 1 < bytes.length) {
      const b1 = bytes[i + 1];
      if (b1 >= 0x40 && b1 <= 0xfe) {
        const index = (b0 - 0x81) * 191 + (b1 - 0x40);
        const ch = index >= 0 && index < GBK_TABLE.length ? GBK_TABLE[index] : '\uFFFD';
        out.push(ch);
        i += 2;
        continue;
      }
    }

    out.push('\uFFFD');
    i += 1;
  }

  return out.join('');
}

/** 二进制 → 文本（自动识别 BOM / UTF-8 / GBK） */
export function decodeBillFile(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return decodeUtf8(bytes, 3) ?? decodeGbk(bytes);
  }

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    // UTF-16LE（少数导出工具会这么干）
    let text = '';
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      text += String.fromCharCode(bytes[i] | (bytes[i + 1] << 8));
    }
    return text;
  }

  const utf8 = decodeUtf8(bytes, 0);
  if (utf8 !== null) return utf8;

  return decodeGbk(bytes);
}

/** base64 → 字节数组（expo-file-system 读文件用） */
export function base64ToBytes(base64: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Int16Array(256).fill(-1);
  for (let i = 0; i < alphabet.length; i += 1) lookup[alphabet.charCodeAt(i)] = i;

  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((clean.length / 4) * 3 - padding);

  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = lookup[clean.charCodeAt(i)];
    const b = lookup[clean.charCodeAt(i + 1)];
    const c = lookup[clean.charCodeAt(i + 2)];
    const d = lookup[clean.charCodeAt(i + 3)];

    out[o++] = ((a << 2) | (b >> 4)) & 0xff;
    if (o < out.length) out[o++] = ((b << 4) | (c >> 2)) & 0xff;
    if (o < out.length) out[o++] = ((c << 6) | d) & 0xff;
  }

  return out;
}
