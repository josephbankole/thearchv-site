-- Launch hardening (2026-07-10): daily-push lead-story keying, ticket-intake rate caps.
-- Applied live via the Supabase MCP / CLI on 2026-07-10 (see ACTION-PLAN-LAUNCH.md section B).
-- Kept here so the schema change is reproducible, matching the pattern used by the earlier
-- tickets_triage_webhook.sql migration.

-- ---------- Task 1: push_state gets its own "today feed" hash column ----------
-- daily-push used to key off the combined buildHash across all six feeds, so an unrelated
-- feed edit (posters, leagues, archive) could burn the day's one push slot on a stale lead
-- story. It now keys on the TODAY feed's own hash (see feed/index.json's per-feed "today"
-- entry). We add a new column instead of reinterpreting last_build_hash, and deliberately
-- leave it NULL on migration (no backfill): a NULL never matches an incoming hash, so the
-- "already sent this exact hash" fast-path is skipped and the function falls back to the
-- unchanged once-a-day last_sent_at guard, which is what actually protects against a
-- duplicate send today. This fails toward under-sending (skipping/delaying a send) rather
-- than over-sending, which is the correct direction for a promise capped at one push a day.
alter table public.push_state add column if not exists last_today_hash text;

-- ---------- Task 3a: hourly ticket insert cap ----------
-- DB-enforced so it cannot be bypassed by the client: RLS already denies the anon/publishable
-- key any direct write to public.tickets (all inserts go through ticket-intake's service-role
-- client), and this trigger additionally caps that service-role insert path itself, so a bug,
-- retry storm, or future change to ticket-intake can't silently blow past the ceiling.
-- Default: 30 tickets/hour, global (see final report for rationale).
create or replace function public.tg_tickets_hourly_cap()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_count int;
  v_cap constant int := 30;
begin
  select count(*) into v_count
  from public.tickets
  where created_at > now() - interval '1 hour';

  if v_count >= v_cap then
    raise exception 'ticket insert rate cap reached (% per hour)', v_cap
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists tickets_hourly_cap on public.tickets;
create trigger tickets_hourly_cap
before insert on public.tickets
for each row execute function public.tg_tickets_hourly_cap();

-- ---------- Task 3b: daily ceiling on paid triage calls ----------
-- support-triage claims a slot (atomically) before calling the paid Anthropic API. Once the
-- day's slots are gone, the ticket stays inserted and is left as 'pending_triage' for later
-- processing instead of firing another paid call. Default: 100 claims/day (see final report).
create table if not exists public.triage_usage (
  usage_date date primary key,
  calls int not null default 0
);
alter table public.triage_usage enable row level security;
-- No client policies: only try_claim_triage_slot() (security definer) touches this table.

create or replace function public.try_claim_triage_slot(p_cap int default 100)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_calls int;
begin
  insert into public.triage_usage (usage_date, calls)
  values (v_today, 0)
  on conflict (usage_date) do nothing;

  -- Atomic claim: the UPDATE only succeeds (and only then increments) while under the cap,
  -- and the row-level lock during the UPDATE makes concurrent claims from parallel ticket
  -- inserts safe -- no separate check-then-increment race.
  update public.triage_usage
  set calls = calls + 1
  where usage_date = v_today and calls < p_cap
  returning calls into v_calls;

  return v_calls is not null;
end;
$$;

-- Only the service role (Edge Functions) may claim a slot; the publishable/anon key cannot
-- call this directly to inflate or exhaust the counter.
revoke execute on function public.try_claim_triage_slot(int) from public, anon, authenticated;
grant execute on function public.try_claim_triage_slot(int) to service_role;

-- Allow 'pending_triage' as a ticket status (Task 3b's deferred-triage queue state).
alter table public.tickets drop constraint if exists tickets_status_check;
alter table public.tickets add constraint tickets_status_check
  check (status in ('new','pending_triage','l1_working','resolved_l1','l2_working',
                     'resolved_l2','escalated_l3','resolved','closed'));
