-- Dedupe: 20260710220703_launch_hardening.sql and 20260710220843_ticket_rate_caps.sql landed
-- back to back (two independent passes at the same launch-hardening spec) and both created a
-- working set of objects for the same two features (hourly ticket cap, daily triage ceiling).
-- The Edge Function code was reconciled to the ticket_rate_caps.sql naming (triage_permit /
-- triage_daily; daily-push reuses push_state.last_build_hash rather than a new column), so this
-- drops the now-unused duplicate objects from launch_hardening.sql. Both tables were empty
-- (verified before dropping) and tg_tickets_hourly_cap / the tickets_status_check constraint
-- were re-created identically by ticket_rate_caps.sql, so nothing behavioural changes here.
drop function if exists public.try_claim_triage_slot(int);
drop table if exists public.triage_usage;
alter table public.push_state drop column if exists last_today_hash;
