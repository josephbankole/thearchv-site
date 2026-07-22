-- android_waitlist atomic hourly cap (security sweep 2026-07-22).
--
-- The android-waitlist edge function previously enforced its 300/hour ceiling with a
-- read-then-write HEAD count probe. That probe had two defects: (1) a TOCTOU race — concurrent
-- bursts each read a count below the cap and all inserted, blowing past 300; and (2) it failed
-- OPEN — if the probe fetch threw, the code fell through and inserted anyway. Move the ceiling
-- into a single atomic BEFORE INSERT trigger that fails CLOSED: an insert either lands under the
-- cap or the trigger aborts it. Mirrors tg_push_tokens_rate_cap (20260713220000) and the tickets
-- cap. The edge function now translates the abort marker to a 429.
--
-- This table was created out-of-band (no prior migration existed — flagged by the sweep), so
-- this migration also declares it idempotently for reproducibility on a fresh `db reset`. Every
-- statement is a no-op against the live table, which already has these objects.

create table if not exists public.android_waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  source text,
  user_agent text,
  created_at timestamptz not null default now()
);

-- The edge function relies on this for Prefer: resolution=ignore-duplicates (a repeat signup is
-- a no-op, not a second row). Name matches the existing live index, so this is a no-op there.
create unique index if not exists android_waitlist_email_key
  on public.android_waitlist (lower(email));

-- Supports the trigger's rolling-hour count and the newest-first admin read.
create index if not exists android_waitlist_created_at_idx
  on public.android_waitlist (created_at desc);

-- Deny-all: only the edge function's service_role writes here (RLS is bypassed by service_role).
-- No policies = no anon/authenticated access, which is the intended posture.
alter table public.android_waitlist enable row level security;

create or replace function public.tg_android_waitlist_rate_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_cap constant int := 300;
begin
  select count(*) into v_count
  from public.android_waitlist
  where created_at > now() - interval '1 hour';

  if v_count >= v_cap then
    raise exception 'waitlist_rate_limited'
      using hint = format('global cap of %s waitlist inserts per hour reached, try again later', v_cap);
  end if;

  return NEW;
end;
$$;
revoke execute on function public.tg_android_waitlist_rate_cap() from public, anon, authenticated;

drop trigger if exists android_waitlist_rate_cap on public.android_waitlist;
create trigger android_waitlist_rate_cap
before insert on public.android_waitlist
for each row execute function public.tg_android_waitlist_rate_cap();
