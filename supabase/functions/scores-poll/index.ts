// scores-poll: keeps the live-scores files the app reads. Run every minute by pg_cron. It reads
// API-Football for the Premier League, the Champions League and the FA WSL, maps what comes back
// to the archv-scores/1 and archv-match/1 contract (map.ts), and writes scores.json and
// match/<id>.json to the public Storage bucket "live" when their content has changed. The app and
// the site read those files from the CDN; nothing here is on a reader's request path, and the
// API-Football key never leaves this function.
//
// What it asks the API for is decided in plan.ts: the schedule for yesterday to tomorrow
// (Edmonton) at most every 30 minutes, and at most one details call a minute, only while a match
// is live, about to start or just finished. An API error, an exhausted quota or a reply that is
// not the shape we expect writes nothing and leaves the last good files where they are.
//
// It also keeps the match history (days.ts): a file per Edmonton day, days/<date>.json, and an index
// of them, days/index.json. A POST with the body {"mode":"backfill","from":"YYYY-MM-DD"} fills that
// history in for the season so far (backfill.ts); the cron call has no body and is unaffected.
//
// Secrets required:
//   APIFOOTBALL_KEY     the API-Football key (sent in a header, never logged or put in a URL)
//   PUSH_SECRET         the guard, matched against the x-push-secret header from the cron call
// Optional:
//   APIFOOTBALL_SEASON  overrides the season (the year it starts in); default is worked out from the date
import { adminClient, json } from "../_shared/cors.ts";
import { makeApiGet } from "./api.ts";
import { runBackfill } from "./backfill.ts";
import { rowFromState, runPoll, stateFromRow } from "./poll.ts";
import { canonicalJson, seasonFor } from "./plan.ts";

const BUCKET = "live";
const STATE_COLUMNS =
  "schedule_fetched_at, window_day, matches, finished_at, file_hashes, backoff_until";

// Whether a Storage error means "no such object" rather than "could not look". The two must not be
// confused: a missing index is an empty one, an unreadable index must not be overwritten.
function isMissing(e: { message?: string; status?: number; statusCode?: string | number }): boolean {
  return [e.status, e.statusCode].some((v) => Number(v) === 404) || /not.?found|does not exist/i.test(e.message ?? "");
}

// The body of a call that asks for something other than the minute's poll. The cron call has no
// body at all, which reads as "no request".
async function bodyOf(req: Request): Promise<Record<string, unknown>> {
  try {
    const v = await req.json();
    return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

Deno.serve(async (req) => {
  // Fail CLOSED, as daily-push does: an unset PUSH_SECRET must refuse, not run open.
  const guard = Deno.env.get("PUSH_SECRET");
  if (!guard || req.headers.get("x-push-secret") !== guard) {
    return json({ error: "unauthorized" }, 401);
  }
  const apiKey = Deno.env.get("APIFOOTBALL_KEY");
  if (!apiKey) return json({ ok: false, error: "APIFOOTBALL_KEY not set" }, 200);

  const supabase = adminClient();
  const now = new Date();
  const season = Number(Deno.env.get("APIFOOTBALL_SEASON")) || seasonFor(now);
  const write = async (path: string, text: string) => {
    const { error } = await supabase.storage.from(BUCKET).upload(path, text, {
      contentType: "application/json",
      cacheControl: "30",
      upsert: true,
    });
    if (error) {
      console.error(`scores-poll: upload of ${path} failed: ${error.message}`);
      throw new Error(error.message);
    }
  };
  const read = async (path: string): Promise<string | null> => {
    const { data, error } = await supabase.storage.from(BUCKET).download(path);
    if (error) {
      if (isMissing(error as { message?: string; status?: number; statusCode?: string | number })) return null;
      throw new Error(error.message);
    }
    return await data.text();
  };

  // The one-off backfill. It does not read or write the state row.
  const body = await bodyOf(req);
  if (body.mode === "backfill") {
    const out = await runBackfill(String(body.from ?? ""), { now, season, api: makeApiGet(apiKey), read, write });
    console.log(`scores-poll: backfill ${JSON.stringify(out)}`);
    return json(out, 200);
  }

  // The state is read before any request goes out. If it cannot be read, nothing is fetched: a
  // poll that has lost its memory would refresh the schedule every minute.
  const { data: row, error: readError } = await supabase
    .from("scores_poll_state").select(STATE_COLUMNS).eq("id", 1).maybeSingle();
  if (readError) {
    console.error(`scores-poll: state read failed, not polling: ${readError.message}`);
    return json({ ok: false, error: `state unreadable: ${readError.message.slice(0, 120)}` }, 200);
  }
  const before = stateFromRow(row);

  const { summary, state, writeFailed } = await runPoll(before, {
    now,
    season,
    api: makeApiGet(apiKey),
    write,
    archive: { read },
  });

  // Save the state only if the run changed it, so a quiet minute is a single read.
  let stateFailed = false;
  if (canonicalJson(state) !== canonicalJson(before)) {
    const { error } = await supabase.from("scores_poll_state").upsert(rowFromState(state, now));
    if (error) {
      stateFailed = true;
      console.error(`scores-poll: state write failed: ${error.message}`);
    }
  }

  const out = stateFailed
    ? { ...summary, ok: false, error: [summary.error, "state write failed"].filter(Boolean).join("; ") }
    : summary;
  if (out.scheduleRefreshed || out.detailCalls || out.filesWritten || out.dayFilesWritten || !out.ok) {
    console.log(`scores-poll: ${JSON.stringify(out)}`);
  }
  return json(out, writeFailed || stateFailed ? 500 : 200);
});
