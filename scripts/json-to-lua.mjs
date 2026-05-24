#!/usr/bin/env node
// Converts a JSON file to a Lua table file.
// Usage: node scripts/json-to-lua.mjs <input.json> <varname> <output.lua>

import { readFileSync, writeFileSync } from "fs";

function toLua(val, indent) {
  const pad = "  ".repeat(indent);
  const padInner = "  ".repeat(indent + 1);

  if (val === null)             return "nil";
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "number")  return String(val);
  if (typeof val === "string")  return `"${val.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;

  if (Array.isArray(val)) {
    if (val.length === 0) return "{}";
    const items = val.map(v => `${padInner}${toLua(v, indent + 1)}`).join(",\n");
    return `{\n${items},\n${pad}}`;
  }

  if (typeof val === "object") {
    const keys = Object.keys(val);
    if (keys.length === 0) return "{}";
    const items = keys.map(k => {
      const luaKey = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k) ? k : `["${k.replace(/"/g, '\\"')}"]`;
      return `${padInner}${luaKey} = ${toLua(val[k], indent + 1)}`;
    }).join(",\n");
    return `{\n${items},\n${pad}}`;
  }

  return "nil";
}

const [,, inputFile, varName, outputFile] = process.argv;
if (!inputFile || !varName || !outputFile) {
  console.error("Usage: json-to-lua.mjs <input.json> <varname> <output.lua>");
  process.exit(1);
}

const data = JSON.parse(readFileSync(inputFile, "utf8"));
const lua = `${varName} = ${toLua(data, 0)}\n`;
writeFileSync(outputFile, lua, "utf8");
console.log(`Written: ${outputFile}`);
