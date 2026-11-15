// What one sport's daily-push fan-out delivered, written by daily-push after it sends and read by
// health-probe. The columns are on push_state (football) and push_sport_state (every other sport),
// added by migration 20261115130100_push_run_outcome.sql. Pure, for push_run_test.ts.

// The most dead tokens one daily-push run deletes (MAX_TOKEN_DELETIONS_PER_RUN in
// daily-push/index.ts). More than this in one sport's run means cleanup cannot keep up, which is the
// tokenDeletionAnomaly signal.
export const DEAD_TOKEN_ALERT = 25;
// A run older than this is not judged: the push has had a later chance, or no new lead has come.
export const RUN_ALERT_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const TOP_REASONS = 5;

export type RunOutcome = {
  claimed: number;
  sent: number;
  failed: number;
  dead: number;
  reasons: Record<string, number>;
};

export function runOutcomeRow(o: RunOutcome, at: Date): Record<string, unknown> {
  const top = Object.entries(o.reasons)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOP_REASONS);
  return {
    last_run_at: at.toISOString(),
    last_run_claimed: o.claimed,
    last_run_sent: o.sent,
    last_run_failed: o.failed,
    last_run_dead: o.dead,
    last_run_reasons: Object.fromEntries(top),
  };
}

// Is the last recorded fan-out a failure worth an alert? Returns the detail, or null. A run that
// sent nothing, failed more than half its sends, or found more dead tokens than one run may delete
// alerts; a run with nothing claimed, an old run, or a row with no run recorded does not.
export function pushRunFailing(row: Record<string, unknown> | null | undefined, now: Date): string | null {
  if (!row) return null;
  const at = typeof row.last_run_at === "string" ? Date.parse(row.last_run_at) : NaN;
  if (Number.isNaN(at) || now.getTime() - at > RUN_ALERT_MAX_AGE_MS) return null;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const claimed = n(row.last_run_claimed);
  const sent = n(row.last_run_sent);
  const failed = n(row.last_run_failed);
  const dead = n(row.last_run_dead);
  const reasons = row.last_run_reasons && typeof row.last_run_reasons === "object"
    ? JSON.stringify(row.last_run_reasons).slice(0, 160)
    : "{}";
  const when = new Date(at).toISOString();
  if (claimed > 0 && sent === 0) {
    return `last run (${when}) sent 0 of ${claimed} claimed, ${failed} failed, reasons ${reasons}`;
  }
  if (claimed > 0 && failed / claimed > 0.5) {
    return `last run (${when}) failed ${failed} of ${claimed} claimed (sent ${sent}), reasons ${reasons}`;
  }
  if (dead > DEAD_TOKEN_ALERT) {
    return `last run (${when}) found ${dead} dead tokens, more than one run deletes (${DEAD_TOKEN_ALERT})`;
  }
  return null;
}
