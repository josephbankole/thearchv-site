-- Ticket reply cap: a per-device layer and reserved headroom for older tickets (2026-11-15).
--
-- Replaces the function behind ticket_messages_hourly_cap (20261006230000), which allowed 200 user
-- replies an hour across everyone and 20 an hour per ticket. It keeps both and adds two layers,
-- after the per-device cap on the 2026-08-08 hardening branch (ea069e4, never applied) and the
-- returning-device reserve that 20261115160000 gives tickets:
--
--   * 60 user replies an hour per device, across all of that device's tickets, so opening more
--     tickets does not multiply one device's budget. The device is read from the parent ticket.
--   * 100 further slots above the shared 200, open only to replies on a ticket opened before the
--     current rolling hour, so replies on tickets opened this hour cannot use every slot. A reply
--     on a newer ticket sees the unchanged 200.
--
-- Nothing accepted before this migration by the per-ticket or global layers is refused by them
-- after it; the new per-device layer is the only added refusal, at 60 an hour, three times the
-- per-ticket cap. Agent and system messages (author <> 'user') are never capped, as before.
-- device_id is chosen by the app, so this raises the cost of filling the cap rather than removing
-- it; App Attest or DeviceCheck is the full fix and an app decision.
--
-- The abort marker is unchanged ('ticket_reply_rate_limited'), so ticket-reply's 429 mapping
-- works whichever is deployed first. Safe to run twice: create or replace, create index if not
-- exists, and the trigger is dropped and re-created.

create or replace function public.tg_ticket_messages_hourly_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n_global int;
  n_ticket int;
  n_device int;
  v_device text;
  v_ticket_created timestamptz;
  effective_global_cap int;
  global_cap constant int := 200;
  older_ticket_reserve constant int := 100;
  ticket_cap constant int := 20;
  device_cap constant int := 60;
begin
  if NEW.author <> 'user' then
    return NEW;
  end if;

  select device_id, created_at into v_device, v_ticket_created
  from public.tickets where id = NEW.ticket_id;

  effective_global_cap := global_cap
    + case when v_ticket_created <= now() - interval '1 hour' then older_ticket_reserve else 0 end;

  select count(*) into n_global
  from public.ticket_messages
  where author = 'user' and created_at > now() - interval '1 hour';
  if n_global >= effective_global_cap then
    raise exception 'ticket_reply_rate_limited'
      using hint = format('global cap of %s user replies per hour reached, try again later', effective_global_cap);
  end if;

  select count(*) into n_ticket
  from public.ticket_messages
  where ticket_id = NEW.ticket_id and author = 'user' and created_at > now() - interval '1 hour';
  if n_ticket >= ticket_cap then
    raise exception 'ticket_reply_rate_limited'
      using hint = format('per-ticket cap of %s user replies per hour reached, try again later', ticket_cap);
  end if;

  if v_device is not null then
    select count(*) into n_device
    from public.ticket_messages m
    join public.tickets t on t.id = m.ticket_id
    where t.device_id = v_device
      and m.author = 'user'
      and m.created_at > now() - interval '1 hour';
    if n_device >= device_cap then
      raise exception 'ticket_reply_rate_limited'
        using hint = format('per-device cap of %s user replies per hour reached, try again later', device_cap);
    end if;
  end if;

  return NEW;
end;
$$;
revoke execute on function public.tg_ticket_messages_hourly_cap() from public, anon, authenticated;

create index if not exists ticket_messages_user_created_idx
  on public.ticket_messages (created_at) where author = 'user';

drop trigger if exists ticket_messages_hourly_cap on public.ticket_messages;
create trigger ticket_messages_hourly_cap
before insert on public.ticket_messages
for each row execute function public.tg_ticket_messages_hourly_cap();
