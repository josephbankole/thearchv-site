-- Security hardening: pin a fixed search_path on set_updated_at().
-- Without this, the Supabase security advisor flags it as "function_search_path_mutable",
-- because a mutable search_path on a function can be abused to resolve unqualified names to
-- attacker-controlled objects. now() resolves from pg_catalog regardless of search_path.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
