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
| `match/<id>.json` | `.../public/live/match/<id>.json` | events, lineups (with grid places and shirt colours where the API has them), API-Football's player ratings and team stats for one match, once it has kicked off |
| `days/<YYYY-MM-DD>.json` | `.../public/live/days/2026-10-13.json` | `archv-day/1`: every match that kicked off on that Edmonton day, the same MATCH objects as `scores.json` (postponed and cancelled fixtures included, with their status) |
| `days/index.json` | `.../public/live/days/index.json` | `archv-days/1`: the days that have a file and their match counts, newest first |
| `days/ahead.json` | `.../public/live/days/ahead.json` | `archv-days-ahead/1`, season mode: the days from tomorrow to 28 days on that have fixtures, and their counts, oldest first |
| `teams/index.json` | `.../public/live/teams/index.json` | `archv-teams/1`, season mode: every club in `_shared/clubs.json` with its in-scope men's and women's team ids |
| `teams/<id>.json` | `.../public/live/teams/33.json` | `archv-team/1`, season mode: one team's season in our three competitions, past and future, kickoff order |
| `preview/<id>.json` | `.../public/live/preview/<fixtureId>.json` | `archv-preview/1`, season mode: head to head and each side's last lineup, for a match that has not kicked off |

Objects are uploaded with `contentType` `application/json` and `cacheControl` 30. supabase-js sends that
as `Cache-Control: max-age=30` (not `public, max-age=30`); check the header on a read-back. A finished
match's file stops changing about two hours after full time. Files are never deleted, so the bucket
grows by about 9 KB for each match played, and a few KB for each day.

Ratings are API-Football's numbers. The files say so in `source`, and the app has to label them as
theirs. The web page labels them too (/scores/, D-2026-10-13a).

**Fields added on 2026-10-19, still `archv-match/1`.** They are additive, and the app decodes by named
keys and ignores the rest, so the schema did not change. For the lineups graphic on /scores/:

- each lineup player has `id` (API-Football's player id, null when the API sends 0 or nothing) and
  `grid` (`"row:col"` on the API's formation grid, row 1 the goalkeeper, column 1 the team's left;
  starters only, always null on `subs`);
- each lineup has `colors`: `{ player, goalkeeper }`, each `{ primary, number, border }` as lowercase
  `#rrggbb`, read from the API's `team.colors`. A value that is not six hex digits is dropped, a shirt
  with no usable primary is null, and `colors` is null when the API sent neither shirt;
- each rating has `id`, so the page can match a rating to a lineup player when the two names differ
  ("R. Araujo" in the lineup, "Ronald Araújo" in the ratings) or the rating has no shirt number;
- each side's stats gain `saves` ("Goalkeeper Saves"), `passes` ("Total passes") and `passAccuracy`
  ("Passes %", a string like `"80%"`; when the API leaves that out, "Passes accurate" over "Total
  passes", rounded, which is the same figure).

A finished match's file is never fetched again by the minute's poll, so files written before the deploy
get these fields only from a backfill (below), which rewrites every match file whose content has changed.
The page works without them: it lays a lineup out from the formation and the API's order, matches ratings
by shirt number then exact name, and draws neutral shirts when there are no colours. A rating the API sends
with player id 0 and no shirt number (seen on WSL players) has neither key, so the page matches it last by
initial and surname ("J. Rose" to "Jade Rose"), and only when exactly one rating fits.

A file with no colours for a side gets them on /scores/ from `scripts/data/team-colours.json`: the
colours API-Football sent for that team in its other files (most often at home), by team id, else by
exact name among Premier League and Champions League teams, which covers the WSL, since the API sends
WSL clubs almost no colours and their names match the men's clubs once " W" is gone. Refresh it with
`npm run team-colours` and commit the JSON; it reads only this public bucket and costs no API quota.

**Per-player lines, added on 2026-10-29, still `archv-match/1`.** A match file gains `players`:
`{ home, away }`, one line per player who took part (played a minute or got a rating; an unused
substitute is left out), starters first and then substitutes, each in the API's order. A line carries
`id`, `name`, `number`, `pos`, `minutes`, `captain`, `sub`, `rating`, `goals`, `assists`, `shots`,
`shotsOn`, `passes`, `passesAccurate`, `keyPasses`, `tackles`, `yellow` and `red`, plus `saves` and
`conceded` for a goalkeeper (null for anyone else). Nothing else from the API's player block is
copied, the photo least of all. Three traps the mapper handles: `passesAccurate` is a COUNT the API
sends as a string ("45" of 53), not a percentage; the WSL sends `substitute: false` for every player,
so `sub` comes from the lineup (by id, then exact name, then a unique "J. Rose" for "Jade Rose"
match); and the WSL sends id 0, no number, no position and a rating of "0" for some players, which
read as null, with number and position taken from the lineup. `players` is null unless both sides
have a line, and ALWAYS null unless the function's secret `PUBLISH_PLAYERS` is `1`. It costs no
request: it comes out of the same `/fixtures?ids=` answer as the ratings. `ratings` is unchanged.

WSL team names lose the API's trailing " W" ("Arsenal W" becomes "Arsenal"); the competition
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

### Match history: days/ and the backfill

Finished matches are archived by day so the site can look back. The live poll writes, after the match
files and before `scores.json`, a `days/<date>.json` for each Edmonton day in its window (yesterday, today,
tomorrow), built from the matches it already holds, so the archive costs no API-Football requests. A day
file is written only when its content (ignoring `generatedAt`) differs from the last write, by the same
hash record `scores.json` uses (`days/<date>.json` keys in `scores_poll_state.file_hashes`), and its
`detail` pointers follow the same rule as `scores.json`'s. A day that had a file and has emptied (every
match rescheduled away) gets an empty one, so it stops showing matches it no longer has. A live minute in
which `scores.json` changes therefore uploads one more file than before: the day file.

`days/index.json` lists each day with its match count, newest first. It stops at today: tomorrow's
schedule is not history. The poll replaces the entries for the window's days (up to today) and leaves every
other entry alone, so it only grows. It reads and rewrites the index only when what those days say about
themselves (their set and counts) has changed, which is a few times a day, never on a quiet or a live
minute. If the index is there and cannot be read as an index, the poll leaves it alone, reports
`days/index.json is not readable, left alone` in `error` and tries again the next time something changes;
delete the file and run a backfill to rebuild it. A failure to write a day file or the index is reported
like any other failed upload (HTTP 500) and retried the next minute, and never holds `scores.json` back.
Day files and match files are never deleted. One narrow race exists: if a live poll and a backfill both
rewrite the index in the same moment, the later write can drop entries the earlier one added. Running the
backfill again repairs it, because it re-lists every day it covers.

**Backfill.** A POST with the `x-push-secret` header and a JSON body `{"mode":"backfill","from":"2026-07-01"}`
fills in the season from that date up to yesterday (Edmonton). The cron call has no body and is not
affected. It requests the season's fixtures once per competition (3 requests), keeps the ones from `from`
to yesterday, fetches the full details of every finished one with `/fixtures?ids=` in batches of 20, and
writes each `match/<id>.json`, each `days/<date>.json` and `days/index.json`. It does not read or write
`scores_poll_state`. A competition that fails to list stops the run with nothing written, because a day
file missing one league's matches would be wrong. It is safe to run again: what is already stored is read
back from Storage, and a file whose content matches is not rewritten, so a second run costs the same API
requests and no writes. A day file goes up as soon as every finished match in it has its file, and the
index follows each batch. When it has used about 100 seconds it stops starting new work and answers
`done: false` with `next`, the first day not yet written; call again with `from` set to `next` and it
carries on from there. The answer of a call that ran out of time, for example:

```
{ "ok": true, "done": false, "from": "2026-07-01", "to": "2026-10-12", "next": "2026-09-14",
  "requests": 18, "remaining": 7381, "days": 71, "daysWritten": 52, "daysUnchanged": 0,
  "matches": 310, "matchFilesWritten": 232, "matchFilesUnchanged": 0, "noDetails": 0 }
```

`requests` is the API-Football requests that call made: 3 plus one per 20 finished matches it asked about
(a season to date of about 150 matches is 3 + 8; a whole 700-match season is 3 + 35, over two or three calls).
`noDetails` counts finished matches the API answered without details for: they are listed in their day
with no `detail` pointer, and do not hold the day back. An upload that fails holds its day (and its index
entry) back and is reported in `error`; call again with `from` set to `next`. `from` must be a real date,
and a `from` after yesterday does nothing.

An edge function also has a CPU allowance (about 2 seconds of its own work; waiting on the network does not
count). Parsing the details replies is the cost, and a whole season is near it, though the time budget
above does not watch it. If a call ends with no answer at all, call again with the same `from`: what it had
written is kept and is skipped on the second pass by a plain string comparison. If that keeps happening,
work in slices (`from` a month later, then a month earlier, and so on).

Run it from the SQL editor. pg_net answers asynchronously, so this returns a request id and the answer is
read back from `net._http_response` a minute or two later (the cron job's 60-second timeout is too short
for this; the backfill can run for 120 seconds):

```sql
select net.http_post(
  url := 'https://fpsfnhjxczzyqurzbqpt.supabase.co/functions/v1/scores-poll',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-push-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_secret')
  ),
  body := jsonb_build_object('mode', 'backfill', 'from', '2026-07-01'),
  timeout_milliseconds := 150000
) as request_id;

-- then, until done is true (repeat the call above with from := next when it is not):
select id, status_code, content::jsonb as answer
from net._http_response order by id desc limit 3;
```

### Season mode: teams, days ahead and previews (2026-10-29)

A POST with the body `{"mode":"season"}`, made every 15 minutes by its own pg_cron job
`scores-season` (`7,22,37,52 * * * *`), keeps the files that look forward: `days/<date>.json` for the
days from 2 to 28 days on and `days/ahead.json`, `teams/index.json` and every `teams/<id>.json`, and
`preview/<fixtureId>.json`. It is the same function. It has its own one-row state,
`public.scores_season_state`, and never reads or writes `scores_poll_state`, so the minute poll's
memory, hashes and pruning are exactly as they were. The code is `season.ts` (the decisions and the
builders), `preview.ts` (head to head and last lineups) and `season_run.ts` (one call, with its I/O
handed in).

Each call does ONE step:

| Step | When | Requests | Writes |
| --- | --- | --- | --- |
| `list:premier-league` | the :07 call of 00, 06, 12 and 18 UTC | 1 (`/fixtures?league=39&season=`) | the state row only |
| `list:champions-league` | the :22 call of those hours | 1 | the state row only |
| `list:wsl` | the :37 call of those hours | 1 | the state row only |
| `build:days` | any other call, when a listing is newer than the last build or the build is 6 hours old | 0 | `days/<date>.json` for +2 to +28, `days/ahead.json` |
| `build:teams` | the same rule, once the days are built | 0 (one paginated `storage.list("match/")`) | `teams/index.json`, `teams/<id>.json` |
| `build:previews` | every 6 hours, or after the days are rebuilt | up to 40 head-to-head | `preview/<id>.json` |

A call with nothing due reads the state row and answers `{ "ok": true, "step": null, ... }`. Every
write is hash-gated against the mode's own `file_hashes`, which is pruned on every state write to the
paths the mode owns now, so a quiet six hours writes nothing and the record does not grow.

- **The days.** Season mode never writes yesterday, today or tomorrow (the poll's) and never reads or
  writes `days/index.json`, which still ends at today. `days/ahead.json` has its own schema so a
  misplaced file can never decode as history. An owned day that loses its matches gets an empty file.
  The poll writes tomorrow, empty if need be, only after a complete schedule refresh, so a partial
  refresh at Edmonton midnight cannot wipe season mode's file for the new tomorrow.
- **The teams.** In scope is every team in a held listing outside the qualifying rounds
  (`Qualifying`, `Preliminary`, `Play-offs`), about 70. Club keys, aliases and team ids come from
  `_shared/clubs.json` (archv-clubs/1, the same file the Wire tagger reads). A team the table does not
  cover gets an `auto: true` entry with the key `team-<id>`, which the app never offers in its picker;
  the run log names each one so the table gets fixed. A match points at `match/<id>.json` when the
  storage listing found that file. Team files are up to 6 hours behind on live state by design: the
  app overlays `scores.json` by match id.
- **The previews.** One for every in-scope match that has not kicked off and starts within 28 days.
  `lastLineup` is each side's lineup from its newest earlier finished match in our three
  competitions, read from the match files already in the bucket (at most three tries, a missing file
  or one with no lineups falls to the next), with its date, competition and opponent. It costs no
  request. `h2h` is filled only inside 7 days of kickoff, from `/fixtures/headtohead?h2h=<home>-<away>&last=10`.
  The preview file in Storage is its memory: a block that has been fetched is reused with no request
  unless the listings show a finished meeting of the two sides after it was fetched (a second leg), or
  the match is inside 48 hours and the block is older than that mark (one refresh). There is no
  `preview/index.json`; a 404 means "no preview".
- **Head-to-head rows.** Every competition's meetings are kept, cups included, each labelled with its
  competition (the API's `league.id` and `league.name`, with our key for 39, 2 and 44), on the
  founder's answer of 2026-10-28 ("Allowed, publish all"). Friendlies are dropped: league ids 10
  (international friendlies), 666 (women's friendlies) and 667 (club friendlies), and any row whose
  league says "Friendly" by type or name. Only finished rows, the fixture itself left out, newest first,
  at most ten. The summary counts by team id from the fixture's point of view, wherever each meeting
  was played; a shootout counts as a draw on the score. In a WSL preview every team name loses its
  " W", whatever competition the row is from. No venue, round, logo, flag or referee is copied. An empty
  reply is "never met"; a non-empty reply in which no row can be placed is a failure, keeps the
  previous block and logs `h2h-unmapped <id>`.
- **The head-to-head shape is UNVERIFIED.** No `/fixtures/headtohead` reply has been recorded (the API
  docs refuse automated reads). `fixtures/h2h-synthetic.json` is SYNTHETIC, built from the recorded
  fixture object shape, which API-Football documents as the same for this endpoint. The first live
  reply after deploy is to be captured (logo and photo URLs stripped, as for the other fixtures) into
  `fixtures/h2h-recorded.json` with a test against it, and this note then removed.
- **Guards, before any request, in this order.** A state row that cannot be read means no request at
  all. `backoff_until` in the future (30 minutes after any failed request) means no request, but the
  builds still run. `remaining` below 1,500 READ TODAY (UTC) means no request, and the answer says
  `quota-reserve`; a value read yesterday never blocks today. A state row whose `updated_at` is older
  than one of its own stamps, or more than 6 hours old, means the last state write failed, so the
  call makes no request and runs a build only. Every reply refreshes `remaining`, and the
  head-to-head loop stops on a reply showing fewer than 1,500, on the first failed reply (and backs
  off), and on the first failed preview write. At most three head-to-head requests are in flight.
  Every step stops starting new work after 100 seconds.
- **A season rolls over** when the season worked out from the date (or `APIFOOTBALL_SEASON`) differs
  from the row's `season`: the held listings and their stamps are cleared, so an empty new-season
  listing is believed and last season's fixtures leave the team files. An empty listing while holding
  the same season's matches is refused, as in the poll.
- **Hand calls.** `{"mode":"season","step":"<step>"}` forces one step (`list:<key>`, `build:days`,
  `build:teams`, `build:previews`). It needs the push secret like every call here, and the guards still
  apply to a listing. Make hand calls between cron slots (at :12, say), never on one, so two calls never
  race on the state row.
- **CPU.** The heaviest calls are one listing (380 Premier League fixtures, mapped once) and one build
  (about 70 team files hashed, or up to about 120 previews). Both are estimated inside the 2-second
  allowance. If the first real `build:teams` or `build:previews` logs CPU near the limit, split it
  (`build:teams:men` and `:women`; `build:previews:near` for 7 days and `:far` for 8 to 28): only the
  step table changes.

The answer of a season call, for example:

```
{ "ok": true, "step": "build:previews", "requests": 6, "remaining": 7342, "filesWritten": 14,
  "writeFailed": false, "h2hRequests": 6, "previews": 41 }
```

It answers 500 when an upload or the state write failed.

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
| A backfill from the start of the season (once, then again only to repair) | about 3 plus one per 20 matches played: 38 for a full 700-match season, about a dozen at the moment |
| Season mode's listings | 12 a day, always: fixed cron slots, no state needed to cap them |
| Season mode's head to head | about 5 a typical day (fixtures entering the 7-day horizon and the 48-hour refresh), about 40 in one call on a busy week; worst case 40 a call, and with preview writes failing it stops at the first failure, so a stuck bucket costs at most 160 a day |
| Last lineups and per-player lines | 0: read from the bucket, and from the same details answer |
| All together | about 160 to 200 a typical day, about 850 on a busy one, about 5,930 at worst, under 7,500. The 1,500 reserve, read live from each reply, stops season mode first |

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

The function's own files are `index.ts`, `api.ts`, `backfill.ts`, `days.ts`, `map.ts`, `plan.ts`,
`poll.ts`, `season.ts`, `preview.ts` and `season_run.ts`, plus `../_shared/cors.ts`,
`../_shared/push_guard.ts` and `../_shared/clubs.json`. Nothing else in the folder (tests, `testkit.ts`,
`season_testkit.ts`, `app_fixtures.ts`, `deno.json`, `fixtures/`) is deployed. Deploying changes nothing until something calls the new code: the
cron call carries no body, so the minute's poll runs as before and now also keeps `days/`; the backfill
runs only when called with its body.

### Tests

The mapping, the window, the decisions, the day archive, the backfill and whole runs against the recorded
API answers have unit tests that need no network and no permissions. The recorded answers are in `scores-poll/fixtures/`: real
API-Football responses captured on 2026-10-13 (a finished Premier League match, a live Champions League
match, a finished WSL match, the 2026 Champions League final that went to penalties, and the three
schedules), with every logo, flag and photo URL, the referee and the coach photo removed.

```
cd supabase/functions/scores-poll && deno test
```

Season mode's tests (`season_test.ts`, `preview_test.ts`, `season_run_test.ts`, `clubs_test.ts`) run on
`fixtures/season-*.json`, copies of the three recorded schedule replies with the parameters of a season
listing, which `season_testkit.ts` re-dates around the test clock into a spread of past and future
kickoffs (only dates, statuses and goals change), and on `fixtures/h2h-synthetic.json` (SYNTHETIC, see
above). `deno task app-fixtures [dir]` writes the server-side sample files the iOS app's model tests
decode (`match-with-players.json`, `teams-index.json`, `team-33.json`, `preview.json`, `ahead.json`) by
running the real builders over the recorded replies; by default into
`../thearchv-app/TheARCHVTests/Fixtures/` beside this repo. Run it after a change to any of those
shapes and commit the app's copies with the change.

### Season mode deploy (package S3, 2026-10-29)

Founder answer, 2026-10-28, on the API-Football terms: "Allowed, publish all". So the cron IS
scheduled, `PUBLISH_PLAYERS` is set to `1`, and head to head keeps every competition except
friendlies. Deploy through the Supabase MCP, in this order, with the proof of each step in the run
report:

1. **Tests.** `cd supabase/functions/scores-poll && deno test`: all green (170 at the time of
   writing). Nothing deploys on a red suite.
2. **Commit first** on `preview`, so the deployed code is the repo's code.
3. **The table migration.** `list_migrations` and confirm `20261013170000_scores_live_feed` is
   recorded. Then `apply_migration` with `supabase/migrations/20261029120000_scores_season_mode.sql`.
   The MCP records its own timestamp as the version: rename the file to that version and commit the
   rename. Read back: `select id, season, updated_at from public.scores_season_state;` returns one row,
   and `select relrowsecurity from pg_class where relname = 'scores_season_state';` is true.
4. **The function.** `deploy_edge_function`, name `scores-poll`, entrypoint `index.ts`,
   `verify_jwt: false`, files `scores-poll/{index,api,backfill,days,map,plan,poll,season,preview,season_run}.ts`,
   `_shared/cors.ts`, `_shared/push_guard.ts`, `_shared/clubs.json`. This deploy changes the minute
   poll too (the `players` key, tomorrow's file, the early lineup pointer). **Smoke check:** the next
   two `scores-poll` rows in `net._http_response` are 200, and `scores.json` still parses as
   `archv-scores/1` (`curl -s <public url>/scores.json | jq .schema`). **Rollback:** redeploy the same
   file list from the previous commit.
5. **Hand calls**, between cron slots (at :12 or :42, never on :07, :22, :37 or :52), one at a time,
   reading each answer back from `net._http_response` before the next:

   ```sql
   select net.http_post(
     url := 'https://fpsfnhjxczzyqurzbqpt.supabase.co/functions/v1/scores-poll',
     headers := jsonb_build_object(
       'Content-Type', 'application/json',
       'x-push-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_secret')
     ),
     body := jsonb_build_object('mode', 'season', 'step', 'list:premier-league'),
     timeout_milliseconds := 120000
   ) as request_id;
   ```

   Then the same with `list:champions-league`, `list:wsl`, `build:days`, `build:teams` and
   `build:previews`. Each answer is `ok: true`; the three listings make one request each, the two
   builds none, and the previews call at most 40. Note any `autoClubs` in the teams answer and add those
   sides to `_shared/clubs.json`. Then confirm with curl that `teams/index.json`, `teams/33.json`,
   `days/ahead.json` and one `preview/<id>.json` exist and parse with their schemas
   (`archv-teams/1`, `archv-team/1`, `archv-days-ahead/1`, `archv-preview/1`).
6. **Capture the first live head-to-head reply** into `fixtures/h2h-recorded.json` (logo, flag and
   photo URLs removed), add a test against it in the same session, and remove the "unverified" note
   above.
7. **The cron and the players.** `apply_migration` with
   `supabase/migrations/20261029120100_scores_season_cron.sql` (rename to the returned version, as in
   step 3) and check `select jobname, schedule from cron.job where jobname = 'scores-season';`. Set the
   secret `PUBLISH_PLAYERS=1`. Then the player-stats backfill: POST `{"mode":"backfill","from":"2026-07-07"}`
   and repeat with the returned `next` until `done: true` (about 17 requests; every match file is
   rewritten once with `players`, day files compare unchanged). Spot-check `match/1557441.json` for
   `players`. The backfill stops at yesterday, so run it once more the next day with `from` set to the
   deploy date.
8. **Measure.** Read `remaining` in `net._http_response` before and after one full day, and on the
   first Saturday after deploy record the busy-day count in the budget table above.
9. **The site.** Deploy per site trap 2 (`bash scripts/deploy-site.sh`), since this code lives in
   the site repo.
