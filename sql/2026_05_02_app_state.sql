-- Shared generator UI state. Single canonical row (id = 'generator').
-- Run once via Supabase SQL editor.

create table if not exists public.app_state (
  id text primary key,
  slot_0 uuid references public.players(id) on delete set null,
  slot_1 uuid references public.players(id) on delete set null,
  slot_2 uuid references public.players(id) on delete set null,
  slot_3 uuid references public.players(id) on delete set null,
  server text not null default 'sylvanas',
  opt_discord_name boolean not null default true,
  opt_code_block boolean not null default true,
  generated_at timestamptz,
  client_id text,
  updated_at timestamptz not null default now()
);

create or replace function public.app_state_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_state_touch_updated_at on public.app_state;
create trigger app_state_touch_updated_at
  before update on public.app_state
  for each row execute function public.app_state_touch_updated_at();

alter table public.app_state enable row level security;

drop policy if exists "app_state full access" on public.app_state;
create policy "app_state full access" on public.app_state
  for all using (true) with check (true);

-- Make sure realtime publishes changes from this table.
alter publication supabase_realtime add table public.app_state;

insert into public.app_state (id) values ('generator')
on conflict (id) do nothing;
