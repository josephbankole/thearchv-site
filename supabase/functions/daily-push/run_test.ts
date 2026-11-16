// Unit tests for daily-push's run (run.ts): the order of record, claim and send, what a failed
// record or claim does, the claim chunking, the deletion cap and the paged token read. Run:
// `deno test` from this dir. No network and no database: the feeds, the asset checks, APNs and
// PushDb are fakes.
import { SPORT_KEYS, type SportKey } from "../_shared/sports.ts";
import { edmontonDay, feedHash, feedName, groupTokensBySport, SITE } from "./leads.ts";
import {
  CLAIM_CHUNK,
  MAX_TOKEN_DELETIONS_PER_RUN,
  type PushDb,
  readOptedInTokens,
  type Run,
  runSports,
  TOKEN_PAGE,
  type TokenRow,
} from "./run.ts";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}
function assertEquals(actual: unknown, expected: unknown, msg = ""): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`expected ${e} got ${a}${msg ? `: ${msg}` : ""}`);
}

// 11:00 in Edmonton, inside the send window.
const NOW = new Date("2026-11-16T18:00:00Z");
const TODAY = edmontonDay(NOW);
const LEAD = { headline: "A new story", section: "transfer", date: TODAY, url: `${SITE}/transfer/a-new-story/` };
const tokensOf = (n: number, prefix = "t") => Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(5, "0")}`);

// One run over football's readers; every other sport's feed is empty, so it skips cleanly.
async function world(opts: {
  tokens: string[];
  recordError?: string;
  claimFailsOnCall?: number; // 1-based claim call that errors
  apns?: (token: string) => { status: number; reason?: string };
}) {
  const feeds = new Map<string, string>();
  for (const sport of SPORT_KEYS) {
    const doc = sport === "football" ? { lead: LEAD } : { days: [] };
    feeds.set(feedName(sport), JSON.stringify(doc));
  }
  const manifest: Record<string, string> = {};
  for (const [name, text] of feeds) manifest[name] = await feedHash(text);

  const log: string[] = [];
  const state = { claims: [] as number[], sentTo: [] as string[], deleted: [] as string[][], recorded: [] as string[] };
  let claimCalls = 0;
  const db: PushDb = {
    recordSent: (sport, key) => {
      log.push(`record:${sport}`);
      if (opts.recordError && sport === "football") return Promise.resolve(opts.recordError);
      state.recorded.push(`${sport}|${key}`);
      return Promise.resolve(null);
    },
    recordOutcome: () => Promise.resolve(null),
    claim: (tokens) => {
      claimCalls++;
      log.push(`claim:${tokens.length}`);
      state.claims.push(tokens.length);
      if (opts.claimFailsOnCall === claimCalls) return Promise.resolve({ rows: null, error: "claim down" });
      return Promise.resolve({ rows: tokens.map((token) => ({ token })), error: null });
    },
    deleteTokens: (tokens) => {
      state.deleted.push(tokens);
      return Promise.resolve(null);
    },
  };
  const fakeFetch: typeof fetch = (input, init) => {
    const url = String(input);
    if (url.startsWith("https://api.push.apple.com/3/device/")) {
      const token = url.slice(url.lastIndexOf("/") + 1);
      log.push("send");
      state.sentTo.push(token);
      const r = opts.apns ? opts.apns(token) : { status: 200 };
      return Promise.resolve(new Response(r.reason ? JSON.stringify({ reason: r.reason }) : null, { status: r.status }));
    }
    if (init?.method === "HEAD") return Promise.resolve(new Response(null, { status: 200 }));
    const m = url.match(/\/feed\/([a-z0-9-]+)\.json/);
    if (m && feeds.has(m[1])) return Promise.resolve(new Response(feeds.get(m[1])));
    return Promise.resolve(new Response("not found", { status: 404 }));
  };
  const rows = opts.tokens.map((token) => ({ token, sport: "football" }));
  const run: Run = {
    db,
    fetch: fakeFetch,
    clock: () => NOW,
    today: TODAY,
    now: NOW,
    manifest,
    groups: groupTokensBySport(rows),
    states: new Map(),
    apns: { host: "api.push.apple.com", bundleId: "ca.thearchv.reader", jwt: () => Promise.resolve("jwt") },
    sent: 0,
    failed: 0,
    dead: [],
    failureReasons: {},
    writeFailed: false,
  };
  return { run, log, state, total: rows.length };
}

const quietly = async <T>(f: () => Promise<T>): Promise<T> => {
  const [log, err] = [console.log, console.error];
  console.log = () => {};
  console.error = () => {};
  try {
    return await f();
  } finally {
    console.log = log;
    console.error = err;
  }
};

Deno.test("the lead is recorded before any token is claimed or sent to", async () => {
  const w = await world({ tokens: tokensOf(3) });
  const out = await quietly(() => runSports(w.run, w.total));
  assertEquals(out.status, 200);
  const firstSend = w.log.indexOf("send");
  assert(w.log.indexOf("record:football") < w.log.indexOf("claim:3"), w.log.join(","));
  assert(w.log.indexOf("claim:3") < firstSend, w.log.join(","));
  assertEquals(w.state.sentTo.length, 3);
  assertEquals((out.body.sports as Record<string, Record<string, unknown>>).football, { ok: true, sent: 3, failed: 0 });
});

Deno.test("a record that fails means no claim and no send, and the run answers 500", async () => {
  const w = await world({ tokens: tokensOf(3), recordError: "state table down" });
  const out = await quietly(() => runSports(w.run, w.total));
  assertEquals(out.status, 500);
  assertEquals(w.state.claims, []);
  assertEquals(w.state.sentTo, []);
  assertEquals((out.body.sports as Record<string, Record<string, unknown>>).football.ok, false);
});

Deno.test("more than one chunk of tokens is claimed in chunks of CLAIM_CHUNK, and all are sent to", async () => {
  const n = CLAIM_CHUNK * 2 + 200;
  const w = await world({ tokens: tokensOf(n) });
  const out = await quietly(() => runSports(w.run, w.total));
  assertEquals(w.state.claims, [CLAIM_CHUNK, CLAIM_CHUNK, 200]);
  assertEquals(w.state.sentTo.length, n);
  assertEquals(out.status, 200);
});

Deno.test("a claim that fails part way sends only to the tokens already claimed and answers 500", async () => {
  const w = await world({ tokens: tokensOf(CLAIM_CHUNK + 100), claimFailsOnCall: 2 });
  const out = await quietly(() => runSports(w.run, w.total));
  assertEquals(out.status, 500);
  assertEquals(w.state.sentTo.length, CLAIM_CHUNK);
  assertEquals(new Set(w.state.sentTo), new Set(tokensOf(CLAIM_CHUNK)));
  const football = (out.body.sports as Record<string, Record<string, unknown>>).football;
  assertEquals(football.ok, false);
  assertEquals(football.sent, CLAIM_CHUNK);
});

Deno.test("a claim that fails on its first chunk sends to nobody", async () => {
  const w = await world({ tokens: tokensOf(10), claimFailsOnCall: 1 });
  const out = await quietly(() => runSports(w.run, w.total));
  assertEquals(out.status, 500);
  assertEquals(w.state.sentTo, []);
});

Deno.test("one run deletes at most MAX_TOKEN_DELETIONS_PER_RUN dead tokens, and flags the anomaly", async () => {
  const w = await world({ tokens: tokensOf(40), apns: () => ({ status: 410, reason: "Unregistered" }) });
  const out = await quietly(() => runSports(w.run, w.total));
  assertEquals(w.state.deleted.flat().length, MAX_TOKEN_DELETIONS_PER_RUN);
  assertEquals(out.body.removed, MAX_TOKEN_DELETIONS_PER_RUN);
  assertEquals(out.body.tokenDeletionAnomaly, true);
  assertEquals(out.body.deadTokens, 40);
  assertEquals(out.body.totalTokens, 40);
});

Deno.test("a few dead tokens are all deleted, and a refusal that is not about the token deletes none", async () => {
  const dead = new Set(["t00001", "t00004"]);
  const w = await world({ tokens: tokensOf(30), apns: (t) => dead.has(t) ? { status: 400, reason: "BadDeviceToken" } : { status: 200 } });
  const out = await quietly(() => runSports(w.run, w.total));
  assertEquals(new Set(w.state.deleted.flat()), dead);
  assertEquals(out.body.tokenDeletionAnomaly, undefined);

  const busy = await world({ tokens: tokensOf(30), apns: () => ({ status: 429, reason: "TooManyRequests" }) });
  await quietly(() => runSports(busy.run, busy.total));
  assertEquals(busy.state.deleted.flat(), []);
});

// ---------- the paged token read ----------

// A fake push_tokens table behind a PostgREST that returns at most maxRows rows a call.
function table(count: number, maxRows: number, failOnCall?: number) {
  const rows: TokenRow[] = tokensOf(count).map((token, i) => ({ token, sport: SPORT_KEYS[i % SPORT_KEYS.length] as SportKey }));
  let calls = 0;
  const page = (after: string | null, limit: number) => {
    calls++;
    if (failOnCall === calls) return Promise.resolve({ rows: null, error: "read failed" });
    const rest = rows.filter((r) => after === null || (r.token as string) > after);
    return Promise.resolve({ rows: rest.slice(0, Math.min(limit, maxRows)), error: null });
  };
  return { page, rows, calls: () => calls };
}

Deno.test("the token read pages past the max-rows cap and returns every row once", async () => {
  const t = table(2345, 1000);
  const out = await readOptedInTokens(t.page);
  assertEquals(out.error, null);
  assertEquals(out.rows.length, 2345);
  assertEquals(new Set(out.rows.map((r) => r.token)).size, 2345);
  const groups = groupTokensBySport(out.rows);
  assertEquals([...groups.values()].reduce((n, g) => n + g.length, 0), 2345);
});

Deno.test("a max-rows cap below the page size still reads every row", async () => {
  const t = table(1234, 300);
  assert(300 < TOKEN_PAGE, "cap is below the page size");
  const out = await readOptedInTokens(t.page);
  assertEquals(out.rows.length, 1234);
});

Deno.test("a page that fails part way is an error, so nothing is sent on a partial list", async () => {
  const t = table(2500, 1000, 2);
  const out = await readOptedInTokens(t.page);
  assertEquals(out.error, "read failed");
});

Deno.test("an empty table reads as no rows, with one call", async () => {
  const t = table(0, 1000);
  const out = await readOptedInTokens(t.page);
  assertEquals(out, { rows: [], error: null });
  assertEquals(t.calls(), 1);
});

Deno.test("a page that does not move forward is an error, not a loop", async () => {
  const out = await readOptedInTokens(() => Promise.resolve({ rows: [{ token: "t1" }], error: null }));
  assertEquals(out.error, "token paging did not advance");
});
