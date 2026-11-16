-- Rate-cap trigger checks. LOCAL DATABASE ONLY (supabase start, then):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/rate_caps.sql
-- Everything runs in one transaction that is rolled back, and each block refuses to run unless the
-- tables it fills start empty, so it cannot count against or disturb real rows. A failure raises
-- an exception that names the check; success prints one NOTICE per check.
begin;

-- push_tokens_rate_cap: 60 new tokens an hour, 5 per device; a token that already has a row is
-- never counted, so an opt-out through the upsert path always lands (20261115120400).
do $$
declare
  i int;
  refused boolean := false;
  known text := lpad(to_hex(1), 64, '0');
begin
  if exists (select 1 from public.push_tokens) then
    raise exception 'rate_caps.sql: push_tokens is not empty, run this against a fresh local database';
  end if;

  for i in 1..60 loop
    insert into public.push_tokens (device_id, token) values ('dev' || (i % 12), lpad(to_hex(i), 64, '0'));
  end loop;

  begin
    insert into public.push_tokens (device_id, token) values ('fresh-device', repeat('f', 64));
  exception when others then
    if sqlerrm = 'push_token_rate_limited' then refused := true; else raise; end if;
  end;
  if not refused then
    raise exception 'FAIL push cap: the 61st new token in the hour was not refused';
  end if;

  insert into public.push_tokens (device_id, token, opt_in) values ('dev1', known, false)
    on conflict (token) do update set opt_in = excluded.opt_in;
  if (select opt_in from public.push_tokens where token = known) then
    raise exception 'FAIL push cap: an opt-out for a known token did not land with the cap full';
  end if;

  raise notice 'push_tokens_rate_cap: ok';
end $$;

-- ticket_messages_hourly_cap: 20 user replies per ticket an hour; agent and system messages are
-- never capped.
do $$
declare
  t uuid;
  i int;
  refused boolean := false;
begin
  if exists (select 1 from public.tickets) then
    raise exception 'rate_caps.sql: tickets is not empty, run this against a fresh local database';
  end if;

  insert into public.tickets (device_id, body) values ('cap-test-device', 'cap test') returning id into t;
  for i in 1..20 loop
    insert into public.ticket_messages (ticket_id, author, body) values (t, 'user', 'reply ' || i);
  end loop;

  begin
    insert into public.ticket_messages (ticket_id, author, body) values (t, 'user', 'one too many');
  exception when others then
    if sqlerrm = 'ticket_reply_rate_limited' then refused := true; else raise; end if;
  end;
  if not refused then
    raise exception 'FAIL reply cap: the 21st user reply on one ticket was not refused';
  end if;

  insert into public.ticket_messages (ticket_id, author, body) values (t, 'l1', 'agent reply still lands');

  raise notice 'ticket_messages_hourly_cap: ok';
end $$;

-- push_tokens_token_format (20261115120300): validated, so no out-of-shape row can sit in a
-- claim_push_tokens chunk and fail the whole UPDATE; a malformed token is refused on insert.
do $$
declare
  refused boolean := false;
  claimed int;
begin
  if not (select convalidated from pg_constraint where conname = 'push_tokens_token_format') then
    raise exception 'FAIL token format: push_tokens_token_format is not validated';
  end if;

  begin
    insert into public.push_tokens (device_id, token) values ('fmt-device', 'not-a-token');
  exception when check_violation then
    refused := true;
  end;
  if not refused then
    raise exception 'FAIL token format: a malformed token was stored';
  end if;

  select count(*) into claimed
    from public.claim_push_tokens(
      array[lpad(to_hex(2), 64, '0'), lpad(to_hex(3), 64, '0'), 'not-a-token'], current_date);
  if claimed <> 2 then
    raise exception 'FAIL token format: claim_push_tokens returned % rows, expected 2', claimed;
  end if;

  raise notice 'push_tokens_token_format: ok';
end $$;

-- tickets_hourly_cap reserve (20261115155900) and the reply cap's per-device layer
-- (20261115160100). Starts from the reply block's rows, which are removed first: the reply block
-- has already proved tickets started empty.
do $$
declare
  i int;
  t uuid;
  refused boolean := false;
  tickets uuid[] := '{}';
begin
  delete from public.ticket_messages;
  delete from public.tickets;

  insert into public.tickets (device_id, body, created_at)
    values ('old-device', 'filed earlier', now() - interval '2 hours');
  for i in 1..30 loop
    insert into public.tickets (device_id, body) values ('new-dev' || (i % 10), 'flood ' || i);
  end loop;

  begin
    insert into public.tickets (device_id, body) values ('never-seen', 'one too many');
  exception when others then
    if sqlerrm = 'ticket_rate_limited' then refused := true; else raise; end if;
  end;
  if not refused then
    raise exception 'FAIL ticket reserve: the 31st ticket this hour from a new device was not refused';
  end if;

  insert into public.tickets (device_id, body) values ('old-device', 'returning device still lands');
  raise notice 'tickets_hourly_cap reserve: ok';

  delete from public.ticket_messages;
  delete from public.tickets;
  for i in 1..4 loop
    insert into public.tickets (device_id, body) values ('busy-device', 'ticket ' || i) returning id into t;
    tickets := tickets || t;
  end loop;
  for i in 1..60 loop
    insert into public.ticket_messages (ticket_id, author, body)
      values (tickets[1 + ((i - 1) / 20)], 'user', 'reply ' || i);
  end loop;

  refused := false;
  begin
    insert into public.ticket_messages (ticket_id, author, body) values (tickets[4], 'user', 'one too many');
  exception when others then
    if sqlerrm = 'ticket_reply_rate_limited' then refused := true; else raise; end if;
  end;
  if not refused then
    raise exception 'FAIL reply cap: the 61st reply this hour from one device was not refused';
  end if;

  raise notice 'ticket_messages_hourly_cap per device: ok';
end $$;

-- The reply cap lets a ticket's opening message through (20261115191800): with the shared
-- 200-an-hour budget full, ticket-intake's mirror of a new ticket's body still lands, and the next
-- user message on that ticket is refused as before.
do $$
declare
  i int;
  t uuid;
  refused boolean := false;
begin
  delete from public.ticket_messages;
  delete from public.tickets;
  for i in 0..9 loop
    insert into public.tickets (device_id, body) values ('fill-dev' || (i % 5), 'fill ' || i) returning id into t;
    for k in 1..20 loop
      insert into public.ticket_messages (ticket_id, author, body) values (t, 'user', 'reply ' || k);
    end loop;
  end loop;

  insert into public.tickets (device_id, body) values ('fresh-device', 'my question') returning id into t;
  insert into public.ticket_messages (ticket_id, author, body) values (t, 'user', 'my question');

  begin
    insert into public.ticket_messages (ticket_id, author, body) values (t, 'user', 'my question');
  exception when others then
    if sqlerrm = 'ticket_reply_rate_limited' then refused := true; else raise; end if;
  end;
  if not refused then
    raise exception 'FAIL reply cap: a second user message with the global budget full was not refused';
  end if;

  raise notice 'ticket_messages_hourly_cap first message: ok';
end $$;

-- ticket_thread_requests (20261115191900): 30 lookups per device an hour, 3,000 across all
-- devices, and no device_id over 128 characters.
do $$
declare
  i int;
  refused boolean := false;
begin
  if exists (select 1 from public.ticket_thread_requests) then
    raise exception 'rate_caps.sql: ticket_thread_requests is not empty, run this against a fresh local database';
  end if;

  begin
    insert into public.ticket_thread_requests (device_id) values (repeat('x', 129));
  exception when check_violation then refused := true;
  end;
  if not refused then
    raise exception 'FAIL thread cap: a 129-character device_id was stored';
  end if;

  for i in 0..29 loop
    insert into public.ticket_thread_requests (device_id) values ('thread-dev0');
  end loop;

  refused := false;
  begin
    insert into public.ticket_thread_requests (device_id) values ('thread-dev0');
  exception when others then
    if sqlerrm = 'ticket_thread_rate_limited' then refused := true; else raise; end if;
  end;
  if not refused then
    raise exception 'FAIL thread cap: a 31st lookup from one device was not refused';
  end if;

  for i in 30..2999 loop
    insert into public.ticket_thread_requests (device_id) values ('thread-dev' || (i / 30));
  end loop;

  refused := false;
  begin
    insert into public.ticket_thread_requests (device_id) values ('never-seen-device');
  exception when others then
    if sqlerrm = 'ticket_thread_rate_limited' then refused := true; else raise; end if;
  end;
  if not refused then
    raise exception 'FAIL thread cap: a lookup past 3,000 this hour was not refused';
  end if;

  raise notice 'ticket_thread_requests_cap: ok';
end $$;

-- _rate_cap_lock (20261115200000): every capped table takes the table lock in a BEFORE INSERT row
-- trigger that fires before its cap, so concurrent inserts count one at a time. A single session
-- cannot race itself, so this checks the wiring: the lock trigger exists and sorts first.
do $$
declare
  t text;
  first_trigger text;
begin
  foreach t in array array['tickets', 'ticket_messages', 'push_tokens', 'ticket_thread_requests',
                           'android_waitlist'] loop
    select tgname into first_trigger
    from pg_trigger
    where tgrelid = ('public.' || t)::regclass
      and not tgisinternal
      and (tgtype & 1) = 1   -- row level
      and (tgtype & 2) = 2   -- before
      and (tgtype & 4) = 4   -- insert
    order by tgname collate "C"
    limit 1;
    if first_trigger is distinct from '_rate_cap_lock' then
      raise exception 'FAIL rate cap lock: the first BEFORE INSERT trigger on % is %, not _rate_cap_lock',
        t, coalesce(first_trigger, 'none');
    end if;
  end loop;
  raise notice '_rate_cap_lock: ok';
end $$;

rollback;
