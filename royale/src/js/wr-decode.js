// wr-decode.js — LibDeflate EncodeForPrint decoder + export string detection.
// Source: WEB_IMPORT_SPEC.md §2.1/§2.2 (verbatim).

const _CHAR_TO_6BIT = new Uint8Array(128).fill(0xff);
for (let i = 0; i < 26; i++) {
  _CHAR_TO_6BIT[0x61 + i] = i;       // a-z → 0-25
  _CHAR_TO_6BIT[0x41 + i] = 26 + i;  // A-Z → 26-51
}
for (let i = 0; i < 10; i++) {
  _CHAR_TO_6BIT[0x30 + i] = 52 + i;  // 0-9 → 52-61
}
_CHAR_TO_6BIT[0x28] = 62; // ( → 62
_CHAR_TO_6BIT[0x29] = 63; // ) → 63

export function detectExport(str) {
  str = str.trim();
  if (str.startsWith("WR1!"))  return { type: "session",   encoded: str.slice(4) };
  if (str.startsWith("WRC1!")) return { type: "character", encoded: str.slice(5) };
  return null;
}

export function decodeForPrint(str) {
  str = str.replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, "");
  const len = str.length;
  if (len <= 1) return null;

  const out = [];
  let i = 0;

  while (i <= len - 4) {
    const b1 = _CHAR_TO_6BIT[str.charCodeAt(i)];
    const b2 = _CHAR_TO_6BIT[str.charCodeAt(i + 1)];
    const b3 = _CHAR_TO_6BIT[str.charCodeAt(i + 2)];
    const b4 = _CHAR_TO_6BIT[str.charCodeAt(i + 3)];
    if (b1 === 0xff || b2 === 0xff || b3 === 0xff || b4 === 0xff) return null;
    i += 4;
    const cache = b1 + b2 * 64 + b3 * 4096 + b4 * 262144;
    out.push(cache & 0xff, (cache >>> 8) & 0xff, (cache >>> 16) & 0xff);
  }

  const pow2 = [1,2,4,8,16,32,64,128,256,512,1024,2048,4096,8192,16384,32768,65536,131072];
  let cache = 0, cacheBits = 0;
  while (i < len) {
    const x = _CHAR_TO_6BIT[str.charCodeAt(i++)];
    if (x === 0xff) return null;
    cache += x * pow2[cacheBits];
    cacheBits += 6;
  }
  while (cacheBits >= 8) {
    out.push(cache & 0xff);
    cache = Math.floor(cache / 256);
    cacheBits -= 8;
  }

  return new Uint8Array(out);
}
