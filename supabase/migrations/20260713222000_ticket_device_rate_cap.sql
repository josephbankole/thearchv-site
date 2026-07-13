-- Ticket cap, layer 2: per-device (launch-critical review finding, 2026-07-13). The existing
-- hourly cap (tg_tickets_hourly_cap, 20260710220843_ticket_rate_caps.sql) is global only: one
-- attacker sending 30 tickets in an hour consumes the whole hour's budget and locks out every
-- real user's support access for that hour. Add a second, per-device check inside the same
-- BEFORE INSERT trigger function so both layers are enforced atomically on every insert
-- attempt, same style as the existing global check (raise the same 'ticket_rate_limited'
-- marker so ticket-intake's existing error-message match keeps mapping this to a clean 429,
-- no function-side change needed).

create or replace function public.tg_tickets_hourly_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  n_device int;
  global_cap constant int := 30;
  device_cap constant int := 5;
begin
  select count(*) into n from public.tickets where created_at > now() - interval '1 hour';
  if n >= global_cap then
    raise exception 'ticket_rate_limited'
      using hint = format('global cap of %s tickets per hour reached, try again later', global_cap);
  end if;

  select count(*) into n_device
  from public.tickets
  where device_id = NEW.device_id
    and created_at > now() - interval '1 hour';
  if n_device >= device_cap then
    raise exception 'ticket_rate_limited'
      using hint = format('per-device cap of %s tickets per hour reached, try again later', device_cap);
  end if;

  return NEW;
end;
$$;
revoke execute on function public.tg_tickets_hourly_cap() from public, anon, authenticated;

-- Trigger definition is unchanged (same name, same function, same BEFORE INSERT timing); this
-- drop+recreate is here only so the migration is self-contained and reproducible standalone.
drop trigger if exists tickets_hourly_cap on public.tickets;
create trigger tickets_hourly_cap
before insert on public.tickets
for each row execute function public.tg_tickets_hourly_cap();
