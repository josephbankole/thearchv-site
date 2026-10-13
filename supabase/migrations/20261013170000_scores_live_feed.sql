-- Live scores feed (founder decision 2026-10-13): the public bucket the scores-poll function
-- writes to, the one-row state table it keeps between runs, and the cron job that calls it every
-- minute.
--
-- Apply this BEFORE deploying scores-poll. The function reads scores_poll_state first and does
-- nothing if it cannot, so a function deployed ahead of this migration makes no API requests and
-- writes no files. Every statement is idempotent.
--
-- The cron call needs the vault secret push_secret, the same one daily-push is called with. It is
-- set out-of-band, like the others; a fresh environment must set it first.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- 1. The bucket. Public, so scores.json and match/<id>.json are served to anyone from
--    /storage/v1/object/public/live/... with no policy at all. storage.objects keeps row-level
--    security on and this migration adds no policy to it, so the API gives anon and authenticated
--    no way to list, write, overwrite or delete: only the service role (the function) can. The
--    limits are extra safeguards: JSON only, and 2 MB a file against about 7 KB for a match.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('live', 'live', true, 2097152, array['application/json'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. scores_poll_state: what one run leaves for the next, in a single row (id 1). The last good
--    match list, when the schedule was last fetched and for which Edmonton day, when each finished
--    match finished (so its two-hour tail has a start), the content hash of every file last
--    written (so an unchanged file is not written again), and a back-off after an API error.
--    Only the function (service role) reads and writes it.
create table if not exists public.scores_poll_state (
  id                  integer primary key check (id = 1),
  schedule_fetched_at timestamptz,
  window_day          date,
  matches             jsonb not null default '[]'::jsonb,
  finished_at         jsonb not null default '{}'::jsonb,
  file_hashes         jsonb not null default '{}'::jsonb,
  backoff_until       timestamptz,
  updated_at          timestamptz not null default now()
);
alter table public.scores_poll_state enable row level security;
-- No client policies, and no table privileges for the client roles either.
revoke all on table public.scores_poll_state from anon, authenticated;
insert into public.scores_poll_state (id) values (1) on conflict (id) do nothing;

-- 3. The cron job. Every minute; the function decides whether there is anything to ask the API.
--    timeout_milliseconds is 60000 for the reason daily-push's is: pg_net's default is 5 seconds.
do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'push_secret') then
    raise warning 'scores-poll: vault secret push_secret is not set; the cron call will be refused (401) until it is';
  end if;
end $$;

select cron.unschedule('scores-poll')
 where exists (select 1 from cron.job where jobname = 'scores-poll');

select cron.schedule(
  'scores-poll',
  '* * * * *',
  $$ select net.http_post(
       url := 'https://fpsfnhjxczzyqurzbqpt.supabase.co/functions/v1/scores-poll',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'x-push-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_secret')
       ),
       timeout_milliseconds := 60000
     ); $$
);
