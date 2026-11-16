// health-probe: pg_cron sweep (every 30 minutes) that checks the launch-critical surface is up,
// independent of the founder's Mac. Read-only against everything: never writes to push_state,
// never calls Anthropic.
//
// Checks:
//   (a) https://thearchv.ca/ returns 200
//   (b) https://thearchv.ca/feed/today.json returns 200 AND its lastUpdated is within 72h
//   (b3) today.json's football lead is dated within the same 72h window (the envelope's
//       lastUpdated moves with every sport, so it cannot see the football desks stop)
//   (c) push_state row is readable and, while today.json's lead is one daily-push has not sent,
//       last_sent_at is not older than 76h, but ONLY checked 08:00-20:59 Edmonton (daily-push
//       sends 07:00-20:59 and holds a late lead until 07:00, so a waiting lead outside those
//       hours is expected)
//   (c3) the same for every other sport, from its push_sport_state row and its own feed
//   (c2) the last daily-push fan-out of every sport delivered: not zero sent, not more than half
//       failed, not more dead tokens than one run deletes (../_shared/push_run.ts)
//   (g) scores-poll has refreshed its schedule within 2h; season mode has listed within 7h; the
//       API-Football count left today is not below 1,500; salon-store answers its gallery-store/1
//       switch; android-waitlist answers its preflight (checks.ts)
//   (h) no support ticket has sat at 'new', 'pending_triage' or 'l1_working' untouched for over 2h
//       (a count only)
//   (i) https://josephbankole.ca/ returns 200 and its news-feed.xml has an item from the last 120h
//   (j) the Salon image mirror (bucket salon-art) still holds the catalog's files and serves a
//       random sample of them
//   (e) the latest completed "Deploy to GitHub Pages" run did not fail; six GitHub API replies in a
//       row it could not use alert as pages-deploy-blind (checks.ts nextSkipRun)
//   (k) no founder email about a support ticket (an L2 or L3 escalation, a triage that kept
//       failing, a follow-up) has failed to send in the last 24h (a count only)
// On any failure, sends ONE alert email to the founder via the same Zoho Mail send path
// support-triage's L3 escalation uses (../_shared/zoho.ts), subject "ARCHV health: <check> failing".
// Debounced per check: health_alert_state records the last alert time, and a check will not
// re-alert within 6 hours of its own last alert. An email that fails gives its slot back so the
// next run retries, and goes to ALERT_NTFY_URL by check name when that is set. Every run GETs
// HEALTHCHECK_PING_URL when set (a dead-man check outside this project), or <url>/fail when an
// alert could not be delivered by either channel. Both are optional; see alert.ts and the README.
//
// Guarded with x-push-secret, matched against the PUSH_SECRET vault secret — the same pattern
// daily-push's pg_cron caller uses.
import { adminClient, json } from "../_shared/cors.ts";
import { pushRunFailing } from "../_shared/push_run.ts";
import { feedName, leadFromFeed, statesFrom } from "../_shared/push_guard.ts";
import { DEFAULT_SPORT, SPORT_KEYS } from "../_shared/sports.ts";
import { FOUNDER_MAIL_FAILED, sendFounderMail } from "../_shared/zoho.ts";
import { type AlertDeps, dispatchAlerts, type Failure, pingUrl } from "./alert.ts";
import {
  footballLeadStale,
  FOUNDER_MAIL_WINDOW_MS,
  founderMailFailing,
  JB_NEWS_FEED_URL,
  JB_SITE_URL,
  jbNewsStale,
  MIRROR_BUCKET,
  MIRROR_SAMPLE,
  mirrorProblem,
  mirrorSample,
  nextSkipRun,
  PAGES_SKIP_ROW,
  pagesDeployBlind,
  quotaLow,
  salonStoreProblem,
  scoresPollStale,
  scoresWriteFailing,
  seasonStale,
  TICKET_STUCK_MS,
  TICKET_WAITING_STATUSES,
  ticketsStuck,
  waitlistDown,
} from "./checks.ts";
import { pushCheckDue, pushOverdue, sportPushOverdue } from "./push_check.ts";

const SITE_URL = "https://thearchv.ca/";
const FEED_URL = "https://thearchv.ca/feed/today.json";
const SPORT_FEED_URL = (sport: string) => `https://thearchv.ca/feed/${sport}.json`;
// The lead story changes only when archv-football-desk runs, Mon/Wed/Fri since D-2026-10-06a, and
// daily-push sends only on a new lead. The old 26h windows assumed a daily desk and emailed on
// every off day. Fri to Mon is the longest legitimate gap: the Friday lead's day ends Sat 00:00
// UTC and Monday's lands near 10:30 UTC (58.5h), and Friday's 14:30 UTC push is followed by
// Monday's 72h later. A missed desk run now alerts the same evening on Mondays and within a day
// otherwise. Change these with the desk's schedule. PUSH_STALE_MS only counts while a lead is
// waiting to go out (pushOverdue in push_check.ts), so a week with no new lead stays quiet.
const FEED_STALE_MS = 72 * 60 * 60 * 1000;
const PUSH_STALE_MS = 76 * 60 * 60 * 1000;
const DEBOUNCE_MS = 6 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  // Fail CLOSED (security sweep 2026-07-22): an unset PUSH_SECRET must refuse, not run open.
  const guard = Deno.env.get("PUSH_SECRET");
  if (!guard || req.headers.get("x-push-secret") !== guard) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabase = adminClient();
  const failures: Failure[] = [];
  const now = new Date();

  // (a) site 200
  try {
    const res = await fetch(SITE_URL, { method: "GET", cache: "no-store" });
    if (res.status !== 200) failures.push({ check: "site", detail: `status ${res.status}` });
  } catch (e) {
    failures.push({ check: "site", detail: `unreachable: ${String(e).slice(0, 120)}` });
  }

  // (b) feed 200 + fresh. The parsed document is kept for check (c), which needs its lead.
  let todayDoc: unknown = null;
  try {
    const res = await fetch(FEED_URL, { cache: "no-store" });
    if (res.status !== 200) {
      failures.push({ check: "feed", detail: `status ${res.status}` });
    } else {
      const data = await res.json();
      todayDoc = data;
      const raw = data?.lastUpdated;
      // today.json's lastUpdated is a calendar DATE ("YYYY-MM-DD"), the editorial date of the
      // lead story, not a build timestamp — the engine's normal cadence means "today's" feed
      // legitimately still carries yesterday's date for hours after midnight UTC. Anchor the
      // freshness window at the END of that editorial day (i.e. the moment it rolled from
      // current to historical), not at its midnight start, so a healthy daily cadence doesn't
      // read as stale for the first ~24h of every day.
      const dayStart = raw ? new Date(`${raw}T00:00:00Z`) : null;
      if (!dayStart || Number.isNaN(dayStart.getTime())) {
        failures.push({ check: "feed", detail: `missing/invalid lastUpdated: ${JSON.stringify(raw)}` });
      } else {
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
        if (now.getTime() - dayEnd.getTime() > FEED_STALE_MS) {
          failures.push({ check: "feed", detail: `stale: lastUpdated ${raw} (day ended ${dayEnd.toISOString()})` });
        }
      }
    }
  } catch (e) {
    failures.push({ check: "feed", detail: `unreachable: ${String(e).slice(0, 120)}` });
  }

  // (b2) lead-image: the feed's lead image must actually resolve. This is what would have
  // caught the santos.webp incident — an entry pointing at a head asset before it was
  // uploaded left the feed pointing at a 404. Independent fetch from (b) so a failure here
  // never masks (or is masked by) the core feed-freshness check.
  try {
    const res = await fetch(FEED_URL, { cache: "no-store" });
    if (res.status === 200) {
      const data = await res.json();
      const image = data?.lead?.image;
      if (image) {
        const imageUrl = `https://thearchv.ca${image}`;
        const imgRes = await fetch(imageUrl, { method: "HEAD", cache: "no-store" });
        if (imgRes.status !== 200) {
          failures.push({ check: "lead-image", detail: `status ${imgRes.status} for ${imageUrl}` });
        }
      }
    }
    // A non-200 on the feed fetch itself is already surfaced by check (b) above; nothing
    // extra to add here in that case, so stay silent rather than double-alerting.
  } catch (e) {
    failures.push({ check: "lead-image", detail: `unreachable: ${String(e).slice(0, 120)}` });
  }

  // (b3) football-lead: today.json's lead is the newest football entry, so its date is the
  // football desks' own freshness (footballLeadStale in checks.ts). Skipped when check (b) could
  // not read the feed, which it has already reported.
  if (todayDoc !== null) {
    const detail = footballLeadStale(todayDoc, now, FEED_STALE_MS);
    if (detail) failures.push({ check: "football-lead", detail });
  }

  // (c) push_state, gated to 08:00-20:59 Edmonton (pushCheckDue in push_check.ts): outside that,
  // daily-push is holding any late lead for its 07:00 send and this must not alert. An old last_sent_at is a failure only while today.json
  // carries a lead daily-push would still send: since C115, football pushes only when a new
  // lead lands, and a quiet week is not a broken push (see push_check.ts). Without today.json
  // there is no telling, and check (b) has already reported the feed, so this stays quiet
  // rather than alerting twice.
  const pushDue = pushCheckDue(now);
  if (pushDue) {
    const { data: state, error } = await supabase
      .from("push_state")
      .select("last_build_hash, last_sent_at")
      .eq("id", 1)
      .maybeSingle();
    if (error) {
      failures.push({ check: "push_state", detail: `read error: ${error.message.slice(0, 120)}` });
    } else if (todayDoc === null) {
      console.error("health-probe: push_state check skipped — today.json unreadable, check (b) reports it");
    } else {
      const detail = pushOverdue(state, todayDoc, now, PUSH_STALE_MS);
      if (detail) failures.push({ check: "push_state", detail });
    }
  }

  // (c3) push-sport: every other sport, from its push_sport_state row and the lead of its own feed,
  // in the same hours. A feed that cannot be read is logged and skipped: daily-push skips that
  // sport too, and its own reply says why.
  if (pushDue) {
    const { data: sportRows, error } = await supabase
      .from("push_sport_state").select("sport, last_lead_key, last_sent_at");
    if (error) {
      failures.push({ check: "push-sport", detail: `read error: ${error.message.slice(0, 120)}` });
    } else {
      const states = statesFrom(null, sportRows ?? []);
      for (const sport of SPORT_KEYS) {
        if (sport === DEFAULT_SPORT) continue;
        let doc: unknown;
        try {
          const res = await fetch(SPORT_FEED_URL(feedName(sport)), { cache: "no-store" });
          if (res.status !== 200) {
            console.error(`health-probe: push-sport ${sport} skipped, feed status ${res.status}`);
            continue;
          }
          doc = await res.json();
        } catch (e) {
          console.error(`health-probe: push-sport ${sport} skipped, feed unreadable: ${String(e).slice(0, 120)}`);
          continue;
        }
        const detail = sportPushOverdue(states.get(sport) ?? null, leadFromFeed(sport, doc), now, PUSH_STALE_MS);
        if (detail) failures.push({ check: `push-sport:${sport}`, detail });
      }
    }
  }

  // (c2) push-run: what the last fan-out of each sport delivered (pushRunFailing in
  //      ../_shared/push_run.ts). daily-push records the lead before it sends, so last_sent_at stays
  //      fresh even when APNs refuses every token; this reads what it recorded after the sends.
  {
    const runColumns = "last_run_at, last_run_claimed, last_run_sent, last_run_failed, last_run_dead, last_run_reasons";
    const { data: football, error: footballError } = await supabase
      .from("push_state").select(runColumns).eq("id", 1).maybeSingle();
    const { data: others, error: othersError } = await supabase
      .from("push_sport_state").select(`sport, ${runColumns}`);
    const readError = footballError ?? othersError;
    if (readError) {
      failures.push({ check: "push-run", detail: `read error: ${readError.message.slice(0, 120)}` });
    } else {
      const rows: [string, Record<string, unknown> | null][] = [
        [DEFAULT_SPORT, football as Record<string, unknown> | null],
        ...((others ?? []) as Record<string, unknown>[])
          .filter((r) => typeof r.sport === "string" && r.sport !== DEFAULT_SPORT)
          .map((r): [string, Record<string, unknown>] => [r.sport as string, r]),
      ];
      for (const [sport, row] of rows) {
        const detail = pushRunFailing(row, now);
        if (detail) failures.push({ check: `push-run:${sport}`, detail });
      }
    }
  }

  // (e) pages-deploy: confirm the most recent COMPLETED "Deploy to GitHub Pages" run
  // succeeded. Public repo, unauthenticated GET, one call per 30-min probe tick. This is what
  // would have caught the silent-build-failure incident (a TypeScript error in a content commit
  // failed the Pages build with no alert; the site stayed stale and nothing here or elsewhere
  // caught it). A GitHub API hiccup (network error, non-200, unexpected response shape) logs and
  // is SKIPPED, not alerted, so one bad reply never cries wolf. A run of skips is counted, though
  // (nextSkipRun in checks.ts), and PAGES_SKIP_ALERT_AFTER in a row alerts as pages-deploy-blind,
  // so a lasting refusal (the unauthenticated limit is 60 an hour per IP) cannot leave this blind.
  let pagesSkip: string | null = null;
  try {
    const res = await fetch(
      "https://api.github.com/repos/josephbankole/thearchv-site/actions/runs?per_page=5",
      { headers: { "User-Agent": "archv-health-probe", Accept: "application/vnd.github+json" }, cache: "no-store" },
    );
    if (res.status !== 200) {
      await res.body?.cancel();
      pagesSkip = `GitHub API status ${res.status}`;
    } else {
      const data = await res.json();
      if (!Array.isArray(data?.workflow_runs)) {
        pagesSkip = "GitHub API reply had no workflow_runs";
      } else {
        const deployRun = data.workflow_runs.find(
          (r: { name?: string; status?: string }) => r?.name === "Deploy to GitHub Pages" && r?.status === "completed",
        );
        if (!deployRun) {
          console.error("health-probe: pages-deploy check skipped — no completed 'Deploy to GitHub Pages' run in the last 5");
        } else if (deployRun.conclusion === "failure") {
          failures.push({ check: "pages-deploy", detail: `latest completed run ${deployRun.id} concluded "failure"` });
        }
      }
    }
  } catch (e) {
    pagesSkip = `fetch error: ${String(e).slice(0, 120)}`;
  }
  if (pagesSkip) console.error(`health-probe: pages-deploy check skipped — ${pagesSkip}`);
  {
    const { data: prevRow, error: readError } = await supabase
      .from("health_alert_state").select("*").eq("check_name", PAGES_SKIP_ROW).maybeSingle();
    if (readError) {
      console.error(`health-probe: pages-deploy skip count read failed: ${readError.message.slice(0, 120)}`);
    } else {
      const prev = prevRow && typeof prevRow.skips === "number" && typeof prevRow.last_alert_at === "string"
        ? { skips: prevRow.skips, since: prevRow.last_alert_at }
        : null;
      const run = nextSkipRun(prev, pagesSkip !== null, now);
      const { error } = run
        ? await supabase.from("health_alert_state")
          .upsert({ check_name: PAGES_SKIP_ROW, last_alert_at: run.since, skips: run.skips })
        : prevRow
        ? await supabase.from("health_alert_state").delete().eq("check_name", PAGES_SKIP_ROW)
        : { error: null };
      if (error) console.error(`health-probe: pages-deploy skip count write failed: ${error.message.slice(0, 120)}`);
      const blind = pagesDeployBlind(run, pagesSkip ?? "");
      if (blind) failures.push({ check: "pages-deploy-blind", detail: blind });
    }
  }

  // (g) live scores, season mode and the API quota (checks.ts). Their state rows are read with the
  // service role, the only role allowed to.
  {
    const { data: poll, error } = await supabase
      .from("scores_poll_state").select("*").eq("id", 1).maybeSingle();
    const detail = error ? `read error: ${error.message.slice(0, 120)}` : scoresPollStale(poll, now);
    if (detail) failures.push({ check: "scores-poll", detail });
    const writes = error ? null : scoresWriteFailing(poll, now);
    if (writes) failures.push({ check: "scores-write", detail: writes });
  }
  {
    const { data: season, error } = await supabase
      .from("scores_season_state").select("listed_at, remaining, remaining_at, updated_at").eq("id", 1).maybeSingle();
    if (error) {
      failures.push({ check: "scores-season", detail: `read error: ${error.message.slice(0, 120)}` });
    } else {
      const stale = seasonStale(season, now);
      if (stale) failures.push({ check: "scores-season", detail: stale });
      const quota = quotaLow(season, now);
      if (quota) failures.push({ check: "api-quota", detail: quota });
    }
  }

  // (g2) the two public sign-up surfaces on this project. salon-store's GET is public (verify_jwt
  // off); android-waitlist keeps JWT verification on, so only its preflight is asked for.
  const functionsBase = `${Deno.env.get("SUPABASE_URL") ?? ""}/functions/v1`;
  try {
    const res = await fetch(`${functionsBase}/salon-store`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    let body: unknown = null;
    try { body = await res.json(); } catch { /* not JSON: salonStoreProblem reports it */ }
    const detail = salonStoreProblem(res.status, body);
    if (detail) failures.push({ check: "salon-store", detail });
  } catch (e) {
    failures.push({ check: "salon-store", detail: `unreachable: ${String(e).slice(0, 120)}` });
  }
  try {
    const res = await fetch(`${functionsBase}/android-waitlist`, {
      method: "OPTIONS",
      headers: { Origin: "https://thearchv.ca", "Access-Control-Request-Method": "POST" },
      signal: AbortSignal.timeout(15_000),
    });
    await res.body?.cancel();
    const detail = waitlistDown(res.status);
    if (detail) failures.push({ check: "android-waitlist", detail });
  } catch (e) {
    failures.push({ check: "android-waitlist", detail: `unreachable: ${String(e).slice(0, 120)}` });
  }

  // (h) tickets: the triage queue is moving. A count, never a ticket's content (ticketsStuck in
  // checks.ts).
  {
    const cutoff = new Date(now.getTime() - TICKET_STUCK_MS).toISOString();
    const { count, error } = await supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .in("status", [...TICKET_WAITING_STATUSES])
      .lt("updated_at", cutoff);
    const detail = error ? `read error: ${error.message.slice(0, 120)}` : ticketsStuck(count ?? null);
    if (detail) failures.push({ check: "tickets", detail });
  }

  // (k) ticket-mail: founder emails about tickets that did not go, from the internal notes triage
  //     and ticket-reply leave (founderMailFailing in checks.ts). A count, never ticket content.
  {
    const since = new Date(now.getTime() - FOUNDER_MAIL_WINDOW_MS).toISOString();
    const { count, error } = await supabase
      .from("ticket_messages")
      .select("id", { count: "exact", head: true })
      .eq("author", "system")
      .eq("internal", true)
      .like("body", `${FOUNDER_MAIL_FAILED}%`)
      .gt("created_at", since);
    const detail = error ? `read error: ${error.message.slice(0, 120)}` : founderMailFailing(count ?? null);
    if (detail) failures.push({ check: "ticket-mail", detail });
  }

  // (i) josephbankole.ca: the site answers, and its Tuesday and Friday news desk is still
  //     publishing (jbNewsStale in checks.ts).
  try {
    const res = await fetch(JB_SITE_URL, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    await res.body?.cancel();
    if (res.status !== 200) failures.push({ check: "jb-site", detail: `status ${res.status}` });
  } catch (e) {
    failures.push({ check: "jb-site", detail: `unreachable: ${String(e).slice(0, 120)}` });
  }
  try {
    const res = await fetch(JB_NEWS_FEED_URL, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (res.status !== 200) {
      await res.body?.cancel();
      failures.push({ check: "jb-news", detail: `status ${res.status}` });
    } else {
      const detail = jbNewsStale(await res.text(), now);
      if (detail) failures.push({ check: "jb-news", detail });
    }
  } catch (e) {
    failures.push({ check: "jb-news", detail: `unreachable: ${String(e).slice(0, 120)}` });
  }

  // (j) salon-mirror: the bucket still holds the catalog's files, and a random few of them are
  //     served at the public URL the app uses (mirrorProblem in checks.ts).
  {
    const { data: listed, error } = await supabase.storage.from(MIRROR_BUCKET).list("", { limit: 1000 });
    if (error) {
      failures.push({ check: "salon-mirror", detail: `list error: ${error.message.slice(0, 120)}` });
    } else {
      const names = (listed ?? []).map((o) => o.name).filter((n) => n.endsWith(".jpg"));
      const failed: string[] = [];
      for (const name of mirrorSample(names, MIRROR_SAMPLE)) {
        const url = `${Deno.env.get("SUPABASE_URL") ?? ""}/storage/v1/object/public/${MIRROR_BUCKET}/${name}`;
        try {
          const res = await fetch(url, { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(15_000) });
          if (res.status !== 200) failed.push(`${name} ${res.status}`);
        } catch (e) {
          failed.push(`${name} unreachable: ${String(e).slice(0, 60)}`);
        }
      }
      const detail = mirrorProblem(names.length, failed);
      if (detail) failures.push({ check: "salon-mirror", detail });
    }
  }

  // (d) alert, debounced per check: 6h between alerts for the same failing check. A failed email
  //     gives its slot back and, when configured, goes to the second channel (alert.ts).
  const outcome = await dispatchAlerts(failures, now, alertDeps(supabase), DEBOUNCE_MS);
  const alerted = outcome.alerted;
  if (outcome.mailFailed.length > 0) {
    console.error(`health-probe: alert email failed for ${outcome.mailFailed.join(", ")}; second channel: ${outcome.fallback}`);
  }

  // (f) dead-man ping, every run, so an outside service notices when the probe stops running or
  //     cannot be heard (pingUrl in alert.ts). Optional: HEALTHCHECK_PING_URL unset skips it.
  const ping = pingUrl(Deno.env.get("HEALTHCHECK_PING_URL"), outcome);
  if (ping) {
    try {
      await fetch(ping, { method: "GET", signal: AbortSignal.timeout(10_000) });
    } catch (e) {
      console.error(`health-probe: dead-man ping failed: ${String(e).slice(0, 120)}`);
    }
  }

  return json({
    ok: failures.length === 0,
    failures,
    alerted,
    mailFailed: outcome.mailFailed,
    fallback: outcome.fallback,
    checkedAt: now.toISOString(),
  }, 200);
});

// health_alert_state behind alert.ts's debounce. A read error reads as no previous alert, so a
// missing or broken table means more email rather than none, and is logged.
function alertDeps(supabase: ReturnType<typeof adminClient>): AlertDeps {
  const ntfy = (Deno.env.get("ALERT_NTFY_URL") ?? "").trim();
  return {
    async readLast(check) {
      const { data, error } = await supabase
        .from("health_alert_state")
        .select("last_alert_at")
        .eq("check_name", check)
        .maybeSingle();
      if (error) console.error(`health-probe: health_alert_state read failed: ${error.message.slice(0, 120)}`);
      return typeof data?.last_alert_at === "string" ? data.last_alert_at : null;
    },
    async writeLast(check, at) {
      const { error } = at === null
        ? await supabase.from("health_alert_state").delete().eq("check_name", check)
        : await supabase.from("health_alert_state").upsert({ check_name: check, last_alert_at: at });
      if (error) console.error(`health-probe: health_alert_state write failed: ${error.message.slice(0, 120)}`);
    },
    sendMail: sendFounderMail,
    sendFallback: ntfy
      ? async (text) => {
        try {
          const res = await fetch(ntfy, {
            method: "POST",
            headers: { Title: "ARCHV health", Priority: "high" },
            body: text,
            signal: AbortSignal.timeout(10_000),
          });
          return res.ok;
        } catch {
          return false;
        }
      }
      : null,
  };
}
