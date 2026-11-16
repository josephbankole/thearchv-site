-- push_tokens rate cap: spare opt-outs and tokens we already hold (2026-11-15).
--
-- The cap (20260713220000_push_token_rate_cap.sql) is a BEFORE INSERT trigger, and Postgres runs
-- BEFORE INSERT row triggers before it resolves ON CONFLICT. register-push wrote every call through
-- an upsert, so once the shared hourly count was reached every call was refused, including a
-- reader switching the daily push off and a known device refreshing its row. register-push now
-- updates a known token in place (20261115120300 and the function change that ships with it), and
-- this makes the database hold the same line for any writer:
--
--   * A token that already has a row is never capped. The write resolves to an update of that row
--     and creates nothing, so it is not what the cap exists to count. This is the path every
--     opt-out, opt-back-in and sport change takes, so switching the push off always lands.
--
-- A token with no row is counted exactly as before (60 an hour globally, 5 an hour per device_id),
-- whatever its opt_in. A new token arriving with opt_in false is deliberately still capped: with
-- no row there is nothing to push to, so refusing it costs the reader nothing, while exempting it
-- would let anyone add rows without limit. Safe to run twice: create or replace, and the trigger is
-- dropped and re-created.

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
  if exists (select 1 from public.push_tokens where token = NEW.token) then
    return NEW;
  end if;

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
