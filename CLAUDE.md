# Whatever Guild — Project Context

## What is this?

A private internal guild dashboard for a WoW guild. It is structured as a multi-module app: the root `/` shows a landing page with links to each module, and each module lives at its own subpath.

**Modules:**
- `/boosting/` — Boost-String-Generator and character database for the guild's Mythic+ boosting activity

## Tech Stack

- **Frontend**: Vanilla JS + HTML + CSS (no framework, no build step)
- **Database**: Supabase (PostgreSQL), accessed directly from the frontend via the JS SDK
- **Hosting**: Vercel
- **No backend** — all DB calls go through the Supabase JS client

## Environment Variables

```
SUPABASE_URL=https://avlbsdvctcqeswyaomdb.supabase.co
SUPABASE_ANON_KEY=<publishable key from Supabase>
```

These are set in Vercel. For local development, create a `.env.local` file (already in `.gitignore`).

> **Note**: Vanilla JS has no build step, so env vars are NOT auto-injected.
> Store them in `boosting/src/js/config.js` (gitignored) for local dev.
> The publishable key is safe to expose client-side per Supabase docs (RLS is enabled).

## File Structure

```
whatever-guild/
├── index.html              # Landing page — links to all modules
├── boosting/
│   ├── index.html          # Boosting module entry point
│   └── src/
│       ├── css/
│       │   └── style.css
│       └── js/
│           ├── supabase.js # Supabase client init + all DB functions
│           └── app.js      # UI logic, event handlers, string generation
├── scripts/
│   └── build-config.js     # Vercel build step: writes boosting/src/js/config.js
├── addon/                  # WoW addon (WhateverBoosting — name unchanged)
├── .gitignore
└── README.md
```

## Database Schema

### `players`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK, auto-generated |
| name | text | In-game or real name |
| discord_name | text | Discord handle |
| created_at | timestamptz | Auto |

### `characters`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK, auto-generated |
| player_id | uuid | FK → players.id (cascade delete) |
| name | text | Character name |
| class | text | Must match a name in wow_classes |
| armor_type | text | Plate / Mail / Leather / Cloth |
| main_role | text | Tank / Heal / Dps |
| off_role | text | Tank / Heal / Dps (nullable) |
| current_key_dungeon | text | e.g. "Ara-Kara" |
| current_key_level | int | e.g. 12 |
| rating | int | Mythic+ rating |
| item_level | numeric(5,1) | e.g. 639.5 |
| created_at | timestamptz | Auto |

### `wow_classes`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| name | text | e.g. "Warrior" |
| color | text | Hex color, e.g. "#C69B3A" |
| armor_type | text | Plate / Mail / Leather / Cloth |
| can_tank | boolean | |
| can_heal | boolean | |
| can_dps | boolean | Always true |

Pre-populated with all 13 classes and official Blizzard hex colors.

### `seasons`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| name | text | e.g. "Season 2" |
| is_current | boolean | Only one should be true at a time |
| created_at | timestamptz | Auto |

### `dungeons`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| season_id | uuid | FK → seasons.id (cascade delete) |
| name | text | e.g. "Ara-Kara, City of Echoes" |
| created_at | timestamptz | Auto |

RLS is enabled on all tables. Policies allow full access with the publishable key.

## App Structure

The app has two main sections:

### 1. Boost String Generator
- 4 dropdowns to select players/characters
- Button to generate the boost string
- Output text field with the generated string, ready to copy
- The exact string format needs to be clarified with the user before implementing

### 2. Database Management
- Tabular overview of all players and their characters
- Create / edit / delete for players, characters, seasons, dungeons, and wow_classes
- No page reloads — all updates via Supabase JS SDK and DOM manipulation

## UX Requirements

- **No page reloads** — all interactions handled in JS, DOM updated directly
- **Desktop only** — mobile-friendliness is not a priority
- **Fast and snappy** — no unnecessary loading states or animations

## UI & Design

The app should match **Vercel's dashboard aesthetic** exactly:

- **Background**: Near-black `#0a0a0a`
- **Cards / surfaces**: Dark gray `#111111` and `#1a1a1a`
- **Borders**: Subtle `1px solid #222222` — no shadows, borders do the separation work
- **Text**: Pure white `#ffffff` for primary, `#888888` for secondary/muted
- **Accent colors**: Minimal — green (`#22c55e`) for success/active states, red (`#ef4444`) for errors/delete, blue (`#3b82f6`) for primary actions
- **Typography**: Clean sans-serif (e.g. Geist, Inter, or system-ui), small and dense. Monospace for numeric game data (key levels, ratings, item levels)
- **WoW class colors**: Use each class's official hex color where class names appear (as colored text or a small color dot), never as backgrounds
- **Layout**: Fixed sidebar navigation, main content area with consistent padding, no decorative elements
- **Components**: Minimal buttons with subtle borders, clean `<select>` dropdowns, simple modals via `<dialog>`, inline confirmation for destructive actions
- **No gradients, no shadows, no rounded corners larger than 4px, no animations**

Think: functional, dense, dark — like a developer tool, not a gaming site.

## WoW Domain Knowledge

- **M+ / Mythic+**: Timed dungeon content in World of Warcraft
- **Boosting**: Experienced players carry a paying customer through content for gold
- **Key**: A Mythic Keystone — has a dungeon name and a level (higher = harder)
- **Roles**: Tank (absorbs damage), Heal (keeps group alive), Dps (deals damage)
- **Armor types**: Each class wears one type — Plate, Mail, Leather, or Cloth. Relevant for loot distribution in boost runs
- **Rating**: A numeric score (Raider.IO / in-game) reflecting a character's M+ performance
- **Season**: A content cycle in WoW — each season has its own pool of 8 dungeons
