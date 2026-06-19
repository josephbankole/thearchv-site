-- The ARCHV app: initial schema (support tickets + push tokens).
-- Two ways to run this:
--   A) Dashboard: Supabase > SQL Editor > New query > paste this whole file > Run.
--   B) CLI: this file is already in supabase/migrations/, so run `supabase db push`.
--
-- SECURITY MODEL (important): Row Level Security is ON for every table, and there are
-- deliberately NO client policies. That means the app's public (anon) key can do nothing
-- to these tables directly. All reads and writes go through Supabase Edge Functions using
-- the service_role key server-side, after validating the request. This keeps every user's
-- support tickets private even though the app has no login.

create extension if not exists "pgcrypto";  -- provides gen_random_uuid()

-- updated_at helper
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

-- ---------- tickets ----------
create table if not exists public.tickets (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  device_id    text not null,                       -- anonymous device identifier
  email        text,                                -- optional, only if the user leaves one
  category     text not null default 'other'
                 check (category in ('bug','billing','content','account','other')),
  subject      text,
  body         text not null,
  app_version  text,
  platform     text not null default 'ios',
  status       text not null default 'new'
                 check (status in ('new','l1_working','resolved_l1','l2_working',
                                   'resolved_l2','escalated_l3','resolved','closed')),
  tier         text not null default 'l1' check (tier in ('l1','l2','l3')),
  priority     text not null default 'normal'
                 check (priority in ('low','normal','high','urgent'))
);
create index if not exists tickets_status_idx  on public.tickets (status);
create index if not exists tickets_device_idx  on public.tickets (device_id);
create index if not exists tickets_created_idx on public.tickets (created_at desc);

drop trigger if exists tickets_set_updated_at on public.tickets;
create trigger tickets_set_updated_at before update on public.tickets
  for each row execute function public.set_updated_at();

-- ---------- ticket messages (the thread behind the in-app inbox) ----------
create table if not exists public.ticket_messages (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.tickets(id) on delete cascade,
  created_at timestamptz not null default now(),
  author     text not null check (author in ('user','l1','l2','l3','system')),
  body       text not null,
  internal   boolean not null default false        -- internal notes, never shown to the user
);
create index if not exists ticket_messages_ticket_idx on public.ticket_messages (ticket_id, created_at);

-- ---------- push tokens ----------
create table if not exists public.push_tokens (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  device_id   text not null,
  token       text not null unique,                -- APNs device token
  opt_in      boolean not null default true,
  app_version text,
  platform    text not null default 'ios',
  last_seen   timestamptz not null default now()
);
create index if not exists push_tokens_optin_idx on public.push_tokens (opt_in) where opt_in;

drop trigger if exists push_tokens_set_updated_at on public.push_tokens;
create trigger push_tokens_set_updated_at before update on public.push_tokens
  for each row execute function public.set_updated_at();

-- ---------- lock everything to the client (deny-all) ----------
alter table public.tickets         enable row level security;
alter table public.ticket_messages enable row level security;
alter table public.push_tokens     enable row level security;
-- No policies are created on purpose: RLS on + no policy = the anon key can do nothing.
-- Edge Functions (service_role) do the work on the user's behalf.
