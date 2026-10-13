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

## Live scores: scores-poll

`scores-poll` keeps the live-scores files the app reads. It is not called by the app: pg_cron runs it
every minute. It asks API-Football for the Premier League (league 39), the UEFA Champions League (2)
and the FA WSL (44), maps the answers to the `archv-scores/1` and `archv-match/1` contract, and writes
them to a public Storage bucket called `live`. Readers fetch those files from the CDN. The API key
never leaves the function, and nothing in the files is a crest, a team logo or a player photo: the
mapper builds each field by name and copies no URL across.

| File | URL | Holds |
| --- | --- | --- |
| `scores.json` | `https://fpsfnhjxczzyqurzbqpt.supabase.co/storage/v1/object/public/live/scores.json` | every match from yesterday 00:00 to tomorrow 23:59 (America/Edmonton), sorted by kickoff then competition |
| `match/<id>.json` | `.../public/live/match/<id>.json` | events, lineups, API-Football's player ratings and team stats for one match, once it has kicked off |

Objects are uploaded with `contentType` `application/json` and `cacheControl` 30. supabase-js sends that
as `Cache-Control: max-age=30` (not `public, max-age=30`); check the header on a read-back. A finished
match's file stops changing about two hours after full time. Files are never deleted, so the bucket
grows by about 7 KB for each match played.

Ratings are API-Football's numbers. The files say so in `source`, and the app has to label them as
theirs. WSL team names lose the API's trailing " W" ("Arsenal W" becomes "Arsenal"); the competition
already says it is the women's league. Names are also tidied: the API sometimes double-encodes an accent
(it sent "Martínez" as "MartÃ", a soft hyphen and "nez"), which the mapper repairs, and soft hyphens
and zero-width characters are removed.

### What a run does

1. Reads its state row (`scores_poll_state`). If it cannot, it asks the API for nothing.
2. Fetches the schedule: one request each for 39, 2 and 44, with `from` and `to` set to the UTC dates
   that cover the window. It does this at most every 30 minutes, or at once when the Edmonton day has
   rolled. If one competition fails, the others still update, the failed one keeps its matches, and the
   schedule comes due again in five minutes. An answer that is a well-formed 200 with no matches in it
   counts as a failure too when the function is holding matches for that competition, because a real
   competition does not empty out of a three-day window and believing it would drop the night's matches
   from `scores.json`. If all three fail, nothing changes and the function stays off the API for two
   minutes.
3. Makes at most one details call, `/fixtures?ids=a-b-c` with up to 20 ids. One answer returns events,
   lineups, statistics and players. The call is made when a match is live, kicks off within 10 minutes
   (or has kicked off and the API has not yet said live), or finished less than two hours ago. A match
   that has kicked off and has no file yet is fetched once, which fills the bucket after a cold start or
   a gap. With more than 20 candidates, live matches go first, then starting, then recently finished,
   and the rest wait for the next minute. With no candidates there is no call. A failed details call
   writes nothing and backs off for two minutes.
4. Writes each match file first and `scores.json` last, only where the content (ignoring
   `generatedAt`) differs from what it last wrote. A `detail` pointer in `scores.json` is set only for a
   match that has kicked off and whose file exists, so the app never follows one to a 404. A quiet minute
   writes nothing, so `generatedAt` can be old and says nothing about whether the poll is running.
   "Differs" is judged on the content with every object's keys sorted, because Postgres hands the saved
   matches back in its own key order.
5. Saves its state if it changed and answers `{ ok, scheduleRefreshed, liveCount, detailCalls,
   filesWritten, remaining }`, with `error` added when something failed. `remaining` is the API's own
   `x-ratelimit-requests-remaining`, from the last answer that run had; it is null on a run that made no
   request.

An API error, a spent quota or an answer that is not the expected shape (HTTP other than 200, a
non-empty `errors`, no `response` array) writes nothing and leaves the last good files in place. Failure
reasons name an HTTP status or a field of the API's error object, never a request URL or the key.

### Request budget

The plan allows 7,500 requests a day. The schedule costs 3 requests every 30 minutes, 144 a day. Details
cost at most 1 a minute and only while something is live, starting or just finished. The ceilings:

| Day | Requests |
| --- | --- |
| Idle, nothing in play | 144 |
| Busy Saturday, 10 Premier League and 6 WSL matches (estimate, not measured) | about 800: 144 schedule plus roughly 650 details |
| A match in play round the clock | 1,584: 144 plus 1,440 |
| A competition failing or answering empty all day (schedule due every 5 minutes) | 2,304: 864 schedule plus 1,440 details |
| The state row unwritable all day (see below) | 5,760: 3 schedule plus 1 details, every minute |

The last row is the one to watch. If the state read works and the state write fails (for example the
database has gone read-only), the next run reloads the old state and finds the schedule due again, so
every minute costs the schedule and a details call. The function answers 500 and logs
`scores-poll: state write failed` when that happens, and the cron job's run history in `cron.job_run_details`
shows it. It does not stop itself: a read failure stops the run before any request, but a write failure
cannot be seen until after the requests are made. The same key may serve other things, so
`remaining` in the run's answer is worth a glance now and then.

### Before this goes live

- **Read API-Football's terms in a browser: https://www.api-football.com/terms.** The fetch tools used to
  build this get a 403 from that site, so nothing here is quoted from it. The questions are whether the
  Pro plan allows serving their fixtures, lineups and ratings to our users from our own bucket (the
  files are public, so anyone with the URL can read them, not only the app), and whether a credit line is
  required. If public redistribution is restricted, the bucket stays and only how the app reads it
  changes.
- **The API key is the switch.** Without `APIFOOTBALL_KEY` the function answers
  `{"ok":false,"error":"APIFOOTBALL_KEY not set"}`, makes no request and writes no file, so applying the
  migration and deploying the function before the secret is set is harmless. Set the secret only once
  the terms are read.
- **The vault secret `push_secret` must exist before the migration is applied.** Check with
  `select count(*) from vault.decrypted_secrets where name = 'push_secret'`; it must return 1. If it is
  missing the migration only raises a warning, and every cron call is then refused with 401.

### Secrets, bucket, state and cron

```
supabase secrets set APIFOOTBALL_KEY=<the API-Football key>
```

`PUSH_SECRET` is the one daily-push already uses (the function refuses every call when it is unset).
`APIFOOTBALL_SEASON` is optional; without it the season is worked out from the date (the year it starts in,
rolling over on 1 July), which is 2026 for 2026/27.

`supabase/migrations/20261013170000_scores_live_feed.sql` creates the public `live` bucket (JSON only,
2 MB a file; no client policies on `storage.objects`, so only the service role can write), the one-row
`scores_poll_state` table (row-level security on, no client policies or privileges) and the pg_cron job
`scores-poll` (`* * * * *`, `x-push-secret` read from `vault.decrypted_secrets` name `push_secret`,
`timeout_milliseconds := 60000`). Apply it before deploying the function, in the same way as the push
migration above (`supabase migration list --linked` first; apply the single file and record it if the
history is incomplete).

Deploy:
```
supabase functions deploy scores-poll --no-verify-jwt
```

### Tests

The mapping, the window, the decisions and whole runs against the recorded API answers have unit tests
that need no network and no permissions. The recorded answers are in `scores-poll/fixtures/`: real
API-Football responses captured on 2026-10-13 (a finished Premier League match, a live Champions League
match, a finished WSL match, the 2026 Champions League final that went to penalties, and the three
schedules), with every logo, flag and photo URL, the referee and the coach photo removed.

```
cd supabase/functions/scores-poll && deno test
```
