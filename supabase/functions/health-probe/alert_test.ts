// Unit tests for health-probe's alert step (alert.ts). Run: `deno test` from this dir.
import { type AlertDeps, dispatchAlerts, fallbackText, pingUrl } from "./alert.ts";

function assertEquals(actual: unknown, expected: unknown, msg = ""): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`expected ${e} got ${a}${msg ? ` — ${msg}` : ""}`);
}

const SIX_H = 6 * 60 * 60 * 1000;
const NOW = new Date("2026-11-15T15:00:00Z");

function fakeDeps(opts: {
  slots?: Record<string, string>;
  mailOk?: boolean;
  fallback?: boolean | null; // null: not configured
}) {
  const slots: Record<string, string> = { ...(opts.slots ?? {}) };
  const mails: string[] = [];
  const pushes: string[] = [];
  const deps: AlertDeps = {
    readLast: (c) => Promise.resolve(slots[c] ?? null),
    writeLast: (c, at) => {
      if (at === null) delete slots[c];
      else slots[c] = at;
      return Promise.resolve();
    },
    sendMail: (subject) => {
      mails.push(subject);
      return Promise.resolve(opts.mailOk ?? true);
    },
    sendFallback: opts.fallback === null || opts.fallback === undefined ? null : (text) => {
      pushes.push(text);
      return Promise.resolve(opts.fallback as boolean);
    },
  };
  return { deps, slots, mails, pushes };
}

const fail = (check: string) => ({ check, detail: "something" });

Deno.test("a sent alert claims its slot and a second run inside six hours stays quiet", async () => {
  const t = fakeDeps({});
  const first = await dispatchAlerts([fail("site")], NOW, t.deps, SIX_H);
  assertEquals(first, { alerted: ["site"], mailFailed: [], fallback: null });
  assertEquals(t.slots.site, NOW.toISOString());
  const later = new Date(NOW.getTime() + 30 * 60 * 1000);
  const second = await dispatchAlerts([fail("site")], later, t.deps, SIX_H);
  assertEquals(second.alerted, []);
  assertEquals(t.mails.length, 1);
});

Deno.test("a failed email gives the slot back, so the next tick tries again", async () => {
  const t = fakeDeps({ mailOk: false });
  const out = await dispatchAlerts([fail("feed")], NOW, t.deps, SIX_H);
  assertEquals(out, { alerted: [], mailFailed: ["feed"], fallback: "not-configured" });
  assertEquals("feed" in t.slots, false, "no slot left behind");
  const later = new Date(NOW.getTime() + 30 * 60 * 1000);
  await dispatchAlerts([fail("feed")], later, t.deps, SIX_H);
  assertEquals(t.mails.length, 2, "retried on the next tick");
});

Deno.test("a failed email restores an older slot rather than deleting it", async () => {
  const old = "2026-11-14T00:00:00.000Z";
  const t = fakeDeps({ mailOk: false, slots: { feed: old } });
  await dispatchAlerts([fail("feed")], NOW, t.deps, SIX_H);
  assertEquals(t.slots.feed, old);
});

Deno.test("an email that fails goes to the second channel by name, and that debounces", async () => {
  const t = fakeDeps({ mailOk: false, fallback: true });
  const out = await dispatchAlerts([fail("site"), fail("feed")], NOW, t.deps, SIX_H);
  assertEquals(out.fallback, "sent");
  assertEquals(t.pushes, [fallbackText(["site", "feed"])]);
  assertEquals(t.pushes[0].includes("something"), false, "no detail on the second channel");
  assertEquals(t.slots.site, NOW.toISOString());
  const later = new Date(NOW.getTime() + 30 * 60 * 1000);
  await dispatchAlerts([fail("site")], later, t.deps, SIX_H);
  assertEquals(t.pushes.length, 1, "second channel held to the same six hours");
});

Deno.test("when the second channel fails too, the slots stay free", async () => {
  const t = fakeDeps({ mailOk: false, fallback: false });
  const out = await dispatchAlerts([fail("site")], NOW, t.deps, SIX_H);
  assertEquals(out.fallback, "failed");
  assertEquals("site" in t.slots, false);
});

Deno.test("an unreadable last alert time does not block an alert", async () => {
  const t = fakeDeps({ slots: { site: "not a date" } });
  const out = await dispatchAlerts([fail("site")], NOW, t.deps, SIX_H);
  assertEquals(out.alerted, ["site"]);
});

Deno.test("the dead-man ping fails only when an alert went unheard", () => {
  const base = "https://hc-ping.example/abc/";
  assertEquals(pingUrl(null, { alerted: [], mailFailed: [], fallback: null }), null);
  assertEquals(pingUrl("  ", { alerted: [], mailFailed: [], fallback: null }), null);
  assertEquals(pingUrl(base, { alerted: ["site"], mailFailed: [], fallback: null }), "https://hc-ping.example/abc");
  assertEquals(pingUrl(base, { alerted: [], mailFailed: ["site"], fallback: "sent" }), "https://hc-ping.example/abc");
  assertEquals(pingUrl(base, { alerted: [], mailFailed: ["site"], fallback: "failed" }), "https://hc-ping.example/abc/fail");
  assertEquals(pingUrl(base, { alerted: [], mailFailed: ["site"], fallback: "not-configured" }), "https://hc-ping.example/abc/fail");
});
