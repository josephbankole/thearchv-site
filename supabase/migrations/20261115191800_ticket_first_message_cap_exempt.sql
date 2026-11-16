-- Ticket reply cap: a ticket's opening message is never refused (2026-11-15).
--
-- ticket-intake creates the ticket, then stores the user's question again as the ticket's first
-- ticket_messages row, which is what the in-app inbox shows. That insert went through the reply cap
-- (20261115160100), so while the shared user-reply budget was full a new ticket landed with no
-- question in its thread. This replaces the function behind ticket_messages_hourly_cap with the
-- same body plus one exemption, checked first: a user message on a ticket that has no user message
-- yet, whose text is the ticket's own body, is the intake's mirror and is let through. It cannot
-- be used for more than one free message per ticket, and tickets are capped on their own
-- (tickets_hourly_cap), so it adds no unbounded path. Every other message meets exactly the
-- layers it met before.
--
-- The abort marker is unchanged ('ticket_reply_rate_limited'). Safe to run twice: create or
-- replace, create index if not exists, and the trigger is dropped and re-created. The exemption's
-- lookup uses ticket_messages_ticket_idx (20260619000000).

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
  v_ticket_body text;
  effective_global_cap int;
  global_cap constant int := 200;
  older_ticket_reserve constant int := 100;
  ticket_cap constant int := 20;
  device_cap constant int := 60;
begin
  if NEW.author <> 'user' then
    return NEW;
  end if;

  select device_id, created_at, body into v_device, v_ticket_created, v_ticket_body
  from public.tickets where id = NEW.ticket_id;

  -- The intake's mirror of the ticket's own question: the first user message, same text.
  if NEW.body = v_ticket_body and not exists (
    select 1 from public.ticket_messages where ticket_id = NEW.ticket_id and author = 'user'
  ) then
    return NEW;
  end if;

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
