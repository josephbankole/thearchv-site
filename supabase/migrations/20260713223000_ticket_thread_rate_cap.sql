-- ticket-thread throttling (launch-critical review finding, 2026-07-13). ticket-thread lists a
-- device's ticket history (or one thread) from device_id alone with no rate limit at all --
-- enumeration is free for anyone who can guess or brute-force a device_id. Add a lightweight
-- per-device rate limit, enforced DB-side with the same BEFORE INSERT trigger pattern as the
-- ticket/push-token caps: every call logs a row to ticket_thread_requests before running its
-- query; the trigger caps that log insert at 30 per device_id per hour, so a device over the
-- cap fails closed (the log insert raises, the edge function catches it and returns 429)
-- before any lookup query runs.

create table if not exists public.ticket_thread_requests (
  id         uuid primary key default gen_random_uuid(),
  device_id  text not null,
  created_at timestamptz not null default now()
);
create index if not exists ticket_thread_requests_device_idx
  on public.ticket_thread_requests (device_id, created_at);
alter table public.ticket_thread_requests enable row level security;
-- No client policies: only ticket-thread (service role) writes here, same deny-all-by-default
-- model as tickets/ticket_messages/push_tokens.

create or replace function public.tg_ticket_thread_requests_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  device_cap constant int := 30;
begin
  select count(*) into n
  from public.ticket_thread_requests
  where device_id = NEW.device_id
    and created_at > now() - interval '1 hour';

  if n >= device_cap then
    raise exception 'ticket_thread_rate_limited'
      using hint = format('per-device cap of %s ticket-thread lookups per hour reached, try again later', device_cap);
  end if;

  return NEW;
end;
$$;
revoke execute on function public.tg_ticket_thread_requests_cap() from public, anon, authenticated;

drop trigger if exists ticket_thread_requests_cap on public.ticket_thread_requests;
create trigger ticket_thread_requests_cap
before insert on public.ticket_thread_requests
for each row execute function public.tg_ticket_thread_requests_cap();
