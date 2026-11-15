# Rebuilding the Supabase project from the repos

One Supabase project (`fpsfnhjxczzyqurzbqpt`) serves two repos:

- this repo, `thearchv-site`: `supabase/migrations/` and `supabase/functions/` (the ARCHV app backend:
  tickets, push, scores, health probe, Android waitlist);
- `gallery-app`: `server/supabase/migrations/` and `server/supabase/functions/` (the Salon app: the
  shop switch, its waitlist and the art mirror).

Use this when the project is restored, recreated, or copied to a staging project. Nothing here runs
by itself.

## 1. Vault secrets first

The migrations read these from Vault at call time and never hold their values. Set them before
applying anything (dashboard, Vault, or `select vault.create_secret('<value>', '<name>');`):

| Vault name | Used by |
| --- | --- |
| `push_secret` | the cron calls to daily-push, health-probe and scores-poll (the same value as the `PUSH_SECRET` function secret) |
| `triage_secret` | the triage-drain cron call and the tickets insert trigger (the same value as `TRIAGE_SECRET`) |
| `publishable_key` | the tickets insert trigger's apikey and bearer headers |

A migration that schedules a cron job raises a warning when its secret is missing. The scores jobs are
then scheduled but refused with 401; the daily-push, health-probe and triage-drain jobs are not
touched at all (`20261115130000`), so set the secret and apply that one again.

## 2. Migrations, in timestamp order across both repos

Apply every file in `thearchv-site/supabase/migrations/` and `gallery-app/server/supabase/migrations/`
in one combined order, oldest timestamp first. Every file is safe to apply twice.

The migration history keeps one row per version, so no two files across the two repos may share a
timestamp: the CLI records the first one it meets and skips the other without a word. The versions
`20261115120000` and `20261115120100` belong to gallery-app (`salon_waitlist_throttle` and
`salon_waitlist_closed_at_opening`); this repo's files from the same day start at `20261115120300`.
Before adding a migration to either repo, list both folders and pick a version neither uses.

Then check the jobs:

```sql
select jobname, schedule from cron.job order by jobname;
```

Expected: `archv-daily-push` (`0 * * * *`), `health-probe` (`*/30 * * * *`), `scores-poll`
(`* * * * *`), `scores-season` (`7,22,37,52 * * * *`) and `triage-drain` (`20 * * * *`).

## 3. Function secrets

Set with `supabase secrets set NAME=value` (the README in each repo says which function reads which):

- `PUSH_SECRET`, `TRIAGE_SECRET`
- `APNS_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_ENV`
- `ANTHROPIC_API_KEY`, and `TRIAGE_MODEL` if it is set today
- `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, `ZOHO_ACCOUNT_ID`, `FOUNDER_EMAIL`
- `APIFOOTBALL_KEY`, and `APIFOOTBALL_SEASON` or `PUBLISH_PLAYERS` if they are set today
- optional health-probe channels: `HEALTHCHECK_PING_URL` and `ALERT_NTFY_URL`
  (see "Alerts that do not depend on email" in `functions/README.md`)
- Salon: `GALLERY_APP_HEADER` if it is set today (see `gallery-app/server/supabase/README.md`)

## 4. Functions

Run `bash supabase/functions/test.sh` first, then deploy every function in `supabase/functions/` with
`--no-verify-jwt`, except `android-waitlist`, which keeps JWT verification on. Then deploy the Salon
functions as `gallery-app/server/supabase/README.md` says.

## 5. Check it is alive

- A manual health-probe call (with the push secret header) answers `ok: true`, or names what is not.
- `select * from net._http_response order by created desc limit 10;` shows the cron calls answering
  200 rather than 401.
- `select * from public.health_alert_state;` exists (empty is fine).
