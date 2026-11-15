// health-probe's checks on the scores poller, season mode, the API quota, the football lead, the
// two public sign-up surfaces and the support-ticket queue. Pure, so checks_test.ts runs them with no network and no database:
// index.ts does the reads and hands the results in. Each returns the failure detail, or null.

// The minute poll refreshes the three-day schedule every 30 minutes (SCHEDULE_EVERY_MS in
// scores-poll/plan.ts), and a partial refresh comes due again in five. schedule_fetched_at stops
// moving when every competition's request fails (a dead or over-quota key backs off and keeps the
// old schedule), when the cron job stops, or when the state write fails. Two hours is four missed
// refreshes in a row.
export const POLL_STALE_MS = 2 * 60 * 60 * 1000;
// scores-poll retries a failed upload every minute (poll.ts nextWriteFailedSince), so a quarter of
// an hour of unbroken failures is storage refusing writes, not a blip.
export const WRITE_FAILED_ALERT_MS = 15 * 60 * 1000;
// Season mode lists one competition at :07, :22 and :37 of 00, 06, 12 and 18 UTC
// (scores-poll/season.ts). Seven hours is a whole round of listings missed.
export const SEASON_STALE_MS = 7 * 60 * 60 * 1000;
// Below this, season mode stops asking the API for the rest of the UTC day (QUOTA_RESERVE in
// scores-poll/season.ts), and the minute poll has little left.
export const QUOTA_ALERT_BELOW = 1_500;

const age = (iso: unknown, now: Date): number | null => {
  if (typeof iso !== "string" || !iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : now.getTime() - t;
};

// scores_poll_state: has the minute poll refreshed its schedule recently?
export function scoresPollStale(row: Record<string, unknown> | null | undefined, now: Date): string | null {
  if (!row) return "scores_poll_state row missing";
  const a = age(row.schedule_fetched_at, now);
  if (a === null) return `no schedule fetch recorded (schedule_fetched_at ${JSON.stringify(row.schedule_fetched_at ?? null)})`;
  if (a <= POLL_STALE_MS) return null;
  const backoff = typeof row.backoff_until === "string" ? `, backoff_until ${row.backoff_until}` : "";
  return `schedule last fetched ${row.schedule_fetched_at}, over ${POLL_STALE_MS / 3_600_000}h ago${backoff}`;
}

// scores_poll_state.write_failed_since: have uploads been failing long enough that scores.json is
// frozen? schedule_fetched_at keeps moving through a storage outage, so scoresPollStale cannot
// see one. A row from before migration 20261115130200 has no such column and reads as healthy.
export function scoresWriteFailing(row: Record<string, unknown> | null | undefined, now: Date): string | null {
  const a = age(row?.write_failed_since, now);
  if (a === null || a <= WRITE_FAILED_ALERT_MS) return null;
  return `scores-poll uploads failing since ${row!.write_failed_since}, over ${WRITE_FAILED_ALERT_MS / 60_000} minutes`;
}

// scores_season_state: has a season listing landed recently? listed_at maps each competition to
// the time its listing last succeeded.
export function seasonStale(row: Record<string, unknown> | null | undefined, now: Date): string | null {
  if (!row) return "scores_season_state row missing";
  const listed = row.listed_at && typeof row.listed_at === "object" && !Array.isArray(row.listed_at)
    ? Object.values(row.listed_at as Record<string, unknown>)
    : [];
  const ages = listed.map((v) => age(v, now)).filter((a): a is number => a !== null);
  if (ages.length === 0) return "no season listing recorded";
  const newest = Math.min(...ages);
  if (newest <= SEASON_STALE_MS) return null;
  return `newest season listing is ${Math.round(newest / 3_600_000)}h old`;
}

// API-Football's own daily count left, as season mode last read it. Only a reading from today
// (UTC, the API's day) says anything about today.
export function quotaLow(row: Record<string, unknown> | null | undefined, now: Date): string | null {
  if (!row || typeof row.remaining !== "number") return null;
  const at = typeof row.remaining_at === "string" ? row.remaining_at : "";
  if (at.slice(0, 10) !== now.toISOString().slice(0, 10)) return null;
  if (row.remaining >= QUOTA_ALERT_BELOW) return null;
  return `API-Football requests left today: ${row.remaining} (read ${at}), below ${QUOTA_ALERT_BELOW}`;
}

// The football lead's own date. today.json's envelope lastUpdated is the newest date across every
// lane and sport (build-feed.mjs), so another sport publishing keeps it fresh after the football
// desks stop. today.json's lead is the newest football entry (transfer, World Cup and Leagues), so
// its date going stale is the football desks stopping. Same window as the feed check: staleMs past
// the end of the lead's editorial day.
export function footballLeadStale(todayDoc: unknown, now: Date, staleMs: number): string | null {
  const lead = (todayDoc as { lead?: unknown } | null)?.lead;
  if (!lead || typeof lead !== "object") return "today.json carries no football lead";
  const date = (lead as { date?: unknown }).date;
  const start = typeof date === "string" ? new Date(`${date}T00:00:00Z`) : null;
  if (!start || Number.isNaN(start.getTime())) return `football lead date unreadable: ${JSON.stringify(date ?? null)}`;
  const dayEnd = start.getTime() + 24 * 60 * 60 * 1000;
  if (now.getTime() - dayEnd <= staleMs) return null;
  return `football lead dated ${date}, over ${Math.round(staleMs / 3_600_000)}h past that day`;
}

// salon-store GET: the Salon app's shop switch. The app reads any error as "shop closed", so a
// broken switch is invisible from the app; this is the only place it shows.
export function salonStoreProblem(status: number, body: unknown): string | null {
  if (status !== 200) return `status ${status}`;
  const doc = body as { schema?: unknown; storeOpen?: unknown } | null;
  if (doc?.schema !== "gallery-store/1") return `unexpected schema ${JSON.stringify(doc?.schema ?? null).slice(0, 60)}`;
  if (typeof doc.storeOpen !== "boolean") return "storeOpen missing";
  return null;
}

// android-waitlist answers its CORS preflight with 200 once it is deployed and boots. A 401 or
// 403 means the gateway wanted a key, which says nothing about the function, so only a missing
// function or a server error counts.
export function waitlistDown(status: number): string | null {
  if (status === 404 || status >= 500) return `preflight answered ${status}`;
  return null;
}

// Support tickets waiting for triage that nothing has touched for TICKET_STUCK_MS: a webhook
// triage that never ran leaves a ticket at 'new', and a drain that is not running, or cannot keep
// up, leaves them at 'pending_triage', and a triage run that died after claiming one leaves it at
// 'l1_working'. Every triage attempt updates the row, so a ticket the drain
// is still retrying stays under the line. Only the count goes in the alert, never ticket content.
export const TICKET_STUCK_MS = 2 * 60 * 60 * 1000;
export const TICKET_WAITING_STATUSES = ["new", "pending_triage", "l1_working"] as const;

export function ticketsStuck(count: number | null): string | null {
  if (count === null || count <= 0) return null;
  return `${count} ticket${count === 1 ? "" : "s"} waiting at new, pending_triage or l1_working, untouched for over ${TICKET_STUCK_MS / 3_600_000}h`;
}
