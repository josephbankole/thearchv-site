// Unit tests for the daily-push fan-out helpers (fanout.ts). Run: `deno test` from this dir.
// Dependency-free on purpose — a tiny local assert instead of std/assert so the suite runs
// under a bare `deno test` with no network fetch. These cover the pieces that carry the send
// loop's invariants: the bounded worker pool (including how it drains when a worker throws),
// the reason-gated result classification, and the classification of a send that throws.
import {
  classifyApnsResult,
  classifySendError,
  describeError,
  NETWORK_REASON,
  runPool,
  sendAndClassify,
} from "./fanout.ts";

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

// ---- runPool: a throwing worker costs its own item, never the tail (code review 2026-09-25) ----

// Awaits `p`, which must reject, and hands back what it rejected with.
async function rejection(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("assertion failed: expected the promise to reject, it resolved");
}

Deno.test("runPool drains every item before rejecting when one worker throws", async () => {
  // The review's scenario: 200 tokens, the 61st send throws. The old pool rejected at once and
  // left the other workers' remaining items unpulled.
  const items = Array.from({ length: 200 }, (_, i) => i);
  const attempted = new Set<number>();
  const boom = new Error("connection reset");
  const err = await rejection(runPool(items, 50, async (n) => {
    attempted.add(n);
    await delay(n % 3);
    if (n === 60) throw boom;
    return n;
  }));
  assertEquals(attempted.size, 200, "every item attempted before the pool settled");
  assert(err === boom, "a single throw rejects with the original error");
});

Deno.test("runPool gathers several throws into one AggregateError, after draining", async () => {
  const items = Array.from({ length: 120 }, (_, i) => i);
  let attempted = 0;
  const err = await rejection(runPool(items, 50, async (n) => {
    attempted++;
    await delay(1);
    if (n % 40 === 0) throw new Error(`fail ${n}`);
    return n;
  }));
  assertEquals(attempted, 120, "every item attempted");
  assert(err instanceof AggregateError, "several throws reject with an AggregateError");
  const messages = (err as AggregateError).errors.map((e: Error) => e.message).sort();
  assertEquals(messages, ["fail 0", "fail 40", "fail 80"], "each throw is carried");
});

Deno.test("runPool keeps its concurrency cap while workers throw", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const items = Array.from({ length: 200 }, (_, i) => i);
  await rejection(runPool(items, 50, async (n) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await delay(1);
    inFlight--;
    if (n % 7 === 0) throw new Error("throw");
    return n;
  }));
  assert(maxInFlight <= 50, `maxInFlight ${maxInFlight} exceeded 50`);
  assertEquals(inFlight, 0, "no worker left running once the pool settled");
});

Deno.test("runPool reports progress only for items that produced a result", async () => {
  const progressed: number[] = [];
  await rejection(runPool([0, 1, 2, 3, 4], 2, async (n) => {
    if (n === 2) throw new Error("throw");
    return n;
  }, (_done, _r, index) => progressed.push(index)));
  assertEquals(progressed.sort(), [0, 1, 3, 4], "the thrown item has no progress call");
});

// ---- classifying a send that throws: counted, never dead ----

Deno.test("a thrown send is one network failure and never marks the token dead", () => {
  const thrown: unknown[] = [
    new TypeError("error sending request: connection reset"),
    new DOMException("The signal has been aborted", "AbortError"),
    new Error("http2 error: GOAWAY"),
    "a bare string",
    undefined,
    null,
    { weird: true },
  ];
  for (const e of thrown) {
    const c = classifySendError(e);
    assertEquals(c.ok, false, `ok for ${String(e)}`);
    assertEquals(c.dead, false, `dead for ${String(e)}`);
    assertEquals(c.reasonKey, NETWORK_REASON, `reasonKey for ${String(e)}`);
    assert(typeof c.detail === "string", "a thrown send carries a detail for the log");
  }
});

Deno.test("the network key cannot collide with an APNs reason or an http_ bucket", () => {
  assertEquals(NETWORK_REASON, "network");
  assert(classifyApnsResult(500, "").reasonKey !== NETWORK_REASON, "http_ bucket differs");
});

Deno.test("describeError never throws and masks device tokens", () => {
  const token = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";
  const denoStyle = new TypeError(
    `error sending request for url (https://api.push.apple.com/3/device/${token}): connection reset`,
  );
  const d = describeError(denoStyle);
  assert(!d.includes(token), `token leaked into the log line: ${d}`);
  assert(d.includes("/3/device/<token>"), `url path not masked as expected: ${d}`);
  assert(d.startsWith("TypeError"), "error name kept");
  assert(!describeError(`bare ${token} in a message`).includes(token), "bare hex token masked");
  const unprintable = { toString() { throw new Error("no"); } };
  assertEquals(describeError(unprintable), "unprintable error");
  assertEquals(describeError(Object.create(null)), "unprintable error");
  assert(describeError("x".repeat(500)).length <= 160, "detail is capped");
});

Deno.test("sendAndClassify never rejects, whatever the send does", async () => {
  // A send that throws synchronously inside the async function, one that rejects later, and
  // one whose body read fails: all three are network failures, none kills the token.
  const throwsAtOnce = await sendAndClassify(() => { throw new TypeError("dns error"); });
  const rejectsLater = await sendAndClassify(async () => {
    await delay(1);
    throw new Error("connection reset");
  });
  const bodyReadFails = await sendAndClassify(async () => {
    await Promise.resolve();
    return JSON.parse("not json") as { status: number; reason: string };
  });
  for (const c of [throwsAtOnce, rejectsLater, bodyReadFails]) {
    assertEquals([c.ok, c.dead, c.reasonKey], [false, false, NETWORK_REASON]);
  }
});

Deno.test("sendAndClassify passes a real APNs answer to classifyApnsResult unchanged", async () => {
  assertEquals(await sendAndClassify(async () => ({ status: 200, reason: "" })), classifyApnsResult(200, ""));
  assertEquals(
    await sendAndClassify(async () => ({ status: 410, reason: "Unregistered" })),
    { ok: false, dead: true, reasonKey: "Unregistered" },
  );
  assertEquals(
    await sendAndClassify(async () => ({ status: 400, reason: "BadTopic" })),
    { ok: false, dead: false, reasonKey: "BadTopic" },
  );
});

// ---- integration: the review's failure, replayed through the handler's worker shape ----

Deno.test("a thrown send on the 61st of 200 tokens costs that send only", async () => {
  // Mirrors index.ts: the worker is built on sendAndClassify and tallies synchronously. The 61st
  // token's socket dies; one dead token and one systemic failure are mixed in for good measure.
  const tokens = Array.from({ length: 200 }, (_, i) => `tok-${i}`);
  const send = async (token: string): Promise<{ status: number; reason: string }> => {
    await delay(Number(token.slice(4)) % 3);
    if (token === "tok-60") throw new TypeError("error sending request: connection reset");
    if (token === "tok-100") return { status: 410, reason: "Unregistered" };
    if (token === "tok-150") return { status: 429, reason: "TooManyRequests" };
    return { status: 200, reason: "" };
  };

  let sent = 0;
  let failed = 0;
  const deadTokens: string[] = [];
  const failureReasons: Record<string, number> = {};

  // Resolves (no rejection) because the worker cannot throw.
  const results = await runPool(tokens, 50, async (token) => {
    const c = await sendAndClassify(() => send(token));
    if (c.ok) {
      sent++;
    } else {
      failed++;
      failureReasons[c.reasonKey] = (failureReasons[c.reasonKey] ?? 0) + 1;
      if (c.dead) deadTokens.push(token);
    }
    return c;
  });

  assertEquals(results.length, 200, "a result for every token");
  assertEquals(sent, 197, "every other token was sent");
  assertEquals(failed, 3, "the thrown send, the dead token and the rate-limited one");
  assertEquals(sent + failed, tokens.length, "every token tallied");
  assertEquals(failureReasons, { network: 1, Unregistered: 1, TooManyRequests: 1 });
  assertEquals(deadTokens, ["tok-100"], "the thrown send's token is kept");
});
