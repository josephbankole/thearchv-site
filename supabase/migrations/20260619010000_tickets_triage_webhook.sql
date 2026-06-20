-- Webhook: run support-triage automatically when a ticket is inserted.
-- Applied live via SQL on 2026-06-19. Kept here so the trigger is reproducible.
--
-- SECURITY NOTE: this version calls the function with the publishable key only, because the
-- TRIAGE_SECRET guard was unset to verify the loop end to end. Before public launch, re-secure:
-- set TRIAGE_SECRET again, store the same value in Supabase Vault, and replace this trigger with
-- one that reads the secret from vault and sends it as the x-triage-secret header. Until then the
-- triage endpoint is callable by anyone holding the publishable key (low cost, no public users yet).

create extension if not exists pg_net;

create or replace function public.tg_tickets_triage()
returns trigger
language plpgsql
security definer
set search_path = public, net, extensions
as $$
begin
  perform net.http_post(
    url := 'https://fpsfnhjxczzyqurzbqpt.supabase.co/functions/v1/support-triage',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_v3538BmUgl9pn-KPzD7g4g_aLZeuSjA',
      'Authorization', 'Bearer sb_publishable_v3538BmUgl9pn-KPzD7g4g_aLZeuSjA'
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
