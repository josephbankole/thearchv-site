// daily-push fan-out helpers: the pure pieces of the APNs send loop, pulled out of index.ts
// so they can be unit-tested with `deno test` (see fanout_test.ts) without standing up the
// Deno.serve handler or hitting the network. index.ts imports them; nothing here does any I/O
// of its own (sendAndClassify only calls the send function it is handed).

// A bounded-concurrency worker pool. `worker` runs over `items` with at most `concurrency`
// calls in flight at any instant — a real pool, NOT `Promise.all(items.map(worker))`, which
// would open a socket to APNs for every token at once (thousands) and defeats the point. A
// fixed set of `concurrency` workers each pull the next index off a shared cursor the moment
// they finish the previous item, so one slow send never blocks the others (no head-of-line
// stall the way fixed chunks would). The only Promise.all here is over the small, fixed worker
// set, never over the whole token list. `onProgress` fires once per item that completes with a
// result, carrying the running count of such items, used by index.ts for the per-batch
// elapsed/sent log line.
//
// A throwing worker costs its own item and nothing else (code review 2026-09-25). Before this,
// one rejected `worker` call rejected its runWorker loop, which rejected the Promise.all, and
// the handler died with the other workers' remaining items never pulled: on 200 tokens, a throw
// on the 61st send left the tail unsent. daily-push records the day as sent BEFORE the fan-out,
// so no later cron tick retried and those devices simply lost the day's push. Now each item's
// throw is caught and set aside, the worker pulls the next index, and the pool drains every
// item first. Only then does runPool reject: with the original error if exactly one item threw,
// or an AggregateError if several did, so a caller still learns that something went wrong. It
// never rejects partway. Bounded concurrency and in-order results are unchanged. The send path
// in index.ts is built so it cannot throw at all (sendAndClassify below); this is the guard for
// a future worker that forgets its own catch.
export async function runPool<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, result: R, index: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const errors: unknown[] = [];
  let cursor = 0;
  let done = 0;
  const workerCount = Math.max(1, Math.min(Math.floor(concurrency) || 1, items.length || 1));

  async function runWorker(): Promise<void> {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        const r = await worker(items[i], i);
        results[i] = r;
        done++;
        // Synchronous callback with no await after the mutation above keeps the aggregation
        // in index.ts race-free: JS is single-threaded, so a worker's classify-and-tally block
        // runs to completion before another worker resumes.
        if (onProgress) onProgress(done, r, i);
      } catch (e) {
        // Set the error aside and keep pulling: see the drain-then-reject note above.
        errors.push(e);
      }
    }
  }

  const workers: Promise<void>[] = [];
  for (let w = 0; w < workerCount; w++) workers.push(runWorker());
  // runWorker catches every item's throw, so this Promise.all cannot reject early.
  await Promise.all(workers);
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) {
    throw new AggregateError(errors, `runPool: ${errors.length} of ${items.length} items threw`);
  }
  return results;
}

// The outcome of one send, as index.ts tallies it. `detail` is set only on a thrown send, for
// the log line; classifyApnsResult never sets it.
export type SendOutcome = { ok: boolean; dead: boolean; reasonKey: string; detail?: string };

// Pure classification of one APNs response. Kept separate from the send so the live path and
// the tests agree on exactly which failures kill a token: ONLY BadDeviceToken and Unregistered
// mean the token itself is dead (reason-gated deletion). Every other non-200 (BadTopic,
// TooManyRequests, auth/5xx) is counted under its reason but the token is KEPT — a systemic
// APNs error must never delete tokens. `reasonKey` is the aggregation key: the APNs reason
// when present, else `http_<status>` so a reason-less failure still buckets somewhere.
export function classifyApnsResult(
  status: number,
  reason: string,
): { ok: boolean; dead: boolean; reasonKey: string } {
  if (status === 200) return { ok: true, dead: false, reasonKey: "" };
  const reasonKey = reason || `http_${status}`;
  const dead = reason === "BadDeviceToken" || reason === "Unregistered";
  return { ok: false, dead, reasonKey };
}

// The aggregation key for a send that threw instead of returning a response. It cannot collide
// with classifyApnsResult's keys: APNs reasons are PascalCase and its fallback is `http_<status>`.
export const NETWORK_REASON = "network";

// Pure classification of a send that THREW (connection reset, HTTP/2 GOAWAY, DNS failure, a
// timeout) rather than returning an APNs response (code review 2026-09-25). It is one failed
// send, counted under NETWORK_REASON, and the token is NEVER dead: a throw says nothing about
// the token, only about the path to APNs, and a network blip across the whole run must not be
// able to wipe the token table any more than a systemic BadTopic can. Same rule as
// classifyApnsResult: only an APNs BadDeviceToken or Unregistered kills a token.
export function classifySendError(err: unknown): SendOutcome {
  return { ok: false, dead: false, reasonKey: NETWORK_REASON, detail: describeError(err) };
}

// Runs one send and classifies it, and never rejects: a returned response goes through
// classifyApnsResult, a throw (from the send itself or from reading its body) goes through
// classifySendError. index.ts builds its worker on this, so one failed socket can neither end
// the fan-out nor mark a token dead.
export async function sendAndClassify(
  send: () => Promise<{ status: number; reason: string }>,
): Promise<SendOutcome> {
  try {
    const { status, reason } = await send();
    return classifyApnsResult(status, reason);
  } catch (e) {
    return classifySendError(e);
  }
}

// A short, log-safe description of anything thrown. It never throws itself (an object whose
// toString throws still describes), and it redacts device tokens: Deno's fetch errors quote
// the request URL, which for APNs is `/3/device/<token>`, and a token has no business in the
// function logs. Any long hex run is masked as well, which covers a bare token.
export function describeError(err: unknown): string {
  let text: string;
  try {
    text = String(err);
  } catch {
    text = "unprintable error";
  }
  return text
    .replace(/\/3\/device\/[^\s)"'<>]+/g, "/3/device/<token>")
    .replace(/[0-9a-fA-F]{32,}/g, "<redacted>")
    .slice(0, 160);
}
