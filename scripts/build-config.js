const fs = require("fs");
const url      = process.env.SUPABASE_URL;
const key      = process.env.SUPABASE_ANON_KEY;
const offiPw   = process.env.OFFI_PASSWORD;
const royalePw = process.env.ROYALE_PASSWORD;
if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars");
if (!offiPw)      throw new Error("Missing OFFI_PASSWORD env var");
if (!royalePw)    throw new Error("Missing ROYALE_PASSWORD env var");

fs.writeFileSync(
  "boosting/src/js/config.js",
  `export const SUPABASE_URL = ${JSON.stringify(url)};\nexport const SUPABASE_ANON_KEY = ${JSON.stringify(key)};\n`
);
fs.mkdirSync("offi-stuff/src/js", { recursive: true });
fs.writeFileSync(
  "offi-stuff/src/js/config.js",
  `export const SUPABASE_URL = ${JSON.stringify(url)};\nexport const SUPABASE_ANON_KEY = ${JSON.stringify(key)};\nexport const PASSWORD = ${JSON.stringify(offiPw)};\n`
);
fs.mkdirSync("royale/src/js", { recursive: true });
fs.writeFileSync(
  "royale/src/js/config.js",
  `export const SUPABASE_URL = ${JSON.stringify(url)};\nexport const SUPABASE_ANON_KEY = ${JSON.stringify(key)};\nexport const PASSWORD = ${JSON.stringify(royalePw)};\n`
);
console.log("config files written");
