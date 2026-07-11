-- Ticket-intake rate caps (launch hardening, 2026-07-10). Two layers:
--   1. DB-side: a global cap of 30 ticket inserts per rolling hour, enforced in a BEFORE INSERT
--      trigger. Fires for every insert regardless of role, so nothing holding the publishable key
--      (or any key) can flood past it; a blocked insert also never fires the triage webhook, so
--      floods never reach the paid Claude call.
--   2. Function-side bookkeeping: triage_daily + triage_permit() give support-triage an atomic
--      per-day counter so it can defer Claude calls past a daily ceiling (default 100/day).
--      Deferred tickets keep status 'pending_triage' (added to the check constraint) and are
--      never dropped.
-- Applied live via the Supabase migration API on 2026-07-10; kept here so it is reproducible.

-- 'pending_triage' joins the ticket lifecycle for deferred-triage tickets.
alter table public.tickets drop constraint if exists tickets_status_check;
alter table public.tickets add constraint tickets_status_check
  check (status in ('new','pending_triage','l1_working','resolved_l1','l2_working',
                    'resolved_l2','escalated_l3','resolved','closed'));

-- Layer 1: global hourly insert cap.
create or replace function public.tg_tickets_hourly_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  select count(*) into n from public.tickets where created_at > now() - interval '1 hour';
  if n >= 30 then
    raise exception 'ticket_rate_limited'
      using hint = 'global cap of 30 tickets per hour reached, try again later';
  end if;
  return NEW;
end;
$$;
revoke execute on function public.tg_tickets_hourly_cap() from public, anon, authenticated;

drop trigger if exists tickets_hourly_cap on public.tickets;
create trigger tickets_hourly_cap
before insert on public.tickets
for each row execute function public.tg_tickets_hourly_cap();

-- Layer 2: atomic daily counter for paid triage calls.
create table if not exists public.triage_daily (
  day   date primary key,
  calls int not null default 0
);
alter table public.triage_daily enable row level security;
-- No client policies: only the support-triage function (service role) touches this.

create or replace function public.triage_permit(p_limit int default 100)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  insert into public.triage_daily as t (day, calls) values (current_date, 1)
  on conflict (day) do update set calls = t.calls + 1
  returning calls into n;
  return n <= p_limit;
end;
$$;
revoke execute on function public.triage_permit(int) from public, anon, authenticated;
grant execute on function public.triage_permit(int) to service_role;
