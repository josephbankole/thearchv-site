-- Rate-cap trigger checks. LOCAL DATABASE ONLY (supabase start, then):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/rate_caps.sql
-- Everything runs in one transaction that is rolled back, and each block refuses to run unless the
-- tables it fills start empty, so it cannot count against or disturb real rows. A failure raises
-- an exception that names the check; success prints one NOTICE per check.
begin;

-- push_tokens_rate_cap: 60 new tokens an hour, 5 per device; a token that already has a row is
-- never counted, so an opt-out through the upsert path always lands (20261115120100).
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

-- push_tokens_token_format (20261115120000): validated, so no out-of-shape row can sit in a
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

rollback;
