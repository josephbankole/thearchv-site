-- Webhook: run support-triage automatically when a ticket is inserted.
-- Applied live via SQL on 2026-06-19. Kept here so the trigger is reproducible.
--
-- SECURITY NOTE: this version calls the function with the publishable key only, because the
-- TRIAGE_SECRET guard was unset to verify the loop end to end. It was re-secured on 2026-07-03
-- (the live trigger now reads triage_secret from Vault and sends x-triage-secret) and that state
-- is captured in 20260713221000_tickets_triage_vault_header.sql, which supersedes this one on
-- replay. This historical file is kept as the record of what ran on 2026-06-19.
--
-- HYGIENE 2026-07-14: the client-safe publishable/anon key is no longer written as a literal
-- here; it is read from Vault ('publishable_key', set out-of-band like triage_secret/push_secret).
-- The key is not a secret (it ships in the iOS app binary), but keeping literals out of the repo
-- stops false-positive secret scans and normalises the Vault pattern. Runtime behaviour of this
-- historical intermediate state is unchanged (same key value).

create extension if not exists pg_net;

create or replace function public.tg_tickets_triage()
returns trigger
language plpgsql
security definer
set search_path = public, net, extensions, vault
as $$
declare
  pub text := (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key');
begin
  perform net.http_post(
    url := 'https://fpsfnhjxczzyqurzbqpt.supabase.co/functions/v1/support-triage',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', pub,
      'Authorization', 'Bearer ' || pub
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
