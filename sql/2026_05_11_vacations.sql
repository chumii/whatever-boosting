-- Urlaubskalender: members + vacations tables.
-- Run once via Supabase SQL editor.

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  discord_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.vacations (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists vacations_member_idx on public.vacations(member_id);
create index if not exists vacations_dates_idx on public.vacations(start_date, end_date);

alter table public.members enable row level security;
alter table public.vacations enable row level security;

drop policy if exists "members full access" on public.members;
create policy "members full access" on public.members
  for all using (true) with check (true);

drop policy if exists "vacations full access" on public.vacations;
create policy "vacations full access" on public.vacations
  for all using (true) with check (true);

alter publication supabase_realtime add table public.members;
alter publication supabase_realtime add table public.vacations;
