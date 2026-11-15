# Security

## Reporting a problem

If you find a security problem in thearchv.ca, the feeds it publishes or the code in this
repo, please tell us privately. Email partnerships@josephbankole.ca with "Security" in the
subject line. Please do not open a public issue or pull request about it.

Say what you found, how to reproduce it and what it affects.

## What this repo holds

- The static site for thearchv.ca, built with Vite and published to GitHub Pages from `main`.
- The JSON feeds under `thearchv.ca/feed/` that The ARCHV iOS app reads.
- Supabase Edge Functions (`supabase/functions/`) and database migrations
  (`supabase/migrations/`) for the app: support tickets and push notification tokens.
- The scripts that fetch the Wire headlines and the tables each day.

The site's content security policy allows the Supabase project the app uses and PostHog
analytics. No keys or tokens belong in this repo; `.gitignore` and a check in the deploy
workflow refuse key, certificate and env files.

## History

An assessment dated 13 June 2026 covered only the static site, before the app and its
Supabase back end were added. It no longer describes this repo and is kept in this file's git
history.
