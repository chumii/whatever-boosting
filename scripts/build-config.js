const fs = require("fs");
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;
if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars");
fs.writeFileSync(
  "boosting/src/js/config.js",
  `export const SUPABASE_URL = ${JSON.stringify(url)};\nexport const SUPABASE_ANON_KEY = ${JSON.stringify(key)};\n`
);
console.log("config.js written");
