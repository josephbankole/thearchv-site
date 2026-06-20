-- push_state: a single row that records the last feed build we pushed for, so the daily-push job
-- sends at most one notification per new build and never repeats. Applied live 2026-06-19.
create table if not exists public.push_state (
  id int primary key default 1,
  last_build_hash text,
  last_sent_at timestamptz,
  constraint push_state_singleton check (id = 1)
);
insert into public.push_state (id) values (1) on conflict (id) do nothing;
alter table public.push_state enable row level security;
-- No client policies: only the daily-push function (service role) reads and writes this.
