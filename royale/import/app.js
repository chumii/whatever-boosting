import { installGate } from "../src/js/gate.js";
import { PASSWORD } from "../src/js/config.js";
import { detectExport, decodeForPrint } from "../src/js/wr-decode.js";
import { deserialize } from "../src/js/deserialize.js";
import { upsertSession, upsertCharacter } from "../src/js/supabase.js";

const $ = (sel) => document.querySelector(sel);

function setStatus(msg, type = "") {
  const el = $("#import-status");
  el.textContent = msg;
  el.className = "import-status" + (type ? " " + type : "");
}

function toTimestamp(unix) {
  return unix ? new Date(unix * 1000).toISOString() : null;
}

async function processCharacters(characters, exportedAt) {
  for (const c of characters) {
    if (!c.characterId) continue;
    await upsertCharacter({
      character_id:   c.characterId,
      name:           c.name,
      realm:          c.realm,
      character_type: c.characterType || "unlinked",
      main_character: c.mainCharacter || null,
      last_export_at: toTimestamp(exportedAt),
      updated_at:     new Date().toISOString(),
    });
  }
}

async function processSessions(sessions, exportedBy) {
  for (const s of sessions) {
    if (!s.sessionId) continue;
    await upsertSession({
      session_id:        s.sessionId,
      game_type:         s.gameType,
      status:            s.status,
      host_character:    s.hostCharacter,
      channel:           s.channel || null,
      start_time:        toTimestamp(s.startTime),
      end_time:          toTimestamp(s.endTime),
      addon_exported_at: toTimestamp(s.exportedAt),
      imported_by:       exportedBy || null,
      raw_data:          s,
    });
  }
}

async function runImport() {
  const raw = $("#export-input").value.trim();
  if (!raw) { setStatus("Bitte einen Export-String einfügen.", "err"); return; }

  setStatus("Erkenne Format…", "pending");

  const detected = detectExport(raw);
  if (!detected) {
    setStatus("Ungültiger Export-String — kein WR1! oder WRC1! Prefix.", "err");
    return;
  }

  setStatus("Dekodiere…", "pending");
  const compressed = decodeForPrint(detected.encoded);
  if (!compressed) {
    setStatus("DecodeForPrint fehlgeschlagen — ungültige Zeichen im String.", "err");
    return;
  }

  let decompressed;
  try {
    decompressed = pako.inflate(compressed);
  } catch (e) {
    setStatus("Inflate fehlgeschlagen: " + e.message, "err");
    return;
  }

  setStatus("Deserialisiere (Lua-VM lädt…)…", "pending");
  let payload;
  try {
    payload = await deserialize(decompressed);
  } catch (e) {
    setStatus("Deserialisierung fehlgeschlagen: " + e.message, "err");
    return;
  }

  const expectedFormat = detected.type === "session"
    ? "WhateverRoyale-Export"
    : "WhateverRoyale-CharExport";
  if (payload.format !== expectedFormat) {
    setStatus(`Format-Mismatch: erwartet "${expectedFormat}", erhalten "${payload.format}".`, "err");
    return;
  }

  setStatus("Importiere in Datenbank…", "pending");
  try {
    if (payload.characters?.length) {
      await processCharacters(payload.characters, payload.exportedAt);
    }
    if (detected.type === "session" && payload.sessions?.length) {
      await processSessions(payload.sessions, payload.exportedBy);
    }
  } catch (e) {
    setStatus("Datenbankfehler: " + e.message, "err");
    return;
  }

  const charCount    = payload.characters?.length ?? 0;
  const sessionCount = payload.sessions?.length ?? 0;
  const parts = [];
  if (charCount)    parts.push(`${charCount} Charakter${charCount !== 1 ? "e" : ""}`);
  if (sessionCount) parts.push(`${sessionCount} Session${sessionCount !== 1 ? "s" : ""}`);
  setStatus("✓ Import erfolgreich — " + (parts.join(", ") || "keine Daten"), "ok");
  $("#export-input").value = "";
}

function initImport() {
  $("#import-btn").addEventListener("click", runImport);
  $("#export-input").addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") runImport();
  });
}

installGate({ password: PASSWORD, onUnlock: initImport, storageKey: "royale-auth" });
