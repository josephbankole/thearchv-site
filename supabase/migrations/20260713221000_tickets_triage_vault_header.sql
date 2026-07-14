-- Sync the committed tickets_triage webhook trigger with what is actually live in production.
--
-- The original migration (20260619010000_tickets_triage_webhook.sql) predates the 2026-07-03
-- Vault-header fix: at the time it was written, TRIAGE_SECRET was deliberately unset to verify
-- the insert -> triage loop end to end, so that trigger calls support-triage with only the
-- publishable key. That fix has been live in production since 2026-07-03 (verified then via
-- 401 probes), but the fixed trigger definition was never committed as a migration. Left as-is,
-- a future `db push` / rebuild-from-migrations would silently drop back to the unsecured
-- 2026-06-19 version, re-opening support-triage (a paid Claude call) to anyone holding the
-- publishable key.
--
-- This migration recreates tg_tickets_triage() to match the CURRENT production definition,
-- re-applied live on 2026-07-14. It reads triage_secret from Vault and sends it as the
-- x-triage-secret header support-triage's guard expects.
--
-- HYGIENE 2026-07-14: the client-safe publishable/anon key (apikey + bearer needed to invoke
-- the Edge Function through the Supabase gateway) is now read from Vault ('publishable_key')
-- rather than written as a literal here. The key is not a secret (it ships in the iOS app
-- binary), but keeping literals out of the repo stops false-positive secret scans (GitGuardian
-- flagged the earlier literal) and matches how triage_secret/push_secret are already handled.
-- All three Vault secrets are set out-of-band (CLI/dashboard/`vault.create_secret`), not by a
-- migration, so a fresh replay onto a new environment must set publishable_key, triage_secret
-- and push_secret in Vault first — same operational step that already exists for the other two.

create extension if not exists pg_net;

create or replace function public.tg_tickets_triage()
returns trigger
language plpgsql
security definer
set search_path = public, net, vault
as $$
declare
  pub text := (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key');
begin
  perform net.http_post(
    url := 'https://fpsfnhjxczzyqurzbqpt.supabase.co/functions/v1/support-triage',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', pub,
      'Authorization', 'Bearer ' || pub,
      'x-triage-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'triage_secret')
    ),
    body := jsonb_build_object('record', to_jsonb(NEW))
  );
  return NEW;
end;
$$;

drop trigger if exists tickets_triage on public.tickets;
create trigger tickets_triage
after insert on public.tickets
for each row execute function public.tg_tickets_triage();
