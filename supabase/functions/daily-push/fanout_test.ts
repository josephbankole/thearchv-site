// Unit tests for the daily-push fan-out helpers (fanout.ts). Run: `deno test` from this dir.
// Dependency-free on purpose — a tiny local assert instead of std/assert so the suite runs
// under a bare `deno test` with no network fetch. These cover the two pieces that carry the
// send loop's invariants: the bounded worker pool and the reason-gated result classification.
import { classifyApnsResult, runPool } from "./fanout.ts";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}
function assertEquals(actual: unknown, expected: unknown, msg = ""): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`expected ${e} got ${a}${msg ? ` — ${msg}` : ""}`);
}
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---- runPool: bounded concurrency ----

Deno.test("runPool never exceeds the concurrency cap", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const items = Array.from({ length: 200 }, (_, i) => i);
  await runPool(items, 50, async (n) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await delay(1);
    inFlight--;
    return n;
  });
  assert(maxInFlight <= 50, `maxInFlight ${maxInFlight} exceeded 50`);
  assert(maxInFlight === 50, `expected pool to fill to 50, saw ${maxInFlight}`);
});

Deno.test("runPool processes every item exactly once, results in item order", async () => {
  const items = Array.from({ length: 137 }, (_, i) => i);
  const seen = new Set<number>();
  const results = await runPool(items, 50, async (n) => {
    seen.add(n);
    // jitter so completion order differs from input order; results must still be ordered
    await delay(n % 3);
    return n * 2;
  });
  assertEquals(seen.size, 137, "each item processed once");
  assertEquals(results, items.map((n) => n * 2), "results preserve input order");
});

Deno.test("runPool with fewer items than concurrency still completes all", async () => {
  const items = [1, 2, 3];
  let count = 0;
  const results = await runPool(items, 50, async (n) => {
    count++;
    return n + 1;
  });
  assertEquals(count, 3);
  assertEquals(results, [2, 3, 4]);
});

Deno.test("runPool on an empty list is a no-op", async () => {
  let called = false;
  const results = await runPool<number, number>([], 50, async (n) => {
    called = true;
    return n;
  });
  assertEquals(results, []);
  assert(!called, "worker should never run for an empty list");
});

// ---- classifyApnsResult: reason-gated deletion ----

Deno.test("200 is a success, never dead, no reason key", () => {
  assertEquals(classifyApnsResult(200, ""), { ok: true, dead: false, reasonKey: "" });
});

Deno.test("only BadDeviceToken and Unregistered mark a token dead", () => {
  assertEquals(classifyApnsResult(400, "BadDeviceToken"), { ok: false, dead: true, reasonKey: "BadDeviceToken" });
  assertEquals(classifyApnsResult(410, "Unregistered"), { ok: false, dead: true, reasonKey: "Unregistered" });
});

Deno.test("systemic failures are counted but never delete the token", () => {
  // A bundle-id slip, rate limiting, or an auth error must not wipe tokens.
  assertEquals(classifyApnsResult(400, "BadTopic"), { ok: false, dead: false, reasonKey: "BadTopic" });
  assertEquals(classifyApnsResult(429, "TooManyRequests"), { ok: false, dead: false, reasonKey: "TooManyRequests" });
  assertEquals(classifyApnsResult(403, "ExpiredProviderToken"), { ok: false, dead: false, reasonKey: "ExpiredProviderToken" });
});

Deno.test("a reason-less failure buckets under http_<status>", () => {
  assertEquals(classifyApnsResult(500, ""), { ok: false, dead: false, reasonKey: "http_500" });
  assertEquals(classifyApnsResult(503, ""), { ok: false, dead: false, reasonKey: "http_503" });
});

// ---- integration: the pool + classifier reproduce the handler's aggregation ----

Deno.test("fan-out aggregation matches the sequential contract", async () => {
  // A mixed token table: 3 good, 1 dead (Unregistered), 1 dead (BadDeviceToken),
  // 2 systemic (BadTopic) that must be counted but kept.
  const responses: Record<string, { status: number; reason: string }> = {
    "ok-1": { status: 200, reason: "" },
    "ok-2": { status: 200, reason: "" },
    "ok-3": { status: 200, reason: "" },
    "gone-1": { status: 410, reason: "Unregistered" },
    "bad-1": { status: 400, reason: "BadDeviceToken" },
    "topic-1": { status: 400, reason: "BadTopic" },
    "topic-2": { status: 400, reason: "BadTopic" },
  };
  const tokens = Object.keys(responses);

  let sent = 0;
  let failed = 0;
  const deadTokens: string[] = [];
  const failureReasons: Record<string, number> = {};

  await runPool(tokens, 50, async (token) => {
    const r = responses[token];
    const c = classifyApnsResult(r.status, r.reason);
    if (c.ok) {
      sent++;
    } else {
      failed++;
      failureReasons[c.reasonKey] = (failureReasons[c.reasonKey] ?? 0) + 1;
      if (c.dead) deadTokens.push(token);
    }
    return c;
  });

  assertEquals(sent, 3, "three 200s");
  assertEquals(failed, 4, "four non-200s");
  assertEquals(deadTokens.sort(), ["bad-1", "gone-1"], "only reason-gated tokens are dead");
  assertEquals(failureReasons, { Unregistered: 1, BadDeviceToken: 1, BadTopic: 2 }, "reasons tallied");
});
