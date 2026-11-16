-- push_tokens.token format check (written 2026-08-08 on the hardening branch, carried onto main
-- 2026-11-15 under a new timestamp). register-push accepted any non-empty string as an APNs device
-- token and the column carried no constraint, so junk tokens landed in the table for
-- free. Every junk row is a row daily-push will send to and get BadDeviceToken back for, and every
-- registration that creates one spends a slot from the 60-per-hour global cap
-- (20260713220000_push_token_rate_cap.sql) that the whole install base shares.
--
-- The rule is the same one register-push now enforces at the boundary: 64 to 200 lowercase hex
-- characters. The shipped iOS client produces exactly 64 (a 32-byte token rendered with
-- `String(format: "%02x", $0)`); the upper bound leaves room for Apple lengthening device tokens
-- without a migration. Keep this constraint and APNS_TOKEN_RE in
-- supabase/functions/register-push/handler.ts in step: they are deliberately identical.
--
-- The table is cleaned BEFORE the constraint goes on, and the constraint is added fully validated.
-- (An earlier draft added it NOT VALID and left legacy rows for daily-push to remove. That does
-- not work: Postgres checks a CHECK constraint on every UPDATE, valid or not, and
-- claim_push_tokens (20261012160124) claims a whole chunk of tokens in one UPDATE, so one
-- out-of-shape row would fail every claim in its chunk on every run and never be removed.)
--
--   1. Hex tokens stored in upper or mixed case are lowercased, unless the lowercase form already
--      has its own row (or another case variant got there first, newest last_seen wins), in which
--      case the duplicate is dropped in step 2.
--   2. Every row still out of shape is deleted. No such row can ever take a push.
--   3. The constraint is added and validated over the now-clean table.
--
-- Safe to run twice: on a clean table steps 1 and 2 touch nothing, and the constraint is dropped
-- and re-added. Run the count query in supabase/functions/README.md first to see how many rows
-- steps 1 and 2 will change.

update public.push_tokens as t
   set token = lower(t.token)
 where t.id in (
   select distinct on (lower(u.token)) u.id
     from public.push_tokens as u
    where u.token ~ '^[0-9a-fA-F]{64,200}$'
      and u.token <> lower(u.token)
      and not exists (select 1 from public.push_tokens as d where d.token = lower(u.token))
    order by lower(u.token), u.last_seen desc
 );

delete from public.push_tokens
 where token !~ '^[0-9a-f]{64,200}$';

alter table public.push_tokens
  drop constraint if exists push_tokens_token_format;

alter table public.push_tokens
  add constraint push_tokens_token_format
  check (token ~ '^[0-9a-f]{64,200}$');
