-- Take the default client grants off the app's tables (2026-11-15).
--
-- These tables were created with Supabase's default privileges, which grant anon and authenticated
-- full table rights. Row level security with no policies has kept every row out of reach, but that
-- left RLS as the only barrier: a permissive policy added by mistake, or RLS switched off while
-- debugging, would have opened them to the key the app and site ship with. This removes the grants,
-- as was already done for scores_poll_state, scores_season_state and health_alert_state. Nothing
-- reads these tables with a client key: every edge function uses the service role, which keeps its
-- rights, and the app only reaches them through those functions.
--
-- After this, a request to one of these tables with the public key answers 401 instead of an empty
-- result. RLS stays on as the second layer. New tables still pick up Supabase's default grants, so a
-- table added later needs its own revoke.
--
-- Deploy: database only. Safe to run twice; a table that does not exist yet is skipped.

do $$
declare
  t text;
begin
  foreach t in array array['tickets', 'ticket_messages', 'push_tokens', 'push_state', 'triage_daily',
                           'ticket_thread_requests', 'android_waitlist', 'push_sport_state',
                           'waitlist_rate_hits'] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on table public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;
