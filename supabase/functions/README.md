# The ARCHV app: Supabase Edge Functions

App-facing endpoints. They are the only thing that touches the `tickets`, `ticket_messages`, and
`push_tokens` tables, using the service role server-side. The app calls them with the publishable
key and never sees the service role key.

| Function | Method | The app uses it to |
| --- | --- | --- |
| `ticket-intake` | POST | open a support ticket |
| `ticket-thread` | POST | read its ticket list, or one thread for the inbox |
| `ticket-reply` | POST | add a message to its own ticket |
| `register-push` | POST | register or update the daily-push token and opt-in |

## Deploy

You need the Supabase CLI once. Install it (`brew install supabase/tap/supabase`), then from
`thearchv-site/`:

```
supabase login
supabase link --project-ref fpsfnhjxczzyqurzbqpt
supabase functions deploy ticket-intake --no-verify-jwt
supabase functions deploy ticket-thread --no-verify-jwt
supabase functions deploy ticket-reply  --no-verify-jwt
supabase functions deploy register-push --no-verify-jwt
```

`--no-verify-jwt` is correct here: the app has no login, so there is no user token to verify. The
Supabase gateway still requires the project's publishable key to invoke a function, so these are
not open to the wider internet. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the
platform, so there are no secrets to set for these four.

## Test one quickly

Replace `PUBLISHABLE_KEY` with the `sb_publishable_...` key.

```
curl -i -X POST \
  "https://fpsfnhjxczzyqurzbqpt.supabase.co/functions/v1/ticket-intake" \
  -H "apikey: PUBLISHABLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"device_id":"test-device","category":"bug","body":"Testing the intake endpoint."}'
```

A `201` with a `ticket_id` means it works. Check the row in the Supabase Table Editor.

## Automatic triage: support-triage

`support-triage` runs the L1 agent automatically the moment a ticket is inserted. It reads the new
ticket, asks Claude (with the FAQ as the knowledge base) to resolve or escalate, writes the reply,
and updates the ticket. The FAQ is bundled in `_shared/faq.ts`, generated from the editable
`support/archv-app-faq.md` by `npm run faq` (re-run after editing the FAQ).

Secrets:
```
# Anthropic key (already set if you ran the secrets command earlier)
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
# A random guard so only the webhook can call this paid endpoint. Make one up, any long string.
supabase secrets set TRIAGE_SECRET=<a-long-random-string>

# Optional: email the founder when a ticket escalates to L3. Skipped cleanly until these are set.
supabase secrets set RESEND_API_KEY=re_...
supabase secrets set FOUNDER_EMAIL=folaban@gmail.com
supabase secrets set SUPPORT_FROM_EMAIL="The ARCHV <support@mail.thearchv.ca>"   # must be a Resend-verified domain
```

After adding the Resend secrets, redeploy so the function picks up the L3-email code:
`supabase functions deploy support-triage --no-verify-jwt`

Deploy:
```
supabase functions deploy support-triage --no-verify-jwt
```

Wire the database webhook (Dashboard):
1. Database, Webhooks, Create a new hook.
2. Table `public.tickets`, event `INSERT`.
3. Type "Supabase Edge Functions", choose `support-triage`.
4. Add an HTTP header: name `x-triage-secret`, value the same string you set as `TRIAGE_SECRET`.
5. Save. Now every new ticket is triaged within a second or two.

To test end to end: run the `ticket-intake` curl above, then check the ticket row. Within a moment
its status should move to `resolved_l1`, `l2_working`, or `escalated_l3`, and `ticket_messages`
should hold the L1 reply.

L2 still runs as the `archv-support-l2` Claude agent (it does deeper investigation that suits a
human-in-the-loop or scheduled run rather than a per-ticket function). L3 is you.

## Daily push: daily-push

`daily-push` sends one notification when a new build of the feed lands. It compares the feed manifest
against the `push_state` row, and if there is new content it sends the lead headline to every opted-in
device through APNs, then records what it sent so it never repeats or sends more than once a day.

It exits cleanly if the APNs key is not set yet, so it is safe to deploy and schedule before Apple
push is configured. Nothing happens until the secrets and some opted-in devices exist.

Secrets (set once you have the Apple push key from Apple Developer, step 3 in the founder guide):
```
supabase secrets set APNS_KEY="$(cat AuthKey_XXXXXX.p8)"   # the whole .p8 file, BEGIN/END included
supabase secrets set APNS_KEY_ID=XXXXXXXXXX
supabase secrets set APNS_TEAM_ID=YYYYYYYYYY
supabase secrets set APNS_BUNDLE_ID=ca.thearchv.reader
supabase secrets set APNS_ENV=sandbox      # sandbox for dev/TestFlight, production for App Store
supabase secrets set PUSH_SECRET=<a-long-random-string>   # optional guard, matched by the cron header
```

Deploy:
```
supabase functions deploy daily-push --no-verify-jwt
```

Schedule it with pg_cron (run in the SQL editor). This checks hourly and only sends when the build
changed, so it respects the one-a-day promise. Replace the secret if you set PUSH_SECRET:
```sql
select cron.schedule(
  'archv-daily-push',
  '0 * * * *',
  $$ select net.http_post(
       url := 'https://fpsfnhjxczzyqurzbqpt.supabase.co/functions/v1/daily-push',
       headers := jsonb_build_object('Content-Type','application/json','x-push-secret','<same-secret>')
     ); $$
);
```
