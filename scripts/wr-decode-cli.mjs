#!/usr/bin/env node
// CLI: decode a WhateverRoyale export string (WR1! or WRC1!) to JSON.
// Usage: node scripts/wr-decode-cli.mjs "<export string>"
//        echo "<export string>" | node scripts/wr-decode-cli.mjs

import { inflateRawSync } from "zlib";

// ── LibDeflate EncodeForPrint decoder (matches royale/src/js/wr-decode.js) ────

const C2B = new Uint8Array(128).fill(0xff);
for (let i = 0; i < 26; i++) {
  C2B[0x61 + i] = i;
  C2B[0x41 + i] = 26 + i;
}
for (let i = 0; i < 10; i++) C2B[0x30 + i] = 52 + i;
C2B[0x28] = 62;
C2B[0x29] = 63;

function decodeForPrint(str) {
  str = str.replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, "");
  const len = str.length;
  const out = [];
  let i = 0;
  while (i <= len - 4) {
    const b1 = C2B[str.charCodeAt(i)];
    const b2 = C2B[str.charCodeAt(i + 1)];
    const b3 = C2B[str.charCodeAt(i + 2)];
    const b4 = C2B[str.charCodeAt(i + 3)];
    if (b1 === 0xff || b2 === 0xff || b3 === 0xff || b4 === 0xff) return null;
    i += 4;
    const cache = b1 + b2 * 64 + b3 * 4096 + b4 * 262144;
    out.push(cache & 0xff, (cache >>> 8) & 0xff, (cache >>> 16) & 0xff);
  }
  const pow2 = [1,2,4,8,16,32,64,128,256,512,1024,2048,4096,8192,16384,32768,65536,131072];
  let cache = 0, cacheBits = 0;
  while (i < len) {
    const x = C2B[str.charCodeAt(i++)];
    if (x === 0xff) return null;
    cache += x * pow2[cacheBits];
    cacheBits += 6;
  }
  while (cacheBits >= 8) {
    out.push(cache & 0xff);
    cache = Math.floor(cache / 256);
    cacheBits -= 8;
  }
  return Buffer.from(out);
}

// ── LibSerialize deserializer (JS port of royale/src/lua/LibSerialize.lua) ────

const RI = {
  NIL: 0,
  NUM_16_POS: 1, NUM_16_NEG: 2,
  NUM_24_POS: 3, NUM_24_NEG: 4,
  NUM_32_POS: 5, NUM_32_NEG: 6,
  NUM_64_POS: 7, NUM_64_NEG: 8,
  NUM_FLOAT: 9, NUM_FLOATSTR_POS: 10, NUM_FLOATSTR_NEG: 11,
  BOOL_T: 12, BOOL_F: 13,
  STR_8: 14, STR_16: 15, STR_24: 16,
  TABLE_8: 17, TABLE_16: 18, TABLE_24: 19,
  ARRAY_8: 20, ARRAY_16: 21, ARRAY_24: 22,
  MIXED_8: 23, MIXED_16: 24, MIXED_24: 25,
  STRINGREF_8: 26, STRINGREF_16: 27, STRINGREF_24: 28,
  TABLEREF_8: 29, TABLEREF_16: 30, TABLEREF_24: 31,
};

function libDeserialize(raw) {
  // raw is a Buffer
  let pos = 0;
  const strRefs = [];   // 1-indexed (access via strRefs[idx-1])
  const tblRefs = [];   // same

  const readByte  = ()  => raw[pos++];
  const readInt   = (n) => { let v = 0; for (let i = 0; i < n; i++) v = v * 256 + raw[pos++]; return v; };
  const readStr   = (n) => { const s = raw.toString("utf8", pos, pos + n); pos += n; if (n > 2) strRefs.push(s); return s; };
  const readFloat = ()  => { const v = raw.readDoubleBE(pos); pos += 8; return v; };
  const readFloatStr = (sign) => {
    const len = readByte();
    const s = raw.toString("ascii", pos, pos + len);
    pos += len;
    return sign * parseFloat(s);
  };

  function addTbl(t) { tblRefs.push(t); return t; }

  function readTable(count, obj) {
    if (obj === undefined) obj = addTbl({});
    for (let i = 0; i < count; i++) { const k = readObj(); obj[k] = readObj(); }
    return obj;
  }

  function readArray(count, obj) {
    if (obj === undefined) obj = addTbl([]);
    for (let i = 0; i < count; i++) obj.push(readObj());
    return obj;
  }

  function readMixed(ac, mc) {
    // Lua: 1-indexed array part in an object; we use a JS object with numeric keys starting at 1.
    const obj = addTbl({});
    for (let i = 1; i <= ac; i++) obj[i] = readObj();
    for (let i = 0; i < mc; i++) { const k = readObj(); obj[k] = readObj(); }
    return obj;
  }

  function readObj() {
    const v = readByte();

    if (v & 1) return (v - 1) >> 1;  // embedded number 0-127

    if ((v & 3) === 2) {              // type + embedded count
      const tr = (v - 2) >> 2;
      const typ = tr & 3, cnt = tr >> 2;
      switch (typ) {
        case 0: return readStr(cnt);
        case 1: return readTable(cnt);
        case 2: return readArray(cnt);
        case 3: return readMixed((cnt & 3) + 1, (cnt >> 2) + 1);
      }
    }

    if ((v & 7) === 4) {              // 2-byte embedded number
      const packed = readByte() * 256 + v;
      return (v & 15) === 12 ? -(packed - 12) / 16 : (packed - 4) / 16;
    }

    const typ = v >> 3;               // full-byte type
    switch (typ) {
      case RI.NIL:            return null;
      case RI.NUM_16_POS:     return  readInt(2);
      case RI.NUM_16_NEG:     return -readInt(2);
      case RI.NUM_24_POS:     return  readInt(3);
      case RI.NUM_24_NEG:     return -readInt(3);
      case RI.NUM_32_POS:     return  readInt(4);
      case RI.NUM_32_NEG:     return -readInt(4);
      case RI.NUM_64_POS:     return  readInt(7);
      case RI.NUM_64_NEG:     return -readInt(7);
      case RI.NUM_FLOAT:      return  readFloat();
      case RI.NUM_FLOATSTR_POS: return readFloatStr(1);
      case RI.NUM_FLOATSTR_NEG: return readFloatStr(-1);
      case RI.BOOL_T:         return true;
      case RI.BOOL_F:         return false;
      case RI.STR_8:          return readStr(readByte());
      case RI.STR_16:         return readStr(readInt(2));
      case RI.STR_24:         return readStr(readInt(3));
      case RI.TABLE_8:        return readTable(readByte());
      case RI.TABLE_16:       return readTable(readInt(2));
      case RI.TABLE_24:       return readTable(readInt(3));
      case RI.ARRAY_8:        return readArray(readByte());
      case RI.ARRAY_16:       return readArray(readInt(2));
      case RI.ARRAY_24:       return readArray(readInt(3));
      case RI.MIXED_8:        { const ac = readByte(), mc = readByte(); return readMixed(ac, mc); }
      case RI.MIXED_16:       { const ac = readInt(2), mc = readInt(2); return readMixed(ac, mc); }
      case RI.MIXED_24:       { const ac = readInt(3), mc = readInt(3); return readMixed(ac, mc); }
      case RI.STRINGREF_8:    return strRefs[readByte()  - 1];
      case RI.STRINGREF_16:   return strRefs[readInt(2)  - 1];
      case RI.STRINGREF_24:   return strRefs[readInt(3)  - 1];
      case RI.TABLEREF_8:     return tblRefs[readByte()  - 1];
      case RI.TABLEREF_16:    return tblRefs[readInt(2)  - 1];
      case RI.TABLEREF_24:    return tblRefs[readInt(3)  - 1];
      default: throw new Error(`Unknown type index: ${typ} at pos ${pos - 1}`);
    }
  }

  const version = readByte();
  if (version > 2) throw new Error(`Unknown LibSerialize version: ${version}`);

  const results = [];
  while (pos < raw.length) results.push(readObj());
  return results.length === 1 ? results[0] : results;
}

// ── main ──────────────────────────────────────────────────────────────────────

function decodeExport(str) {
  str = str.trim();
  let type, encoded;
  if      (str.startsWith("WR1!"))  { type = "session";   encoded = str.slice(4);  }
  else if (str.startsWith("WRC1!")) { type = "character"; encoded = str.slice(5); }
  else throw new Error("Unknown prefix — expected WR1! or WRC1!");

  const compressed = decodeForPrint(encoded);
  if (!compressed) throw new Error("DecodeForPrint failed — invalid characters in string");

  const decompressed = inflateRawSync(compressed);
  const payload = libDeserialize(decompressed);
  return { _prefix: type, ...payload };
}

async function main() {
  let input = process.argv[2];
  if (!input) {
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    input = chunks.join("").trim();
  }
  if (!input) { console.error("Usage: wr-decode-cli.mjs <export-string>"); process.exit(1); }

  const result = decodeExport(input);
  console.log(JSON.stringify(result, null, 2));
}

main().catch(e => { console.error("Error:", e.message); process.exit(1); });
