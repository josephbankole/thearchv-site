-- android_waitlist per-IP cap, ahead of the global hourly ceiling.
--
-- android-waitlist takes a write from anyone holding the publishable key, which ships in the
-- /app/ page. Until now its only volume control was the global 300 an hour trigger from
-- 20260722120000, so one source could spend the whole hour's ceiling, fill the count with
-- addresses nobody gave, and leave real visitors refused until the hour rolled over.
--
-- This adds a per-key hourly counter. The edge function claims one slot for a SHA-256 of the
-- client IP through waitlist_rate_claim before it inserts, and refuses with 429 once that IP is
-- over its cap (5 an hour, set in the function). No raw address is stored. The global trigger is
-- unchanged and stays the last resort.
--
-- The claim is one insert ... on conflict do update ... returning, which row-locks the bucket, so
-- concurrent claims queue on it and a burst cannot overshoot the cap. The window is a fixed hourly
-- bucket (date_trunc('hour', now())) because the upsert needs a discrete key to conflict on, the
-- same trade the daily triage counter makes. Rows older than a day are pruned on each claim, so
-- the table stays small.
--
-- What this does not do: make the forwarded IP a trust boundary. A determined caller can rotate
-- it, so this raises the cost of a flood rather than authenticating anyone. A challenge and double
-- opt-in are the founder's to decide (supabase/functions/README.md).
--
-- Safe to run twice. Order against the function deploy does not matter: until the function is
-- deployed nothing calls the RPC, and the function lets a signup through if the RPC is missing.

create table if not exists public.waitlist_rate_hits (
  limiter_key  text not null,
  window_start timestamptz not null,
  n            int not null default 0,
  primary key (limiter_key, window_start)
);
alter table public.waitlist_rate_hits enable row level security;
-- No client policies: only android-waitlist (service role, through the RPC below) touches this,
-- the same deny-all model as android_waitlist, tickets and push_tokens.

create index if not exists waitlist_rate_hits_window_idx
  on public.waitlist_rate_hits (window_start);

-- Claim one slot for p_key in the current hour. true = within the cap (allow), false = over.
create or replace function public.waitlist_rate_claim(p_key text, p_limit int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  delete from public.waitlist_rate_hits where window_start < now() - interval '1 day';
  insert into public.waitlist_rate_hits as r (limiter_key, window_start, n)
  values (p_key, date_trunc('hour', now()), 1)
  on conflict (limiter_key, window_start) do update set n = r.n + 1
  returning r.n into n;
  return n <= p_limit;
end;
$$;
revoke execute on function public.waitlist_rate_claim(text, int) from public, anon, authenticated;
grant execute on function public.waitlist_rate_claim(text, int) to service_role;
