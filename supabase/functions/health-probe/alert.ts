// health-probe's alert step, pure, so alert_test.ts can run it with no network and no database.
//
// Each failing check gets at most one founder email every debounceMs (6h). The slot is claimed
// before the send, so a slow send cannot double up, and given back when the send fails, so the next
// tick (30 minutes later) tries again instead of the alert being lost for six hours. When any email
// fails and a second channel is configured (ALERT_NTFY_URL), one short message naming the checks
// goes there; if it lands, those checks keep their slot, so the second channel is debounced too.
export type Failure = { check: string; detail: string };

export type AlertDeps = {
  // The last alert time for a check, or null for none. An error reads as none (and is logged by
  // the caller's implementation), so a broken debounce table alerts rather than goes quiet.
  readLast(check: string): Promise<string | null>;
  // Records the slot; null removes it.
  writeLast(check: string, at: string | null): Promise<void>;
  sendMail(subject: string, body: string): Promise<boolean>;
  // The second channel, or null when none is configured.
  sendFallback: ((text: string) => Promise<boolean>) | null;
};

export type AlertOutcome = {
  alerted: string[]; // emailed
  mailFailed: string[]; // email failed
  fallback: "sent" | "failed" | "not-configured" | null; // null: no email failed
};

export function alertMail(f: Failure, now: Date): { subject: string; body: string } {
  return {
    subject: `ARCHV health: ${f.check} failing`,
    body: `Launch health probe found a failing check.\n\n` +
      `Check: ${f.check}\nDetail: ${f.detail}\nChecked at (UTC): ${now.toISOString()}\n\n` +
      `This alert is debounced 6h per check; you will not be re-alerted for the same check ` +
      `sooner than that even if it keeps failing.`,
  };
}

// Names only, never the detail: a push topic may be readable by anyone who knows its name.
export function fallbackText(checks: string[]): string {
  return `ARCHV health: ${checks.join(", ")} failing. The alert email could not be sent.`;
}

export async function dispatchAlerts(
  failures: Failure[],
  now: Date,
  deps: AlertDeps,
  debounceMs: number,
): Promise<AlertOutcome> {
  const alerted: string[] = [];
  const mailFailed: string[] = [];
  const stamp = now.toISOString();
  for (const f of failures) {
    const last = await deps.readLast(f.check);
    if (last) {
      const at = new Date(last).getTime();
      if (!Number.isNaN(at) && now.getTime() - at < debounceMs) continue;
    }
    await deps.writeLast(f.check, stamp);
    const { subject, body } = alertMail(f, now);
    if (await deps.sendMail(subject, body)) {
      alerted.push(f.check);
    } else {
      await deps.writeLast(f.check, last);
      mailFailed.push(f.check);
    }
  }
  if (mailFailed.length === 0) return { alerted, mailFailed, fallback: null };
  if (!deps.sendFallback) return { alerted, mailFailed, fallback: "not-configured" };
  const ok = await deps.sendFallback(fallbackText(mailFailed));
  if (ok) for (const check of mailFailed) await deps.writeLast(check, stamp);
  return { alerted, mailFailed, fallback: ok ? "sent" : "failed" };
}

// The dead-man ping URL for this run: the plain URL when every alert that had to go out went out,
// and <url>/fail when an email failed and no second channel took it, so a Healthchecks.io-style
// service raises the alarm on its own. Null when no ping URL is configured.
export function pingUrl(base: string | null | undefined, outcome: AlertOutcome): string | null {
  const url = (base ?? "").trim().replace(/\/+$/, "");
  if (!url) return null;
  const unheard = outcome.mailFailed.length > 0 && outcome.fallback !== "sent";
  return unheard ? `${url}/fail` : url;
}
