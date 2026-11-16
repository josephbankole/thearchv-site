-- Retention: delete support tickets and switched-off push tokens once they are no longer needed
-- (2026-11-15).
--
-- Nothing removed these rows before, so a ticket's email and text, and the token of a reader who
-- turned the daily push off, were kept with no end. This adds one function and one daily pg_cron
-- job. The periods are defaults, set here in one place for the founder to change:
--
--   * A ticket whose status is finished (resolved_l1, resolved_l2, resolved or closed), with no
--     change to the ticket and no new message for 12 months, is deleted. Its messages go with it
--     (ticket_messages references tickets on delete cascade). A ticket still open or escalated is
--     never deleted by this, whatever its age: it needs an answer first.
--   * A push token switched off (opt_in false) and not changed for 30 days is deleted. A reader who
--     turns the push back on after that simply registers again, which is the same path a new
--     install takes. Tokens still switched on are left to daily-push's dead-token cleanup, which
--     removes the ones Apple reports gone.
--
-- Already bounded elsewhere: ticket_thread_requests (deleted after 2 hours, 20261115191900) and
-- waitlist_rate_hits (after a day, 20261115180000). Not covered: android_waitlist, which is kept
-- until the Android launch email goes out, a date that is not set yet.
--
-- Deploy: database only. Safe to run twice: create or replace, and the job is replaced by name.

create extension if not exists pg_cron;

create or replace function public.retention_purge()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tickets int;
  v_tokens int;
  ticket_keep constant interval := interval '12 months';
  optout_keep constant interval := interval '30 days';
begin
  delete from public.tickets t
   where t.status in ('resolved_l1', 'resolved_l2', 'resolved', 'closed')
     and t.updated_at < now() - ticket_keep
     and not exists (
       select 1 from public.ticket_messages m
        where m.ticket_id = t.id and m.created_at >= now() - ticket_keep
     );
  get diagnostics v_tickets = row_count;

  delete from public.push_tokens
   where opt_in = false
     and updated_at < now() - optout_keep;
  get diagnostics v_tokens = row_count;

  return jsonb_build_object('tickets', v_tickets, 'push_tokens', v_tokens);
end;
$$;
revoke execute on function public.retention_purge() from public, anon, authenticated;

select cron.unschedule('archv-retention-purge')
 where exists (select 1 from cron.job where jobname = 'archv-retention-purge');

select cron.schedule(
  'archv-retention-purge',
  '40 3 * * *',
  $$ select public.retention_purge() $$
);
