// health-probe: pg_cron sweep (every 30 minutes) that checks the launch-critical surface is up,
// independent of the founder's Mac. Read-only against everything: never writes to push_state,
// never calls Anthropic.
//
// Checks:
//   (a) https://thearchv.ca/ returns 200
//   (b) https://thearchv.ca/feed/today.json returns 200 AND its lastUpdated is within 72h
//   (c) push_state row is readable and, while today.json's lead is one daily-push has not sent,
//       last_sent_at is not older than 76h, but ONLY checked 11:00-23:59 UTC (before 11:00 UTC
//       the day's push legitimately has not fired yet)
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
import { sendFounderMail } from "../_shared/zoho.ts";
import { type AlertDeps, dispatchAlerts, type Failure, pingUrl } from "./alert.ts";
import { pushOverdue } from "./push_check.ts";

const SITE_URL = "https://thearchv.ca/";
const FEED_URL = "https://thearchv.ca/feed/today.json";
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

  // (c) push_state, gated to 11:00-23:59 UTC — before that, the day's push legitimately has not
  // fired yet and this must not alert. An old last_sent_at is a failure only while today.json
  // carries a lead daily-push would still send: since C115, football pushes only when a new
  // lead lands, and a quiet week is not a broken push (see push_check.ts). Without today.json
  // there is no telling, and check (b) has already reported the feed, so this stays quiet
  // rather than alerting twice.
  if (now.getUTCHours() >= 11) {
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

  // (e) pages-deploy: confirm the most recent COMPLETED "Deploy to GitHub Pages" run
  // succeeded. Public repo, unauthenticated GET, one call per 30-min probe tick — well
  // within GitHub's rate limits. This is what would have caught the silent-build-failure
  // incident (a TypeScript error in a content commit failed the Pages build with no
  // alert; the site stayed stale and nothing here or elsewhere caught it). A GitHub API
  // hiccup (network error, non-200, unexpected response shape) logs and is SKIPPED, not
  // alerted — this check must never cry wolf over GitHub API flakiness.
  try {
    const res = await fetch(
      "https://api.github.com/repos/josephbankole/thearchv-site/actions/runs?per_page=5",
      { headers: { "User-Agent": "archv-health-probe", Accept: "application/vnd.github+json" }, cache: "no-store" },
    );
    if (res.status !== 200) {
      console.error(`health-probe: pages-deploy check skipped — GitHub API status ${res.status}`);
    } else {
      const data = await res.json();
      const runs = Array.isArray(data?.workflow_runs) ? data.workflow_runs : [];
      const deployRun = runs.find(
        (r: { name?: string; status?: string }) => r?.name === "Deploy to GitHub Pages" && r?.status === "completed",
      );
      if (!deployRun) {
        console.error("health-probe: pages-deploy check skipped — no completed 'Deploy to GitHub Pages' run in the last 5");
      } else if (deployRun.conclusion === "failure") {
        failures.push({ check: "pages-deploy", detail: `latest completed run ${deployRun.id} concluded "failure"` });
      }
    }
  } catch (e) {
    console.error(`health-probe: pages-deploy check skipped — fetch error: ${String(e).slice(0, 120)}`);
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
