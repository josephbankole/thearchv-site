-- Ticket reply cap (security audit 2026-10-06, finding "ticket-reply-unbounded"). ticket-reply checked
-- only the x-archv-app header and device ownership before inserting into ticket_messages, and no
-- trigger capped that table, so one ticket could absorb unlimited 5 KB messages. Same pattern as
-- tg_tickets_hourly_cap: a BEFORE INSERT trigger that raises a marker the function maps to 429.
-- Agent and system messages (author <> 'user') are never capped.

create or replace function public.tg_ticket_messages_hourly_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n_global int;
  n_ticket int;
  global_cap constant int := 200;
  ticket_cap constant int := 20;
begin
  if NEW.author <> 'user' then
    return NEW;
  end if;

  select count(*) into n_global
  from public.ticket_messages
  where author = 'user' and created_at > now() - interval '1 hour';
  if n_global >= global_cap then
    raise exception 'ticket_reply_rate_limited'
      using hint = format('global cap of %s user replies per hour reached, try again later', global_cap);
  end if;

  select count(*) into n_ticket
  from public.ticket_messages
  where ticket_id = NEW.ticket_id and author = 'user' and created_at > now() - interval '1 hour';
  if n_ticket >= ticket_cap then
    raise exception 'ticket_reply_rate_limited'
      using hint = format('per-ticket cap of %s user replies per hour reached, try again later', ticket_cap);
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

-- device_id length: real devices send a 36-char UUID (17 chars on early builds). Cap at 128 so an
-- arbitrary-length device_id cannot be stored. NOT VALID skips existing rows (all are <= 36 today).
alter table public.tickets drop constraint if exists tickets_device_id_len;
alter table public.tickets add constraint tickets_device_id_len check (char_length(device_id) <= 128) not valid;
alter table public.push_tokens drop constraint if exists push_tokens_device_id_len;
alter table public.push_tokens add constraint push_tokens_device_id_len check (char_length(device_id) <= 128) not valid;
