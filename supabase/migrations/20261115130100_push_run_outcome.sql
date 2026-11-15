-- What the last daily-push fan-out for each sport actually delivered (2026-11-15). daily-push
-- records a lead as sent before it sends, which keeps the one-a-day promise, but until now the
-- APNs result went only into the HTTP reply, which nobody reads. A revoked key or a wrong APNS_ENV
-- made every send fail while last_sent_at stayed fresh, and health-probe stayed green.
--
-- daily-push now writes these after each fan-out, on the same row it records the lead on
-- (push_state for football, push_sport_state for the rest), and health-probe alerts when the last
-- run sent nothing, failed more than half its sends, or found more dead tokens than one run may
-- delete.
--
--   last_run_at       when the fan-out finished
--   last_run_claimed  tokens claimed for that send
--   last_run_sent     APNs answered 200
--   last_run_failed   every other answer, a thrown send included
--   last_run_dead     tokens APNs called BadDeviceToken or Unregistered
--   last_run_reasons  the most common failure reasons and their counts, at most five
--
-- Apply before deploying daily-push and health-probe. A daily-push without these columns logs the
-- failed write and still sends; a health-probe without them reports a read error. Safe to run twice.

alter table public.push_state
  add column if not exists last_run_at timestamptz,
  add column if not exists last_run_claimed int,
  add column if not exists last_run_sent int,
  add column if not exists last_run_failed int,
  add column if not exists last_run_dead int,
  add column if not exists last_run_reasons jsonb;

alter table public.push_sport_state
  add column if not exists last_run_at timestamptz,
  add column if not exists last_run_claimed int,
  add column if not exists last_run_sent int,
  add column if not exists last_run_failed int,
  add column if not exists last_run_dead int,
  add column if not exists last_run_reasons jsonb;
