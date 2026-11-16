-- retention_purge() checks (20261115200200). LOCAL DATABASE ONLY (supabase start, then):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/retention.sql
-- Runs in one transaction that is rolled back, and refuses to run unless tickets and push_tokens
-- start empty. A failure raises an exception that names the check; success prints one NOTICE.
begin;

do $$
declare
  old_done uuid;
  old_open uuid;
  old_done_recent_msg uuid;
  new_done uuid;
  result jsonb;
begin
  if exists (select 1 from public.tickets) or exists (select 1 from public.push_tokens) then
    raise exception 'retention.sql: tickets or push_tokens is not empty, run this against a fresh local database';
  end if;

  insert into public.tickets (device_id, body, status, created_at, updated_at)
    values ('ret-dev', 'old and resolved', 'resolved', now() - interval '13 months', now() - interval '13 months')
    returning id into old_done;
  insert into public.ticket_messages (ticket_id, author, body, created_at)
    values (old_done, 'l1', 'answer', now() - interval '13 months');

  insert into public.tickets (device_id, body, status, created_at, updated_at)
    values ('ret-dev', 'old and still open', 'escalated_l3', now() - interval '13 months', now() - interval '13 months')
    returning id into old_open;

  insert into public.tickets (device_id, body, status, created_at, updated_at)
    values ('ret-dev', 'old ticket, recent message', 'closed', now() - interval '13 months', now() - interval '13 months')
    returning id into old_done_recent_msg;
  insert into public.ticket_messages (ticket_id, author, body, created_at)
    values (old_done_recent_msg, 'l1', 'late note', now() - interval '2 months');

  insert into public.tickets (device_id, body, status, created_at, updated_at)
    values ('ret-dev', 'recent and resolved', 'resolved_l1', now() - interval '2 months', now() - interval '2 months')
    returning id into new_done;

  insert into public.push_tokens (device_id, token, opt_in, created_at, updated_at)
    values ('ret-dev', repeat('a', 64), false, now() - interval '40 days', now() - interval '40 days'),
           ('ret-dev', repeat('b', 64), false, now() - interval '10 days', now() - interval '10 days'),
           ('ret-dev', repeat('c', 64), true,  now() - interval '400 days', now() - interval '400 days');

  result := public.retention_purge();
  if result <> '{"tickets": 1, "push_tokens": 1}'::jsonb then
    raise exception 'FAIL retention: expected one ticket and one token deleted, got %', result;
  end if;

  if exists (select 1 from public.tickets where id = old_done)
     or exists (select 1 from public.ticket_messages where ticket_id = old_done) then
    raise exception 'FAIL retention: a resolved ticket past 12 months, or its messages, was kept';
  end if;
  if (select count(*) from public.tickets where id in (old_open, old_done_recent_msg, new_done)) <> 3 then
    raise exception 'FAIL retention: an open, recently messaged or recent ticket was deleted';
  end if;
  if exists (select 1 from public.push_tokens where token = repeat('a', 64)) then
    raise exception 'FAIL retention: a token switched off 40 days ago was kept';
  end if;
  if (select count(*) from public.push_tokens where token in (repeat('b', 64), repeat('c', 64))) <> 2 then
    raise exception 'FAIL retention: a recent opt-out or a switched-on token was deleted';
  end if;

  if not exists (select 1 from cron.job where jobname = 'archv-retention-purge') then
    raise exception 'FAIL retention: the archv-retention-purge cron job is not scheduled';
  end if;

  raise notice 'retention_purge: ok';
end $$;

rollback;
