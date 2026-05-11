alter table public.vacations
  add column if not exists is_preliminary boolean not null default false;
