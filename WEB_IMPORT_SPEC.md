# WhateverRoyale — Web Import Specification

> **Stack:** Vanilla JS + HTML + CSS · Supabase (Postgres + Edge Functions) · kein Build-Step, kein Framework

---

## 1. Export String Types

Das Addon produziert zwei Arten von Export-Strings:

| Prefix | Länge | Inhalt |
|--------|-------|--------|
| `WR1!` | 4 Zeichen | Session-Bundle — Sessions + eingebettete Charakter-Records |
| `WRC1!` | 5 Zeichen | Nur Charaktere — Main/Alt-Verlinkung, keine Sessions |

Beide verwenden die **gleiche Encoding-Pipeline**:

```
Lua table
  → LibSerialize:Serialize()
  → LibDeflate:CompressDeflate(level=9)
  → LibDeflate:EncodeForPrint()
  → Prefix voranstellen ("WR1!" oder "WRC1!")
```

---

## 2. Decode Pipeline

Empfohlene Aufteilung:

- **Browser (Vanilla JS):** Schritte 1–3 — reines JS, kein Backend nötig
- **Supabase Edge Function (Deno):** Schritt 4 + DB-Upsert — läuft server-seitig mit dem Service-Key

```
Browser                              Edge Function
─────────────────────────────        ─────────────────────────────────
Export-String
  → Prefix erkennen & abschneiden
  → DecodeForPrint (custom base-64)
  → pako.inflate (deflate)
  → base64-kodierte Bytes senden  →  LibSerialize deserialisieren
                                      Supabase-Insert
```

---

### 2.1 Schritt 1 — Prefix erkennen & abschneiden

```js
function detectExport(str) {
  str = str.trim();
  if (str.startsWith('WR1!'))  return { type: 'session',   encoded: str.slice(4) };
  if (str.startsWith('WRC1!')) return { type: 'character', encoded: str.slice(5) };
  return null;
}
```

---

### 2.2 Schritt 2 — DecodeForPrint (eigene base-64-Variante)

**Achtung:** Das ist **kein** Standard-Base64.

LibDeflate `EncodeForPrint` verwendet 64 druckbare ASCII-Zeichen in dieser Reihenfolge:

| Zeichen | Indices |
|---------|---------|
| `a`–`z` | 0–25 |
| `A`–`Z` | 26–51 |
| `0`–`9` | 52–61 |
| `(` | 62 |
| `)` | 63 |

3 Eingabe-Bytes → 4 Ausgabe-Zeichen (+25% Overhead). Die Bits werden **Little-Endian** verpackt.

```js
// wow-decode.js  — einmal laden, überall verwenden

const _CHAR_TO_6BIT = new Uint8Array(128).fill(0xff); // 0xff = ungültiges Zeichen
for (let i = 0; i < 26; i++) {
  _CHAR_TO_6BIT[0x61 + i] = i;       // a-z → 0-25
  _CHAR_TO_6BIT[0x41 + i] = 26 + i;  // A-Z → 26-51
}
for (let i = 0; i < 10; i++) {
  _CHAR_TO_6BIT[0x30 + i] = 52 + i;  // 0-9 → 52-61
}
_CHAR_TO_6BIT[0x28] = 62; // ( → 62
_CHAR_TO_6BIT[0x29] = 63; // ) → 63

/**
 * Dekodiert einen LibDeflate:EncodeForPrint-String zurück zu Roh-Bytes.
 * Gibt null zurück bei ungültigen Zeichen.
 */
function decodeForPrint(str) {
  // Führende/nachfolgende Steuerzeichen & Leerzeichen entfernen (wie Lua gsub)
  str = str.replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, '');
  const len = str.length;
  if (len <= 1) return null;

  const out = [];
  let i = 0;

  // Hauptschleife: je 4 Zeichen → 3 Bytes (little-endian)
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

  // Rest (0–3 verbleibende Zeichen) über Bit-Akkumulator
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
```

---

### 2.3 Schritt 3 — Deflate-Dekomprimierung (Browser, pako via CDN)

```html
<script src="https://cdn.jsdelivr.net/npm/pako@2/dist/pako.min.js"></script>
```

```js
// pako.inflate erwartet Uint8Array, gibt Uint8Array zurück
const compressed   = decodeForPrint(detected.encoded);
if (!compressed) throw new Error('DecodeForPrint fehlgeschlagen');

const decompressed = pako.inflate(compressed); // Uint8Array — LibSerialize-Stream
```

`pako.inflate` ist vollständig kompatibel mit LibDeflates `CompressDeflate`-Output.

---

### 2.4 Schritt 4 — LibSerialize deserialisieren (Supabase Edge Function)

LibSerialize verwendet ein kompaktes binäres Typ-Tag-Format (Version 1, nicht trivial zu portieren).  
**Empfehlung:** Supabase Edge Function (Deno) mit Fengari — so läuft die originale `LibSerialize.lua` direkt.

```
supabase/functions/wr-import/index.ts
```

```js
// Supabase Edge Function — Deno
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// pako für Deno (inflate)
import pako from 'https://esm.sh/pako@2';

// Fengari — Lua-Runtime für Deno/Browser
// Alternativ: https://esm.sh/fengari-web  (wenn verfügbar)
// Falls Fengari im Deno-Kontext nicht läuft: Lua via Deno subprocess (s.u.)

serve(async (req) => {
  const { exportString } = await req.json();
  if (!exportString) return new Response('missing exportString', { status: 400 });

  // Schritt 1
  const detected = detectExport(exportString.trim());
  if (!detected) return new Response('unbekannter Prefix', { status: 400 });

  // Schritt 2
  const compressed = decodeForPrint(detected.encoded);
  if (!compressed) return new Response('decodeForPrint fehlgeschlagen', { status: 400 });

  // Schritt 3
  let decompressed;
  try { decompressed = pako.inflate(compressed); }
  catch { return new Response('inflate fehlgeschlagen', { status: 400 }); }

  // Schritt 4 — LibSerialize → JS-Objekt
  let payload;
  try { payload = libserializeDeserialize(decompressed); }
  catch (e) { return new Response(`deserialize: ${e}`, { status: 400 }); }

  // Format-Check
  const expectedFormat = detected.type === 'session'
    ? 'WhateverRoyale-Export'
    : 'WhateverRoyale-CharExport';
  if (payload.format !== expectedFormat)
    return new Response('format mismatch', { status: 400 });

  // DB-Upsert
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  );

  await upsertCharacters(supabase, payload.characters, payload.exportedAt);

  if (detected.type === 'session') {
    await upsertSessions(supabase, payload.sessions, payload.exportedBy);
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
});
```

**Variante — LibSerialize über Lua-Subprocess** (falls Fengari in Deno nicht funktioniert):

```js
// decoder.lua — kleines Wrapper-Skript (liegt neben der Edge Function)
// Liest Base64 von stdin, deserialisiert, gibt JSON aus
async function libserializeDeserialize(bytes) {
  // bytes als base64 an lua-Prozess übergeben
  const b64 = btoa(String.fromCharCode(...bytes));
  const proc = new Deno.Command('lua', {
    args: ['decoder.lua'],
    stdin: 'piped', stdout: 'piped', stderr: 'piped',
  });
  const child = proc.spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(b64));
  await writer.close();
  const { stdout } = await child.output();
  return JSON.parse(new TextDecoder().decode(stdout));
}
```

```lua
-- decoder.lua
local LibStub = require("LibStub")
require("LibSerialize")
local ls = LibStub("LibSerialize")
local b64 = io.read("*all"):gsub("%s", "")
-- base64-Decode → Bytes → Deserialize → JSON-Ausgabe
-- (base64-Decode-Funktion hier einfügen oder mime.b64 nutzen)
local bytes = base64_decode(b64)
local ok, data = ls:Deserialize(bytes)
if not ok then os.exit(1) end
print(require("json").encode(data))
```

> **Deno-Hinweis:** Lua muss im Deployment-Image verfügbar sein. Bei Supabase Edge Functions (isolierte Deno-Umgebung ohne Shell-Zugriff) ist dies nicht möglich — dann Fengari oder ein eigener Server verwenden.

---

### 2.5 Browser → Edge Function aufrufen

```js
// import.js — im Browser
async function submitExport(exportString) {
  const res = await fetch('https://<project-ref>.supabase.co/functions/v1/wr-import', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ exportString }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Import fehlgeschlagen');
  return json;
}
```

**Alternativ — alles im Browser** (ohne Edge Function), wenn LibSerialize via Fengari-Web geladen wird:

```html
<script src="https://cdn.jsdelivr.net/npm/fengari-web/dist/fengari-web.js"></script>
<script>
  // LibStub.lua + LibSerialize.lua per fetch laden und via fengari.load() ausführen
  // Dann Supabase JS Client direkt aus Browser nutzen (anon key + RLS)
</script>
```

---

## 3. Payload-Schemas

*(Dokumentation — kein TypeScript. Feldtypen als Kommentare.)*

### 3.1 Session-Bundle (`WR1!`)

```js
{
  format:        "WhateverRoyale-Export",  // String — Discriminator
  formatVersion: 1,                        // Number
  schemaVersion: 3,                        // Number — Addon-DB-Schemaversion
  addonVersion:  "2.0.0",                  // String
  exportedAt:    1747123456,               // Number — Unix-Sekunden
  exportedBy:    "CharName-RealmName",     // String
  sessions:      [ /* Session[] */ ],
  characters:    [ /* CharacterRecord[] */ ]  // slim — keine Stats
}
```

### 3.2 Charakter-Bundle (`WRC1!`)

```js
{
  format:        "WhateverRoyale-CharExport",
  formatVersion: 1,
  schemaVersion: 3,
  addonVersion:  "2.0.0",
  exportedAt:    1747123456,
  exportedBy:    "CharName-RealmName",
  characters:    [ /* CharacterRecord[] */ ]  // nur main/alt — kein unlinked
}
```

### 3.3 CharacterRecord (slim — keine Stats)

```js
{
  characterId:   "CharName-RealmName",  // String — Primärschlüssel
  name:          "CharName",            // String
  realm:         "RealmName",           // String
  characterType: "main",                // String: "main" | "alt" | "unlinked"
  mainCharacter: "MainName-RealmName"   // String | null — nur bei type="alt" gesetzt
}
```

Session-Bundles enthalten alle `main`/`alt`-verlinkten Chars **plus** alle Teilnehmer der exportierten Sessions (als `unlinked`, wenn kein Charakter-Eintrag vorhanden). Charakter-Bundles enthalten ausschließlich `main`/`alt`.

### 3.4 Session

```js
{
  sessionId:     "1747123456_1",   // String — "<unixTimestamp>_<counter>"
  gameType:      "simpleDice",     // String: "simpleDice" | "deathRoll"
  startTime:     1747100000,       // Number — Unix-Sekunden
  endTime:       1747110000,       // Number | null
  status:        "completed",      // String: "completed" | "abandoned"
  channel:       "PARTY",          // String: "PARTY" | "RAID" | "INSTANCE" | "GUILD"
  hostCharacter: "CharName-RealmName",
  participants:  { "CharName-RealmName": true, ... },  // Lua-Set (Objekt mit bool-Werten)
  rounds:        { 1: Round, 2: Round, ... },          // 1-indiziert (Lua-Tabelle)
  sessionStats:  SessionStats,
  exportedAt:    1747120000        // Number | null — wann aus Addon exportiert
}
```

### 3.5 Round

```js
{
  roundNumber: 1,
  startTime:   1747100100,   // Number
  endTime:     1747100200,   // Number | null
  status:      "completed",  // "signup" | "rolling" | "completed" | "cancelled"
  signedUp:    { "CharName-RealmName": true, ... },  // Set
  rolls:       {
    "CharName-RealmName": {
      roll:      18432,        // Number — gewürfelter Wert
      maxRoll:   25000,        // Number — /roll-Maximum (simpleDice) oder vorheriger Roll (deathRoll)
      timestamp: 1747100150    // Number
    }
  },
  results: {
    winner:       "CharName-RealmName",
    loser:        "CharName-RealmName",
    payoutAmount: 1000,          // Number — in Gold (ganze Zahl)
    winnerRoll:   18432,
    loserRoll:    4201
  }  // null wenn Round nicht abgeschlossen
}
```

### 3.6 SessionStats *(nicht vertrauen — serverseitig neu berechnen)*

```js
{
  totalRounds:  12,
  totalPayouts: 12000,
  leaderboard:  { "CharName-RealmName": 3000, "OtherChar-Realm": -3000 }
}
```

---

## 4. Supabase-Schema

### 4.1 Tabelle `characters`

```sql
CREATE TABLE characters (
  character_id   TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  realm          TEXT NOT NULL,
  character_type TEXT NOT NULL DEFAULT 'unlinked'
                 CHECK (character_type IN ('main', 'alt', 'unlinked')),
  main_character TEXT REFERENCES characters(character_id) ON DELETE SET NULL,
  last_export_at TIMESTAMPTZ,    -- exportedAt aus dem Payload
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON characters(character_type);
CREATE INDEX ON characters(main_character);
```

Upsert — neueste Export-Zeit gewinnt:

```sql
INSERT INTO characters (character_id, name, realm, character_type, main_character, last_export_at)
VALUES ($1, $2, $3, $4, $5, to_timestamp($6))
ON CONFLICT (character_id) DO UPDATE SET
  character_type   = EXCLUDED.character_type,
  main_character   = EXCLUDED.main_character,
  last_export_at   = EXCLUDED.last_export_at,
  updated_at       = NOW()
WHERE characters.last_export_at IS NULL
   OR characters.last_export_at < EXCLUDED.last_export_at;
```

### 4.2 Tabelle `sessions`

```sql
CREATE TABLE sessions (
  session_id        TEXT PRIMARY KEY,
  game_type         TEXT NOT NULL,
  status            TEXT NOT NULL,
  host_character    TEXT NOT NULL,
  channel           TEXT,
  start_time        TIMESTAMPTZ,
  end_time          TIMESTAMPTZ,
  addon_exported_at TIMESTAMPTZ,   -- wann der Host exportiert hat
  imported_by       TEXT,          -- exportedBy aus dem Payload
  imported_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_data          JSONB NOT NULL  -- vollständiges Session-Objekt für Neu-Berechnung
);

CREATE INDEX ON sessions(host_character);
CREATE INDEX ON sessions(game_type);
CREATE INDEX ON sessions(start_time);
```

Upsert — erste Einfügung gewinnt (Session-Daten sind unveränderlich):

```sql
INSERT INTO sessions (session_id, game_type, status, host_character,
                      channel, start_time, end_time, addon_exported_at,
                      imported_by, raw_data)
VALUES ($1, $2, $3, $4, $5,
        to_timestamp($6), to_timestamp($7), to_timestamp($8),
        $9, $10::jsonb)
ON CONFLICT (session_id) DO NOTHING;
```

### 4.3 Tabellen `rounds` / `rolls` (optional)

Nur nötig wenn effiziente SQL-Abfragen auf Runden/Rolls gebraucht werden.  
Start mit nur `raw_data` (JSONB) — Supabase unterstützt JSON-Operatoren für viele Queries direkt:

```sql
-- Beispiel: alle Rounds einer Session aus raw_data lesen
SELECT raw_data -> 'rounds' FROM sessions WHERE session_id = '1747123456_1';

-- Alle Winner über alle Sessions
SELECT raw_data #>> '{rounds,1,results,winner}' FROM sessions;
```

---

## 5. Import-Flow (Vanilla JS Browser-Code)

```html
<!-- import.html -->
<textarea id="exportInput" rows="6" placeholder="WR1! oder WRC1! Export-String hier einfügen"></textarea>
<button id="importBtn">Importieren</button>
<p id="status"></p>

<script src="https://cdn.jsdelivr.net/npm/pako@2/dist/pako.min.js"></script>
<script src="wow-decode.js"></script>  <!-- decodeForPrint + detectExport von Abschnitt 2 -->
<script>
const EDGE_FUNCTION_URL = 'https://<project-ref>.supabase.co/functions/v1/wr-import';
const SUPABASE_ANON_KEY = '<anon-key>';  // anon key — kein Service-Key im Browser!

document.getElementById('importBtn').addEventListener('click', async () => {
  const status = document.getElementById('status');
  const raw = document.getElementById('exportInput').value.trim();

  status.textContent = 'Verarbeite…';

  try {
    // Schritte 1-3 im Browser
    const detected = detectExport(raw);
    if (!detected) throw new Error('Ungültiger Export-String (kein WR1! / WRC1! Prefix)');

    const compressed = decodeForPrint(detected.encoded);
    if (!compressed) throw new Error('DecodeForPrint fehlgeschlagen — ungültige Zeichen im String');

    const decompressed = pako.inflate(compressed);

    // Schritt 4 + DB-Upsert via Edge Function
    // decompressed (Uint8Array) als base64 senden — JSON kann kein binäres Uint8Array
    const b64 = btoa(String.fromCharCode(...decompressed));

    const res = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        type:      detected.type,   // "session" | "character"
        payloadB64: b64,            // base64-kodierter LibSerialize-Stream
      }),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);

    status.textContent = `✓ Import erfolgreich`;
  } catch (err) {
    status.textContent = `✗ Fehler: ${err.message}`;
    console.error(err);
  }
});
</script>
```

Entsprechende Edge Function empfängt `payloadB64`, dekodiert base64 → Bytes, führt LibSerialize durch und upserted in Supabase (Code aus Abschnitt 2.4).

---

## 6. Dedup- & Konflikt-Regeln

### Sessions
- **Primärschlüssel:** `session_id` (`"<unixTimestamp>_<counter>"`)
- **Strategie:** `ON CONFLICT DO NOTHING` — erste Einfügung gewinnt
- **Warum:** Session-Daten sind nach Session-Ende unveränderlich. Falls zwei Hosts die gleiche Session exportieren (Edge-Case), sind die Daten identisch.

### Charaktere
- **Primärschlüssel:** `character_id` (`"CharName-RealmName"`)
- **Strategie:** Neueste `exportedAt` gewinnt
- **Warum:** Host A kennt "Foo" als unlinked, Host B weiß dass "Foo" ein Alt von "Bar" ist. Der neueste Export ist am aktuellsten.
- **Edge-Case:** Gleicher `exportedAt` aber widersprüchlicher `characterType` → bestehenden Wert behalten (Stabilität bevorzugen).

---

## 7. Stats-Neuberechnung

**`sessionStats` aus dem Payload nicht vertrauen.** Immer aus `rounds` neu ableiten:

```js
function computeSessionStats(session) {
  const leaderboard = {};
  let totalRounds = 0;
  let totalPayouts = 0;

  // session.rounds ist ein Objekt mit numerischen Keys (1, 2, 3, ...)
  for (const round of Object.values(session.rounds)) {
    if (round.status !== 'completed' || !round.results) continue;
    const { winner, loser, payoutAmount } = round.results;
    leaderboard[winner] = (leaderboard[winner] ?? 0) + payoutAmount;
    leaderboard[loser]  = (leaderboard[loser]  ?? 0) - payoutAmount;
    totalRounds++;
    totalPayouts += payoutAmount;
  }

  return { totalRounds, totalPayouts, leaderboard };
}
```

---

## 8. Lua ↔ JS Typ-Mapping

| Lua | JavaScript (nach Deserialisierung) |
|-----|-------------------------------------|
| `nil` | `null` |
| `true` / `false` | `true` / `false` |
| Integer | `number` |
| Float | `number` |
| String | `string` |
| Table (Array: Keys 1..n) | Objekt `{ "1": …, "2": … }` *(nicht JS-Array!)* |
| Table (Map: String-Keys) | Objekt `{ key: value }` |

**Wichtig:** Lua-Tabellen mit Integer-Keys werden nach Deserialisierung zu JS-Objekten mit **String-Keys** (`"1"`, `"2"`, …), nicht zu Arrays. `Object.values(session.rounds)` funktioniert korrekt.

Lua-"Sets" (`{ ["Name-Realm"] = true }`) werden zu `{ "Name-Realm": true }` — mit `Object.keys()` iterieren.

---

## 9. Quick Reference

| Sache | Wert |
|-------|------|
| Session-Export-Prefix | `WR1!` (4 Zeichen) |
| Charakter-Export-Prefix | `WRC1!` (5 Zeichen) |
| Session-Format-Discriminator | `"WhateverRoyale-Export"` |
| Charakter-Format-Discriminator | `"WhateverRoyale-CharExport"` |
| Format-Version (beide) | `1` |
| Schema-Version (aktuell) | `3` |
| EncodeForPrint Alphabet | `a-z A-Z 0-9 ( )` (64 Zeichen, Kleinbuchstaben zuerst) |
| EncodeForPrint Overhead | +25% (4 Zeichen pro 3 Bytes) |
| Bit-Reihenfolge | Little-Endian |
| Kompression | LibDeflate Deflate, Level 9 — kompatibel mit `pako.inflate()` |
| Serialisierung | LibSerialize v1 Binär-Format |
| Zeitstempel-Format | Unix-Sekunden (**nicht** Millisekunden — `* 1000` für JS `Date`) |
| Character-ID-Format | `"CharName-RealmName"` |
| Session-ID-Format | `"<unixTimestamp>_<counter>"` |
| Gold-Beträge | Integer (ganze Gold-Einheiten) |
| Max. Export-Warn-Schwelle | 60 000 Bytes (Addon warnt, Export bleibt gültig) |
| pako CDN | `https://cdn.jsdelivr.net/npm/pako@2/dist/pako.min.js` |
| Supabase JS CDN | `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js` |
