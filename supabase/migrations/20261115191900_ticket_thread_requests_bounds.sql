-- ticket_thread_requests, the log ticket-thread writes one row to per call so its trigger can cap
-- lookups at 30 per device an hour (20260713223000), had no bound of its own (2026-11-15): no limit
-- on device_id's length, no ceiling across devices, and nothing ever removed a row, so a caller
-- with a fresh device_id on every call grew it without end. This adds:
--
--   * a 128-character limit on device_id, as tickets and push_tokens have (20261006230000).
--     ticket-thread refuses a longer one before the insert as well. Real devices send 36 (a UUID)
--     or 17 on early builds.
--   * a ceiling of 3,000 lookups an hour across all devices, a hundred devices at the per-device
--     cap, so new device_ids cannot add rows without limit. Over it, every caller gets the same
--     429 as the per-device cap, until the hour rolls on.
--   * a pg_cron job, every 15 minutes, deleting rows older than 2 hours. The caps only look one
--     hour back, so nothing they read is removed, and the count stays cheap.
--
-- The abort marker is unchanged ('ticket_thread_rate_limited'), so ticket-thread's 429 mapping
-- works whichever is deployed first. Safe to run twice.

create extension if not exists pg_cron;

-- Rows past the window are no longer read by anything; out-of-shape ones are noise. Clearing both
-- first lets the length check go in validated.
delete from public.ticket_thread_requests
 where created_at < now() - interval '2 hours' or char_length(device_id) > 128;

alter table public.ticket_thread_requests drop constraint if exists ticket_thread_requests_device_id_len;
alter table public.ticket_thread_requests
  add constraint ticket_thread_requests_device_id_len check (char_length(device_id) <= 128);

create index if not exists ticket_thread_requests_created_idx
  on public.ticket_thread_requests (created_at);

create or replace function public.tg_ticket_thread_requests_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  n_global int;
  device_cap constant int := 30;
  global_cap constant int := 3000;
begin
  select count(*) into n_global
  from public.ticket_thread_requests
  where created_at > now() - interval '1 hour';

  if n_global >= global_cap then
    raise exception 'ticket_thread_rate_limited'
      using hint = format('global cap of %s ticket-thread lookups per hour reached, try again later', global_cap);
  end if;

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

select cron.unschedule('ticket-thread-requests-prune')
 where exists (select 1 from cron.job where jobname = 'ticket-thread-requests-prune');

select cron.schedule(
  'ticket-thread-requests-prune',
  '*/15 * * * *',
  $$ delete from public.ticket_thread_requests where created_at < now() - interval '2 hours' $$
);
