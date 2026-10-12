-- Per-sport daily push (founder decision 2026-10-12, app review finding C37), with the guard
-- keyed on the lead's identity (C115) and one push a day per token across sports.
--
-- Apply this BEFORE deploying the daily-push and register-push that use it. The new daily-push
-- fails closed on a database without it: its token read selects push_tokens.sport, which errors,
-- so it sends nothing and records nothing. register-push writes sport only when the app sends
-- one, and no shipped build does yet. Every statement is idempotent.

-- 1. push_tokens.sport: the sport the reader picked on Home, as its feed key. Nullable on
--    purpose: every row from a build that never sent it stays null, and null means football,
--    which is the push every token got before this. The check is a shape check only, the same
--    shape as the app's Router.isFeedKey. Membership in the sport list lives in
--    supabase/functions/_shared/sports.ts, so adding a sport needs no migration.
alter table public.push_tokens add column if not exists sport text;
alter table public.push_tokens drop constraint if exists push_tokens_sport_shape;
alter table public.push_tokens add constraint push_tokens_sport_shape
  check (sport is null or sport ~ '^[a-z0-9-]{1,32}$');

-- 2. push_tokens.last_push_day: the editorial day (America/Edmonton) this token last got the
--    daily push. claim_push_tokens below sets it in the same statement that picks who to send
--    to, so a reader who switches sport during the day is not pushed twice that day.
alter table public.push_tokens add column if not exists last_push_day date;

-- 3. push_sport_state: one row per sport other than football, holding the guard push_state
--    holds for football. last_lead_key is the lead's identity (date|section|url), not a file
--    hash, so a publish in some other lane can no longer re-send an old lead. Football stays in
--    the push_state singleton (its last_build_hash column now holds the football lead key), which
--    health-probe reads; the check keeps a second football row from ever appearing here.
create table if not exists public.push_sport_state (
  sport         text primary key,
  last_lead_key text,
  last_sent_at  timestamptz,
  constraint push_sport_state_sport_shape check (sport ~ '^[a-z0-9-]{1,32}$' and sport <> 'football')
);
alter table public.push_sport_state enable row level security;
-- No client policies: only the daily-push function (service role) reads and writes this.

-- 4. claim_push_tokens: of the tokens daily-push is about to send one sport's lead to, mark the
--    ones that have not had a push this editorial day and return exactly those, in one atomic
--    UPDATE ... RETURNING. daily-push sends only to what comes back, after the claim, so the
--    claim is the record (at-most-once, as with push_state). An opted-out token is never
--    claimed. Service role only; search_path pinned empty, every name qualified.
create or replace function public.claim_push_tokens(p_tokens text[], p_day date)
returns table (token text)
language sql
set search_path = ''
as $$
  update public.push_tokens as t
     set last_push_day = p_day
   where t.token = any (p_tokens)
     and t.opt_in
     and (t.last_push_day is null or t.last_push_day < p_day)
  returning t.token;
$$;
revoke execute on function public.claim_push_tokens(text[], date) from public, anon, authenticated;
grant execute on function public.claim_push_tokens(text[], date) to service_role;
