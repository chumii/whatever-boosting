const fs = require("fs");
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;
const offiPw = process.env.OFFI_PASSWORD;
if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars");
if (!offiPw) throw new Error("Missing OFFI_PASSWORD env var");
fs.writeFileSync(
  "boosting/src/js/config.js",
  `export const SUPABASE_URL = ${JSON.stringify(url)};\nexport const SUPABASE_ANON_KEY = ${JSON.stringify(key)};\n`
);
fs.writeFileSync(
  "offi-stuff/config.js",
  `export const PASSWORD = ${JSON.stringify(offiPw)};\n`
);
console.log("config files written");
