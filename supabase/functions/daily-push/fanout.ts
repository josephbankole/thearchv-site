// daily-push fan-out helpers — the two pure pieces of the APNs send loop, pulled out of
// index.ts so they can be unit-tested with `deno test` (see fanout_test.ts) without standing
// up the Deno.serve handler or hitting the network. index.ts imports both; nothing here does
// any I/O of its own.

// A bounded-concurrency worker pool. `worker` runs over `items` with at most `concurrency`
// calls in flight at any instant — a real pool, NOT `Promise.all(items.map(worker))`, which
// would open a socket to APNs for every token at once (thousands) and defeats the point. A
// fixed set of `concurrency` workers each pull the next index off a shared cursor the moment
// they finish the previous item, so one slow send never blocks the others (no head-of-line
// stall the way fixed chunks would). The only Promise.all here is over the small, fixed worker
// set, never over the whole token list. `onProgress` fires once per completed item with the
// running done-count, used by index.ts for the per-batch elapsed/sent log line.
export async function runPool<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, result: R, index: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  let done = 0;
  const workerCount = Math.max(1, Math.min(Math.floor(concurrency) || 1, items.length || 1));

  async function runWorker(): Promise<void> {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      const r = await worker(items[i], i);
      results[i] = r;
      done++;
      // Synchronous callback with no await after the mutation above keeps the aggregation
      // in index.ts race-free: JS is single-threaded, so a worker's classify-and-tally block
      // runs to completion before another worker resumes.
      if (onProgress) onProgress(done, r, i);
    }
  }

  const workers: Promise<void>[] = [];
  for (let w = 0; w < workerCount; w++) workers.push(runWorker());
  await Promise.all(workers);
  return results;
}

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
