# Discord Bot Integration — AFK-Einträge in der Webapp

Diese Datei beschreibt, wie der Discord-Bot Abwesenheitseinträge ("AFK") in die Supabase-Datenbank schreiben kann, die die Webapp `offi-stuff/kalender/` anzeigt.

---

## 1. Überblick

- Die Webapp zeigt einen Kalender mit AFK-Einträgen aller Gildenmitglieder
- Backend: Supabase (PostgreSQL), direkt vom Client via JS SDK angesprochen
- Bot kann als zweiter Schreiber auf **dieselben Tabellen** schreiben
- Webapp aktualisiert sich via Supabase Realtime automatisch — **Bot muss nichts pingen**

---

## 2. Supabase-Connection

| | |
|---|---|
| URL | `https://avlbsdvctcqeswyaomdb.supabase.co` |
| Anon Key | Aus Env-Variable `SUPABASE_ANON_KEY` (publishable, client-safe) |

Der Anon-Key ist ein öffentlicher Schlüssel — er ist für Client-seitige Nutzung gedacht und in der Vercel-Umgebung bereits gesetzt. RLS (Row-Level-Security) ist aktiv, die Policies erlauben vollen Zugriff mit dem Anon-Key (der Bot läuft auf einem vertrauten Server).

**Empfohlene SDKs:**

```python
# Python
pip install supabase
from supabase import create_client
sb = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
```

```js
// Node.js
npm install @supabase/supabase-js
import { createClient } from "@supabase/supabase-js";
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

---

## 3. Schema

### Tabelle `members`

Eine Zeile pro Gildenmitglied. Wird in der Webapp verwaltet (Officers tragen Members ein).

| Spalte | Typ | Notes |
|---|---|---|
| `id` | `uuid` | PK, auto-generiert |
| `name` | `text NOT NULL` | In-game oder echter Name |
| `discord_name` | `text` | **Mapping-Feld** — Discord-Username des Members |
| `created_at` | `timestamptz` | Auto |

### Tabelle `vacations`

Eine Zeile pro AFK-Eintrag. Der Bot schreibt hierhin.

| Spalte | Typ | Notes |
|---|---|---|
| `id` | `uuid` | PK, auto-generiert |
| `member_id` | `uuid NOT NULL` | FK → `members.id` (cascade delete) |
| `start_date` | `date NOT NULL` | YYYY-MM-DD, **inklusiv** |
| `end_date` | `date NOT NULL` | YYYY-MM-DD, **inklusiv** |
| `note` | `text` | Nullable — optionaler Kommentar |
| `is_preliminary` | `boolean` | Default `false` — `true` = "noch unsicher" |
| `created_at` | `timestamptz` | Auto |

---

## 4. Discord-User → `members` mappen

Der Bot identifiziert Mitglieder über `members.discord_name`.

**Welcher Discord-Name?** Den **globalen Username** (`user.name` / `interaction.user.name`), **nicht** den Server-Nickname (kann pro Server individuell gesetzt sein und weicht ab).

### Lookup-Logik

```python
res = sb.table("members").select("id").eq("discord_name", interaction.user.name).execute()

if res.data:
    member_id = res.data[0]["id"]
else:
    # Member noch nicht in der DB — Auto-Create
    # Officers können den 'name' später in der Webapp auf den echten Namen setzen
    created = sb.table("members").insert({
        "name": interaction.user.name,
        "discord_name": interaction.user.name,
    }).execute()
    member_id = created.data[0]["id"]
```

Das Mapping bleibt stabil, solange `discord_name` gesetzt ist — auch wenn ein Officer den `name` in der Webapp auf "Ragnarök" ändert.

---

## 5. AFK-Eintrag anlegen (Insert)

```python
row = {
    "member_id":      member_id,        # uuid aus Schritt 4
    "start_date":     "2026-05-15",     # YYYY-MM-DD
    "end_date":       "2026-05-20",     # YYYY-MM-DD, inklusiv
    "note":           "Urlaub",         # optional, None/null erlaubt
    "is_preliminary": False,            # True = "unsicher", default False
}
res = sb.table("vacations").insert(row).execute()
vacation_id = res.data[0]["id"]
```

- `created_at` **nicht setzen** — DB-Default
- Ein eintägiger AFK: `start_date == end_date`
- `note` weglassen oder `None`/`null` für keinen Kommentar

---

## 6. AFK-Einträge auflisten, ändern, löschen

```python
# Alle AFKs des Users (für /meine-afks)
sb.table("vacations") \
  .select("*") \
  .eq("member_id", member_id) \
  .order("start_date") \
  .execute()

# Eintrag ändern (nur eigene — member_id cross-checken!)
sb.table("vacations") \
  .update({"end_date": "2026-05-22", "note": "verlängert"}) \
  .eq("id", vacation_id) \
  .execute()

# Eintrag löschen
sb.table("vacations") \
  .delete() \
  .eq("id", vacation_id) \
  .execute()
```

> Die RLS-Policy erlaubt grundsätzlich alles mit dem Anon-Key. Der Bot sollte vor Update/Delete prüfen, ob `member_id` zum anfragenden Discord-User gehört.

---

## 7. Datumsformat

- Strikt `YYYY-MM-DD`
- `start_date` und `end_date` sind **beide inklusiv**
- `start_date`/`end_date` sind reine Kalendertage — zeitzonenneutral
- Empfehlung: User-Input parsen ("morgen", "Fr-So", "10.5.-15.5.") und vor dem Insert nach ISO 8601 konvertieren

---

## 8. Realtime / Webapp-Sync

Die Webapp abonniert `postgres_changes` auf den Tabellen `members` und `vacations`. Jeder Insert/Update/Delete durch den Bot erscheint **innerhalb von ~1 s** in der Webapp — kein weiterer Schritt nötig.

---

## 9. Testen

1. Insert mit Datum weit in der Zukunft (z.B. `2099-01-01`)
2. Webapp `/offi-stuff/kalender/` öffnen → neuer Eintrag muss innerhalb einer Sekunde erscheinen
3. Eintrag via Bot oder Webapp wieder löschen

---

## 10. Nicht im Scope (mögliche spätere Erweiterungen)

- `discord_user_id` (Discord-Snowflake) als stabileres Mapping-Feld — würde eine DB-Migration erfordern
- Berechtigungen (nur Officers dürfen fremde Einträge löschen etc.) — derzeit kein serverseitiges Enforcement
- Bot-Commands, UX-Flow — nicht Teil dieser Spec, nur die Datenschicht
