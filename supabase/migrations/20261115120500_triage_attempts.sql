-- Triage retries with an end (2026-11-15). A failed triage attempt used to leave a webhook ticket
-- at 'new', which nothing retries, and a drained ticket at 'pending_triage', where the hourly
-- oldest-first sweep picked the same failing tickets again every hour, spending the daily ceiling.
--
--   * tickets.triage_attempts counts failed attempts. The triage core sends a ticket to the
--     founder once it reaches 3, and triage-drain orders by it, then by created_at, so a ticket
--     that keeps failing falls behind new ones instead of holding the head of the queue.
--   * triage_record_failure(ticket) adds one and returns the new count, in one statement.
--   * triage_permit_release() gives back one call from today's triage_daily counter, for an
--     attempt that ended in an Anthropic API error and so made no paid call.
--   * Tickets already stranded by the old behaviour are put back in the queue once: a webhook
--     ticket left at 'new' and a reopened L1 ticket left at 'l1_working' go to 'pending_triage',
--     where triage-drain triages them with the thread. Only rows untouched for an hour move, so a
--     ticket whose webhook triage is still running is left to finish.
--
-- Apply before deploying support-triage and triage-drain: the drain's query orders by the new
-- column. Safe to run twice.

alter table public.tickets
  add column if not exists triage_attempts int not null default 0;

create index if not exists tickets_triage_queue_idx
  on public.tickets (triage_attempts, created_at)
  where status = 'pending_triage';

create or replace function public.triage_record_failure(p_ticket uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  update public.tickets
     set triage_attempts = triage_attempts + 1
   where id = p_ticket
  returning triage_attempts into n;
  return coalesce(n, 0);
end;
$$;
revoke execute on function public.triage_record_failure(uuid) from public, anon, authenticated;
grant execute on function public.triage_record_failure(uuid) to service_role;

create or replace function public.triage_permit_release()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.triage_daily
     set calls = greatest(calls - 1, 0)
   where day = current_date;
end;
$$;
revoke execute on function public.triage_permit_release() from public, anon, authenticated;
grant execute on function public.triage_permit_release() to service_role;

update public.tickets
   set status = 'pending_triage'
 where status in ('new', 'l1_working')
   and updated_at < now() - interval '1 hour';
