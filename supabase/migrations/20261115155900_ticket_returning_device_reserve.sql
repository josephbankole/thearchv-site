-- Ticket cap, layer 3: reserved headroom for returning devices (ported 2026-11-15 from the
-- 2026-08-08 hardening branch, where it was 20260808000000 and never applied).
--
-- tickets_hourly_cap (20260713222000) allows 30 tickets an hour across everyone and 5 an hour per
-- device_id. This adds 15 further slots above the 30 that only a device_id with a ticket from
-- before the current rolling hour can use, so a burst of new device_ids can no longer take every
-- slot. For a device with no earlier ticket the limits are unchanged (30 global, 5 per device), so
-- nothing accepted before this migration is refused after it.
--
-- Limits, stated so nobody reads more into it: device_id is chosen by the app, so this raises the
-- cost of filling the cap rather than removing it, and a first ticket from a new device is still
-- refused once the first 30 slots are used. A device identity the caller cannot choose (App Attest
-- or DeviceCheck) is the full fix and is an app and product decision, not a migration.
--
-- Cost: at most 15 more rows, and 15 more triage webhook calls, an hour. Paid Claude calls stay
-- capped at 100 a day by triage_permit().
--
-- Deploy: database only. The abort marker is still 'ticket_rate_limited', so ticket-intake's 429
-- mapping works whichever is deployed first. Safe to run twice: create or replace, and the trigger
-- is dropped and re-created.

create or replace function public.tg_tickets_hourly_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  n_device int;
  device_known_before_window boolean;
  effective_global_cap int;
  global_cap constant int := 30;
  returning_reserve constant int := 15;
  device_cap constant int := 5;
begin
  -- "Returning" = this device_id filed a ticket that predates the rolling window, so it cannot
  -- have been minted during the flood that is filling the window. Uses tickets_device_idx.
  select exists (
    select 1
    from public.tickets
    where device_id = NEW.device_id
      and created_at <= now() - interval '1 hour'
  ) into device_known_before_window;

  effective_global_cap := global_cap
    + case when device_known_before_window then returning_reserve else 0 end;

  select count(*) into n from public.tickets where created_at > now() - interval '1 hour';
  if n >= effective_global_cap then
    raise exception 'ticket_rate_limited'
      using hint = format('global cap of %s tickets per hour reached, try again later', effective_global_cap);
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
