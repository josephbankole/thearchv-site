-- Rate caps count under a lock, so a burst cannot overshoot them (2026-11-15).
--
-- Every BEFORE INSERT cap here (tickets, ticket_messages, push_tokens, ticket_thread_requests,
-- android_waitlist) counts the rolling hour and then raises. Under READ COMMITTED each concurrent
-- insert counts against a snapshot without the others' uncommitted rows, so a burst could land
-- past a ceiling by about the number of inserts in flight. This is the 2026-08-08 hardening
-- branch's fix (F3, 20260807230500_rate_caps_advisory_lock.sql) carried onto the current cap
-- functions: take a transaction-scoped advisory lock on the table before the count, so inserts
-- into the same table queue instead of racing. The lock is released at commit, and the next
-- holder's count then sees the row just committed.
--
-- F3 put the lock line inside each cap function. Those functions have been replaced several
-- times since (20261115120400, 160000, 191800, 191900), and any later `create or replace` would
-- silently drop a lock written inline. So the lock is its own BEFORE INSERT trigger instead,
-- named to sort first: Postgres fires triggers of the same kind in name order, and every cap
-- trigger's name starts with a letter, which sorts after '_' in the C collation trigger names use.
-- The cap functions themselves are unchanged, as is every limit, window, abort marker and hint.
--
-- One lock per insert, keyed (hashtext('archv_rate_cap'), hashtext(<table>)), the same key F3
-- used. The bucket is the whole table because every one of these tables now has a cap across all
-- devices (ticket_thread_requests gained one in 20261115191900), and a per-device lock would not
-- serialise that count. A transaction that inserts into two capped tables takes two locks; the
-- only writers are single-statement PostgREST calls from the edge functions, so no transaction
-- does that today. Xact locks, never session locks, so nothing can leak onto a pooled connection.
--
-- Cost: inserts into one table wait for each other for the length of the cap's count, a few
-- milliseconds. Deploy: database only, no function change. Safe to run twice: create or replace,
-- and each trigger is dropped and re-created.

create or replace function public.tg_rate_cap_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('archv_rate_cap'), hashtext(TG_TABLE_NAME));
  return NEW;
end;
$$;
revoke execute on function public.tg_rate_cap_lock() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['tickets', 'ticket_messages', 'push_tokens', 'ticket_thread_requests',
                           'android_waitlist'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists _rate_cap_lock on public.%I', t);
      execute format(
        'create trigger _rate_cap_lock before insert on public.%I '
        'for each row execute function public.tg_rate_cap_lock()', t);
    end if;
  end loop;
end $$;
