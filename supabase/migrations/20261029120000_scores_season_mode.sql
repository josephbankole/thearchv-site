-- Season mode for scores-poll (2026-10-29): per-team fixtures and results, forward days and match
-- previews. Own one-row state, own cron job (a separate migration,
-- 20261029120100_scores_season_cron.sql), same function. Apply this BEFORE deploying the function
-- that carries season mode. A season call that cannot read this row makes no API request and writes
-- no file, so the order is safe either way. Every statement is idempotent.
--
-- The Supabase MCP's apply_migration records its own timestamp as the version: rename this file to
-- the version it returns, in the same commit (see supabase/functions/README.md).

-- scores_season_state: what one season call leaves for the next, in a single row (id 1). The season
-- the held listings belong to, when each competition's season listing was last fetched, the last good
-- listing per competition (MATCH objects, about 700 in all), when each build step last ran, the
-- content hash of every file this mode last wrote (pruned on every write), API-Football's daily count
-- left and when it was read, and a back-off after an API error. Only the function (service role)
-- reads and writes it; the minute poll's scores_poll_state is never touched by this mode.
create table if not exists public.scores_season_state (
  id            integer primary key check (id = 1),
  season        integer,
  listed_at     jsonb not null default '{}'::jsonb,
  matches       jsonb not null default '{}'::jsonb,
  built_at      jsonb not null default '{}'::jsonb,
  file_hashes   jsonb not null default '{}'::jsonb,
  remaining     integer,
  remaining_at  timestamptz,
  backoff_until timestamptz,
  updated_at    timestamptz not null default now()
);

-- Row-level security on and no policy: anon and authenticated get nothing, the service role
-- bypasses it.
alter table public.scores_season_state enable row level security;
revoke all on table public.scores_season_state from anon, authenticated;

insert into public.scores_season_state (id) values (1) on conflict (id) do nothing;
