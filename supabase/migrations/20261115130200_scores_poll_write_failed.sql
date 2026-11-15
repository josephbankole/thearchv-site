-- When scores-poll's current run of failed Storage uploads began (2026-11-15). The poller saves
-- its state row even when an upload fails, so schedule_fetched_at kept moving while scores.json
-- stayed frozen and health-probe saw nothing wrong.
--
--   write_failed_since  null while uploads land; the time of the first failed upload in an unbroken
--                       run of failures otherwise. A failed file is retried every minute, and the
--                       first run that reaches the files with no failure clears it.
--
-- health-probe's scores-write check alerts when it is more than 15 minutes old. scores-poll and
-- health-probe both read the row with select *, and scores-poll writes the column only once it
-- exists, so either can be deployed before or after this. Safe to run twice.

alter table public.scores_poll_state
  add column if not exists write_failed_since timestamptz;
