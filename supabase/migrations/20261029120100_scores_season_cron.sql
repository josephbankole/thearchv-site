-- Season mode's cron job (2026-10-29). Applied AFTER 20261029120000_scores_season_mode.sql and after
-- the function carrying season mode is deployed and its hand calls have been checked (README, season
-- mode deploy, step 5). The founder confirmed the API-Football terms on 2026-10-28 ("Allowed,
-- publish all"), which is the precondition this migration was held for. Idempotent: an existing job
-- of the same name is replaced.
--
-- Every 15 minutes, off the minute poll's busy :00: listings run in the :07, :22 and :37 slots of
-- 00, 06, 12 and 18 UTC (12 requests a day), every other call is a build step (season.ts). The
-- function can run for about 100 seconds on a previews build, so the caller waits 120.
--
-- Needs the vault secret push_secret, the same one the minute poll is called with.

create extension if not exists pg_net;
create extension if not exists pg_cron;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'push_secret') then
    raise warning 'scores-season: vault secret push_secret is not set; the cron call will be refused (401) until it is';
  end if;
end $$;

select cron.unschedule('scores-season')
 where exists (select 1 from cron.job where jobname = 'scores-season');

select cron.schedule(
  'scores-season',
  '7,22,37,52 * * * *',
  $$ select net.http_post(
       url := 'https://fpsfnhjxczzyqurzbqpt.supabase.co/functions/v1/scores-poll',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'x-push-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_secret')
       ),
       body := '{"mode":"season"}'::jsonb,
       timeout_milliseconds := 120000
     ); $$
);
