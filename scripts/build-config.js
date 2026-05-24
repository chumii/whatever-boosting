const fs = require("fs");
const path = require("path");

// In local dev, Next.js loads .env.local only for its own process.
// When this script runs as a prebuild step, we need to load it ourselves.
if (process.env.NODE_ENV !== "production") {
  const envPath = path.join(__dirname, "..", ".env.local");
  try {
    const lines = fs.readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (key && !(key in process.env)) process.env[key] = val;
    }
  } catch {
    // no .env.local → rely on real env vars (CI / Vercel)
  }
}

const url      = process.env.SUPABASE_URL;
const key      = process.env.SUPABASE_ANON_KEY;
const offiPw   = process.env.OFFI_PASSWORD;
const royalePw = process.env.ROYALE_PASSWORD;
if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars");
if (!offiPw)      throw new Error("Missing OFFI_PASSWORD env var");
if (!royalePw)    throw new Error("Missing ROYALE_PASSWORD env var");

fs.mkdirSync("public/boosting/src/js", { recursive: true });
fs.writeFileSync(
  "public/boosting/src/js/config.js",
  `export const SUPABASE_URL = ${JSON.stringify(url)};\nexport const SUPABASE_ANON_KEY = ${JSON.stringify(key)};\n`
);
fs.mkdirSync("public/offi-stuff/src/js", { recursive: true });
fs.writeFileSync(
  "public/offi-stuff/src/js/config.js",
  `export const SUPABASE_URL = ${JSON.stringify(url)};\nexport const SUPABASE_ANON_KEY = ${JSON.stringify(key)};\nexport const PASSWORD = ${JSON.stringify(offiPw)};\n`
);
fs.mkdirSync("public/royale/src/js", { recursive: true });
fs.writeFileSync(
  "public/royale/src/js/config.js",
  `export const SUPABASE_URL = ${JSON.stringify(url)};\nexport const SUPABASE_ANON_KEY = ${JSON.stringify(key)};\nexport const PASSWORD = ${JSON.stringify(royalePw)};\n`
);
console.log("config files written");
