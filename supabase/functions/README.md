# The ARCHV app: Supabase Edge Functions

App-facing endpoints. They are the only thing that touches the `tickets`, `ticket_messages`, and
`push_tokens` tables, using the service role server-side. The app calls them with the publishable
key and never sees the service role key.

| Function | Method | The app uses it to |
| --- | --- | --- |
| `ticket-intake` | POST | open a support ticket |
| `ticket-thread` | POST | read its ticket list, or one thread for the inbox |
| `ticket-reply` | POST | add a message to its own ticket |
| `register-push` | POST | register or update the daily-push token, opt-in and sport |

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

`daily-push` sends each opted-in reader at most one notification a day: the lead story of the sport
they picked on Home, when that sport has a new lead. A reader with no sport on file, which is every
token from a build that never sent one, gets the football lead, and so does a reader on the All tab.

It works through the sports one at a time (football, nfl, f1, tennis, golf, basketball), and a sport
that skips or fails never holds up the next. For each one it:

1. Reads that sport's feed as a single document: `/feed/today.json` for football, where the lead is
   `lead`, and `/feed/<sport>.json` for the others, where the lead is the newest entry. The widget
   uses the same rule.
2. Checks that the body hashes to that feed's entry in `/feed/index.json`. A mismatch means the CDN
   is part way through an update, so the sport waits for the next tick. The CDN in front of GitHub
   Pages ignores query strings and no-cache headers, so there is no way to fetch around a stale
   copy; this check catches it instead.
3. Compares the lead's identity (its date, section and url) with the last lead pushed for that
   sport. It sends only a lead it has not pushed before and that is no older than the last one, and
   it sends at most once per editorial day (America/Edmonton). A new date in some other lane does not
   make an old lead new.
4. Sends a HEAD to the lead's image and article url. If either answers anything but 200, the sport
   waits for the next tick and nothing is recorded.
5. Records the lead as sent, then claims that sport's tokens for the day with `claim_push_tokens`,
   then sends. The claim is an UPDATE, run in batches of 500 tokens to stay under PostgREST's row
   limit, that returns only the tokens with no push yet that day, so a reader who changes sport in
   the afternoon is not pushed a second time.

Each notification carries `apns-expiration`, set to the end of the editorial day so a phone that was
switched off never receives a previous day's story, and the collapse id `daily-<sport>-<date>`. The
payload is `{ archv: { section, date } }`, with `section` the entry's own feed key, so the app opens
the exact story.

Football's state is the `push_state` row, where `last_build_hash` holds the football lead key. Every
other sport has a row in `push_sport_state`. A sport with no readers still records its lead, so its
first reader starts with the next new story rather than an old one.

health-probe watches football's row. It alerts when `last_sent_at` is more than 76 hours old and
today.json's lead is one daily-push would still send, which it works out with the same guard
daily-push uses (`_shared/push_guard.ts`). A week with no new football lead raises no alert. Deploy
health-probe again whenever the guard changes:
```
supabase functions deploy health-probe --no-verify-jwt
```

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

Deploy register-push alongside it whenever the sport list changes:
```
supabase functions deploy register-push --no-verify-jwt
```

Schedule it with pg_cron (run in the SQL editor). This checks hourly and only sends when a sport has
a new lead, so it keeps the one-a-day promise. Replace the secret if you set PUSH_SECRET:
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

### The sport field

`register-push` takes an optional `sport`, the feed key of the sport the reader picked: `football`,
`nfl`, `f1`, `tennis`, `golf` or `basketball`. It is stored on `push_tokens.sport`. `all` is stored as
`football`, and so is any value that is the wrong shape or not a sport the server knows. Nothing is
rejected: an app build that knows a sport this server has not been told about still registers, and
the unknown key is logged. A request without `sport` leaves the stored value as it is, and a new row
without it stays null, which daily-push reads as football. Every existing token and every shipped
build keeps the football push.

The list of sports lives in `_shared/sports.ts`, a copy of `src/data/sports.ts`, because Edge
Functions cannot import from outside `supabase/functions`. To add a sport, add it to
`src/data/sports.ts` first, then to `_shared/sports.ts`, then deploy both functions.
`_shared/sports_test.ts` fails if the two lists differ.

### Cron timeouts

The pg_cron jobs for daily-push and health-probe call net.http_post with timeout_milliseconds := 60000 (set 2026-10-12). The pg_net default is 5 seconds, and the per-sport daily-push reads six feeds before it answers: on its first run (v13, 17:30 UTC) the call timed out at 5.0 s while the function finished at 5.4 s. The function completed, but on a send day the fan-out comes after that mark, so the caller now waits.

### Migration

`supabase/migrations/20261012160124_push_per_sport.sql` adds `push_tokens.sport`,
`push_tokens.last_push_day`, the `push_sport_state` table and the `claim_push_tokens` function.
Applied to production on 2026-10-12 through the Supabase MCP, which recorded it as version 20261012160124 (the file is named to match); the columns, table, row-level security and grants were read back. Apply it before deploying either function. A daily-push deployed without it fails its token read and
sends nothing, which is safe, but nobody gets a push until the migration is in.

Check `supabase migration list --linked` before reaching for `supabase db push`. Earlier
migrations went in several ways (the SQL editor, the MCP, the migration API, as their own headers
record), so the remote history may not list them all, and `db push` would then try to run them again.
Unless every earlier migration shows as applied on the remote, apply this one file on its own and
record it:

```
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -1 -f supabase/migrations/20261012160124_push_per_sport.sql
supabase migration repair --status applied 20261012160124
```

### Tests

The pure parts (the guard, the sport list and grouping, the APNs headers, the fan-out pool and
health-probe's push check) have unit tests that need no network and no permissions:

```
cd supabase/functions/daily-push && deno test
cd supabase/functions/_shared && deno test
cd supabase/functions/health-probe && deno test
```
