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
-- This migration recreates tg_tickets_triage() to match the CURRENT production definition
-- exactly, read live via `pg_get_functiondef` on 2026-07-13 (not modifying the historical
-- 20260619010000 file, which stays as a record of what was actually run that day). It reads
-- triage_secret from Vault and sends it as the x-triage-secret header support-triage's guard
-- expects; the two 'sb_publishable_...' values are the project's public, client-safe
-- publishable key (used as the standard 'apikey' + bearer auth needed to invoke any Edge
-- Function through the Supabase gateway), not a secret, so no Vault lookup is needed for those.

create extension if not exists pg_net;

create or replace function public.tg_tickets_triage()
returns trigger
language plpgsql
security definer
set search_path = public, net, vault
as $$
begin
  perform net.http_post(
    url := 'https://fpsfnhjxczzyqurzbqpt.supabase.co/functions/v1/support-triage',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_v3538BmUgl9pn-KPzD7g4g_aLZeuSjA',
      'Authorization', 'Bearer sb_publishable_v3538BmUgl9pn-KPzD7g4g_aLZeuSjA',
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
