// health-probe check (c), pure, so push_check_test.ts can run it under a bare `deno test` with no
// network and no database.
import { decideSend, edmontonDay, type Lead } from "../_shared/push_guard.ts";

// Is the football daily push stuck? Only when today.json carries a lead that daily-push would
// still send (the same guard, decideSend) AND the last push is older than staleMs. A stretch
// with no new lead is not stuck. Until C115 was fixed, every publish in another lane re-sent the
// old lead and kept last_sent_at fresh; football now pushes only when a new transfer or World
// Cup lead lands, and the pool goes five or six days without one (09-09 to 09-15, 10-02 to
// 10-07). Alerting on age alone would email the founder every six hours through each of them.
//
// Once last_sent_at is past staleMs it is not today, so decideSend's "already sent today" rule
// cannot fire here. The age is still measured from the last push, not from when the lead
// landed, so a lead that arrives after a long quiet stretch can alert in the hour before
// daily-push's next tick sends it. The old check alerted in that window too, and the 6h
// debounce holds it to one email. On deploy day push_state still holds the old today-feed
// hash, and the legacy rule reads any lead dated on or before that last push as already sent,
// so the 2026-10-07 lead the old code kept re-sending does not count as owed.
//
// Returns the failure detail to report, or null when there is nothing to alert on.
export function pushOverdue(
  state: { last_build_hash?: unknown; last_sent_at?: unknown } | null,
  todayDoc: unknown,
  now: Date,
  staleMs: number,
): string | null {
  const lastSentAt = typeof state?.last_sent_at === "string" ? state.last_sent_at : "";
  if (!lastSentAt) return "no last_sent_at recorded";
  const at = new Date(lastSentAt);
  if (Number.isNaN(at.getTime())) return `last_sent_at unreadable: ${JSON.stringify(lastSentAt).slice(0, 60)}`;
  if (now.getTime() - at.getTime() <= staleMs) return null;

  const raw = (todayDoc as { lead?: unknown } | null)?.lead;
  const lead = raw && typeof raw === "object" ? raw as Lead : null;
  const lastLeadKey = typeof state?.last_build_hash === "string" && state.last_build_hash
    ? state.last_build_hash
    : null;
  const decision = decideSend({ lastLeadKey, lastSentAt }, lead, edmontonDay(now));
  if (!decision.send) return null;
  return `stale: last_sent_at ${at.toISOString()}, and today.json's lead has not been pushed (${decision.key.slice(0, 160)})`;
}
