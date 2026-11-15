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
-- supabase/functions/register-push/index.ts in step — they are deliberately identical.
--
-- NOT VALID on purpose. Existing rows are not scanned and not rejected: the table may already hold
-- legacy rows that do not match, and failing this migration on them would be worse than leaving
-- them for daily-push's cleanup to remove (a CHECK constraint never blocks a DELETE, so cleanup
-- still drains them). The constraint IS enforced for every subsequent insert and update, which is
-- what closes the hole. Once the table is clean, promote it with the one-liner in
-- supabase/functions/README.md:
--   alter table public.push_tokens validate constraint push_tokens_token_format;

alter table public.push_tokens
  drop constraint if exists push_tokens_token_format;

alter table public.push_tokens
  add constraint push_tokens_token_format
  check (token ~ '^[0-9a-f]{64,200}$')
  not valid;
