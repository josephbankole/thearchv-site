-- waitlist_rate_hits on a schedule of its own (2026-11-15, be-support-6 review nit).
--
-- waitlist_rate_claim() (20261115180000) deletes counter rows older than a day, but only when
-- someone submits the waitlist form. With no submissions, the hashed IPs and counts from the last
-- busy hour stay with no end. This adds an hourly pg_cron job doing the same delete, so a hashed IP
-- is gone a day after its hour whether or not anyone signs up after it. The claim's own delete is
-- left in place; the two do the same thing and either may run first.
--
-- Deploy: database only. Safe to run twice: the job is replaced by name.

create extension if not exists pg_cron;

select cron.unschedule('waitlist-rate-hits-prune')
 where exists (select 1 from cron.job where jobname = 'waitlist-rate-hits-prune');

select cron.schedule(
  'waitlist-rate-hits-prune',
  '50 * * * *',
  $$ delete from public.waitlist_rate_hits where window_start < now() - interval '1 day' $$
);
