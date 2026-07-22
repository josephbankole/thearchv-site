// health-probe: pg_cron sweep (every 30 minutes) that checks the launch-critical surface is up,
// independent of the founder's Mac. Read-only against everything: never writes to push_state,
// never calls Anthropic.
//
// Checks:
//   (a) https://thearchv.ca/ returns 200
//   (b) https://thearchv.ca/feed/today.json returns 200 AND its lastUpdated is within 26h
//   (c) push_state row is readable and last_sent_at is not older than 26h, but ONLY checked
//       11:00-23:59 UTC (before 11:00 UTC the day's push legitimately has not fired yet)
// On any failure, sends ONE alert email to the founder via the same Zoho Mail send path
// support-triage's L3 escalation uses (../_shared/zoho.ts), subject "ARCHV health: <check> failing".
// Debounced per check: health_alert_state records the last alert time, and a check will not
// re-alert within 6 hours of its own last alert.
//
// Guarded with x-push-secret, matched against the PUSH_SECRET vault secret — the same pattern
// daily-push's pg_cron caller uses.
import { adminClient, json } from "../_shared/cors.ts";
import { sendFounderMail } from "../_shared/zoho.ts";

const SITE_URL = "https://thearchv.ca/";
const FEED_URL = "https://thearchv.ca/feed/today.json";
const STALE_MS = 26 * 60 * 60 * 1000;
const DEBOUNCE_MS = 6 * 60 * 60 * 1000;

type Failure = { check: string; detail: string };

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

  // (b) feed 200 + fresh
  try {
    const res = await fetch(FEED_URL, { cache: "no-store" });
    if (res.status !== 200) {
      failures.push({ check: "feed", detail: `status ${res.status}` });
    } else {
      const data = await res.json();
      const raw = data?.lastUpdated;
      // today.json's lastUpdated is a calendar DATE ("YYYY-MM-DD"), the editorial date of the
      // lead story, not a build timestamp — the engine's normal cadence means "today's" feed
      // legitimately still carries yesterday's date for hours after midnight UTC. Anchor the
      // 26h freshness window at the END of that editorial day (i.e. the moment it rolled from
      // current to historical), not at its midnight start, so a healthy daily cadence doesn't
      // read as stale for the first ~24h of every day.
      const dayStart = raw ? new Date(`${raw}T00:00:00Z`) : null;
      if (!dayStart || Number.isNaN(dayStart.getTime())) {
        failures.push({ check: "feed", detail: `missing/invalid lastUpdated: ${JSON.stringify(raw)}` });
      } else {
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
        if (now.getTime() - dayEnd.getTime() > STALE_MS) {
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
  // fired yet and this must not alert.
  if (now.getUTCHours() >= 11) {
    const { data: state, error } = await supabase
      .from("push_state")
      .select("last_sent_at")
      .eq("id", 1)
      .maybeSingle();
    if (error) {
      failures.push({ check: "push_state", detail: `read error: ${error.message.slice(0, 120)}` });
    } else if (!state?.last_sent_at) {
      failures.push({ check: "push_state", detail: "no last_sent_at recorded" });
    } else {
      const last = new Date(state.last_sent_at);
      if (now.getTime() - last.getTime() > STALE_MS) {
        failures.push({ check: "push_state", detail: `stale: last_sent_at ${last.toISOString()}` });
      }
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

  // (d) alert, debounced per check — 6h between alerts for the same failing check.
  const alerted: string[] = [];
  for (const f of failures) {
    const shouldAlert = await claimAlertSlot(supabase, f.check, now);
    if (!shouldAlert) continue;
    const sent = await sendFounderMail(
      `ARCHV health: ${f.check} failing`,
      `Launch health probe found a failing check.\n\n` +
        `Check: ${f.check}\nDetail: ${f.detail}\nChecked at (UTC): ${now.toISOString()}\n\n` +
        `This alert is debounced 6h per check; you will not be re-alerted for the same check ` +
        `sooner than that even if it keeps failing.`,
    );
    if (sent) alerted.push(f.check);
  }

  return json({ ok: failures.length === 0, failures, alerted, checkedAt: now.toISOString() }, 200);
});

// Debounce: only claims the slot (and returns true, meaning "go ahead and alert") if the last
// alert for this check was more than DEBOUNCE_MS ago, or there was none. Claims BEFORE the email
// send so a slow/failed send can't cause a flood of retries within the window.
async function claimAlertSlot(
  supabase: ReturnType<typeof adminClient>,
  checkName: string,
  now: Date,
): Promise<boolean> {
  const { data } = await supabase
    .from("health_alert_state")
    .select("last_alert_at")
    .eq("check_name", checkName)
    .maybeSingle();
  if (data?.last_alert_at) {
    const last = new Date(data.last_alert_at).getTime();
    if (now.getTime() - last < DEBOUNCE_MS) return false;
  }
  await supabase.from("health_alert_state").upsert({ check_name: checkName, last_alert_at: now.toISOString() });
  return true;
}
