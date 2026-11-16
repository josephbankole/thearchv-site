-- daily-push moves to an hourly tick (founder, 16 November 2026: "Move it to align").
--
-- Until now the job ran at :30 from 14:30 to 23:30 UTC, hours set in cron (20261115170000 kept
-- them as the live project had them). daily-push now carries its own send window, 07:00 to 21:00
-- Edmonton time (inSendWindow in _shared/push_guard.ts), and skips outside it without recording
-- anything. So the job can tick every hour and leave the hours to the code, which follows
-- Edmonton's clock through daylight saving where a UTC range in cron does not.
--
-- What changes for readers: a push can go out on the hour from 07:00 to 20:00 Edmonton (09:00 to
-- 22:00 Toronto). It used to go at :30 from 14:30 to 23:30 UTC, which in winter is 07:30 to 16:30
-- Edmonton (09:30 to 18:30 Toronto). Still at most one a day for each sport: the once-a-day guard
-- is unchanged.
--
-- The job keeps its name and its command, word for word. Like 20261115170000, it is touched only
-- when the Vault secret it needs is set. Safe to run twice.

create extension if not exists pg_net;
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from vault.decrypted_secrets where name = 'push_secret') then
    perform cron.schedule(
      'daily-push',
      '0 * * * *',
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
  else
    raise warning 'vault secret push_secret is not set: daily-push was left as it is';
  end if;
end $$;
