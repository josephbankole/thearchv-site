-- register-push rate caps (launch hardening, 2026-07-13). register-push was the only
-- app-facing endpoint with no insert cap: anyone holding the shipped publishable key could
-- bloat push_tokens for free, and daily-push's fan-out is sequential, so table bloat directly
-- attacks the known push ceiling. Mirrors the tickets_hourly_cap pattern
-- (20260710220843_ticket_rate_caps.sql) with a second, per-device layer since a single bad
-- actor churning device_id values would otherwise still be capped only by the global ceiling.
--
-- Two layers, both enforced in one BEFORE INSERT trigger so nothing holding any key (the
-- register-push edge function always writes via the service-role client; RLS already denies
-- the anon/publishable key any direct write) can bypass it:
--   1. Global: 60 inserts per rolling hour across all devices.
--   2. Per-device: 5 inserts per rolling hour for the same device_id.
-- Fires on every attempted insert -- including the conflict-driven path of the upsert
-- register-push performs (onConflict: "token") -- since Postgres always evaluates BEFORE
-- INSERT row triggers before deciding whether the row lands as an insert or an ON CONFLICT
-- update. That is the intended behaviour here: the cap is on call volume through this insert
-- path, not on the number of distinct rows that result.

create or replace function public.tg_push_tokens_rate_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_global_count int;
  v_device_count int;
  v_global_cap constant int := 60;
  v_device_cap constant int := 5;
begin
  select count(*) into v_global_count
  from public.push_tokens
  where created_at > now() - interval '1 hour';

  if v_global_count >= v_global_cap then
    raise exception 'push_token_rate_limited'
      using hint = format('global cap of %s push-token inserts per hour reached, try again later', v_global_cap);
  end if;

  select count(*) into v_device_count
  from public.push_tokens
  where device_id = NEW.device_id
    and created_at > now() - interval '1 hour';

  if v_device_count >= v_device_cap then
    raise exception 'push_token_rate_limited'
      using hint = format('per-device cap of %s push-token inserts per hour reached, try again later', v_device_cap);
  end if;

  return NEW;
end;
$$;
revoke execute on function public.tg_push_tokens_rate_cap() from public, anon, authenticated;

drop trigger if exists push_tokens_rate_cap on public.push_tokens;
create trigger push_tokens_rate_cap
before insert on public.push_tokens
for each row execute function public.tg_push_tokens_rate_cap();
