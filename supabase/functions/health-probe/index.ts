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
  const guard = Deno.env.get("PUSH_SECRET");
  if (guard && req.headers.get("x-push-secret") !== guard) {
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
