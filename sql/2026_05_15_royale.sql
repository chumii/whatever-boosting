-- WhateverRoyale: wr_characters + wr_sessions tables.
-- Prefix "wr_" to avoid collision with boosting's "characters" table.
-- Run once via Supabase SQL editor.

create table if not exists public.wr_characters (
  character_id   text primary key,
  name           text not null,
  realm          text not null,
  character_type text not null default 'unlinked'
                 check (character_type in ('main', 'alt', 'unlinked')),
  main_character text references public.wr_characters(character_id) on delete set null,
  last_export_at timestamptz,
  updated_at     timestamptz not null default now()
);

create index if not exists wr_characters_type_idx on public.wr_characters(character_type);
create index if not exists wr_characters_main_idx on public.wr_characters(main_character);

create table if not exists public.wr_sessions (
  session_id        text primary key,
  game_type         text not null,
  status            text not null,
  host_character    text not null,
  channel           text,
  start_time        timestamptz,
  end_time          timestamptz,
  addon_exported_at timestamptz,
  imported_by       text,
  imported_at       timestamptz not null default now(),
  raw_data          jsonb not null
);

create index if not exists wr_sessions_host_idx  on public.wr_sessions(host_character);
create index if not exists wr_sessions_type_idx  on public.wr_sessions(game_type);
create index if not exists wr_sessions_time_idx  on public.wr_sessions(start_time);

alter table public.wr_characters enable row level security;
alter table public.wr_sessions   enable row level security;

drop policy if exists "wr_characters full access" on public.wr_characters;
create policy "wr_characters full access" on public.wr_characters
  for all using (true) with check (true);

drop policy if exists "wr_sessions full access" on public.wr_sessions;
create policy "wr_sessions full access" on public.wr_sessions
  for all using (true) with check (true);
