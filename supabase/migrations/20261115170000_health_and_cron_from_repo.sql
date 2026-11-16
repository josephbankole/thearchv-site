-- The health-probe debounce table and the three pg_cron jobs that so far existed only in the live
-- project (2026-11-15). Until now a project rebuilt from these migrations had no daily push, no
-- health probe and no triage drain scheduled, and health-probe's debounce table did not exist.
--
--   * health_alert_state: one row per health-probe check, the time of its last alert email. Only
--     the service role (health-probe) reads and writes it.
--   * daily-push (at :30 from 14:30 to 23:30 UTC), health-probe (every 30 minutes) and
--     triage-drain (hourly, :20), each calling its function with the guard secret read from Vault
--     at call time, the way scores-poll's job does (20261013170000), and a 60 second pg_net
--     timeout. The names, schedules and bodies are the live project's own, read from cron.job on
--     2026-11-16. The one change to a live job is triage-drain's timeout, which was pg_net's
--     5 second default. An earlier draft of this file scheduled the push as archv-daily-push at
--     :00 every hour, after the README; live never had that job, so applying the draft would have
--     left two push jobs. A job of that name is removed here if one exists.
--     The push schedule set here was moved to hourly the same day, by 20261116120000. Applying
--     this file again by itself puts daily-push back at :30, so apply 20261116120000 after it.
--
-- A job is (re)scheduled only when the Vault secret it needs is set. Where it is missing, the
-- migration raises a warning and leaves any existing job of that name exactly as it is, so a job
-- that works today is never swapped for one that would be refused with 401. Set push_secret and
-- triage_secret in Vault first (see supabase/RESTORE.md), then apply this again.
--
-- Before applying on the live project, compare the live jobs with the ones below:
--   select jobname, schedule, command from cron.job order by jobname;
-- Applying replaces a live job of the same name with the definition here. Safe to run twice.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- 1. health-probe's debounce state.
create table if not exists public.health_alert_state (
  check_name    text primary key,
  last_alert_at timestamptz not null default now()
);
alter table public.health_alert_state enable row level security;
-- No client policies, and no table privileges for the client roles either.
revoke all on table public.health_alert_state from anon, authenticated;

-- 2. The cron jobs.
do $$
declare
  have_push   boolean := exists (select 1 from vault.decrypted_secrets where name = 'push_secret');
  have_triage boolean := exists (select 1 from vault.decrypted_secrets where name = 'triage_secret');
begin
  if have_push then
    perform cron.unschedule(jobname) from cron.job
      where jobname in ('daily-push', 'archv-daily-push', 'health-probe');

    perform cron.schedule(
      'daily-push',
      '30 14-23 * * *',
      $job$ select net.http_post(
           url := 'https://fpsfnhjxczzyqurzbqpt.supabase.co/functions/v1/daily-push',
           headers := jsonb_build_object(
             'Content-Type', 'application/json',
             'x-push-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_secret')
           ),
           body := '{}'::jsonb,
           timeout_milliseconds := 60000
         ); $job$
    );

    perform cron.schedule(
      'health-probe',
      '*/30 * * * *',
      $job$ select net.http_post(
           url := 'https://fpsfnhjxczzyqurzbqpt.supabase.co/functions/v1/health-probe',
           headers := jsonb_build_object(
             'Content-Type', 'application/json',
             'x-push-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_secret')
           ),
           body := '{}'::jsonb,
           timeout_milliseconds := 60000
         ); $job$
    );
  else
    raise warning 'vault secret push_secret is not set: daily-push and health-probe were left as they are';
  end if;

  if have_triage then
    perform cron.unschedule(jobname) from cron.job where jobname = 'triage-drain';

    perform cron.schedule(
      'triage-drain',
      '20 * * * *',
      $job$ select net.http_post(
           url := 'https://fpsfnhjxczzyqurzbqpt.supabase.co/functions/v1/triage-drain',
           headers := jsonb_build_object(
             'Content-Type', 'application/json',
             'x-triage-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'triage_secret')
           ),
           body := '{}'::jsonb,
           timeout_milliseconds := 60000
         ); $job$
    );
  else
    raise warning 'vault secret triage_secret is not set: triage-drain was left as it is';
  end if;
end $$;
