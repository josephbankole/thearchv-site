// Unit tests for scores-poll's API door (api.ts): what counts as a good reply, the quota header,
// and that the key travels in a header and never comes back out. Run: `deno test` from this dir.
import { API_BASE, makeApiGet, readEnvelope, remainingFrom } from "./api.ts";
import { assert, assertEquals, SCHEDULES } from "./testkit.ts";

const KEY = "test-key-0123456789abcdef";

Deno.test("readEnvelope: a 200 with empty errors and a response array is good", () => {
  assertEquals(readEnvelope(200, { errors: [], response: [{ a: 1 }] }), { ok: true, fixtures: [{ a: 1 }] });
  assertEquals(readEnvelope(200, { errors: {}, response: [] }), { ok: true, fixtures: [] });
  assertEquals(readEnvelope(200, SCHEDULES["39"]).ok, true);
});

Deno.test("readEnvelope: everything else is a failure, and the reason names a field, not a message", () => {
  assertEquals(readEnvelope(500, { errors: [], response: [] }), { ok: false, reason: "HTTP 500" });
  assertEquals(readEnvelope(429, null), { ok: false, reason: "HTTP 429" });
  assertEquals(readEnvelope(200, null), { ok: false, reason: "not a JSON object" });
  assertEquals(readEnvelope(200, "<html>"), { ok: false, reason: "not a JSON object" });
  assertEquals(readEnvelope(200, { errors: [], response: {} }), { ok: false, reason: "no response array" });
  assertEquals(readEnvelope(200, { errors: [] }), { ok: false, reason: "no response array" });
  // The API answers 200 with the problem in `errors` when the quota is spent or the plan refuses.
  const quota = readEnvelope(200, { errors: { requests: "You have reached the request limit for the day" }, response: [] });
  assertEquals(quota, { ok: false, reason: "API error (requests)" });
  assertEquals(readEnvelope(200, { errors: ["bad"], response: [] }), { ok: false, reason: "API error (list)" });
  assertEquals(readEnvelope(200, { errors: { token: "x", plan: "y" }, response: [] }), { ok: false, reason: "API error (token,plan)" });
});

Deno.test("remainingFrom: the API's daily count as a number, null when it is missing or odd", () => {
  assertEquals(remainingFrom(new Headers({ "x-ratelimit-requests-remaining": "7490" })), 7490);
  assertEquals(remainingFrom(new Headers({ "X-RateLimit-Requests-Remaining": "0" })), 0);
  assertEquals(remainingFrom(new Headers()), null);
  assertEquals(remainingFrom(new Headers({ "x-ratelimit-requests-remaining": "lots" })), null);
  assertEquals(remainingFrom(new Headers({ "x-ratelimit-requests-remaining": "" })), null);
});

Deno.test("makeApiGet: the key goes in a header, the URL is the path, and the reply carries the quota", async () => {
  let seen: { url: string; key: string | null; query: string } | null = null;
  const fetchFn = ((url: string, init: RequestInit) => {
    seen = { url, key: new Headers(init.headers).get("x-apisports-key"), query: new URL(url).search };
    return Promise.resolve(
      new Response(JSON.stringify({ errors: [], response: [1, 2] }), {
        status: 200,
        headers: { "x-ratelimit-requests-remaining": "7001" },
      }),
    );
  }) as unknown as typeof fetch;
  const r = await makeApiGet(KEY, fetchFn)("/fixtures?league=39&season=2026");
  assertEquals(r, { ok: true, fixtures: [1, 2], remaining: 7001 });
  assertEquals(seen!.url, `${API_BASE}/fixtures?league=39&season=2026`);
  assertEquals(seen!.key, KEY);
  assert(!seen!.url.includes(KEY), "the key is not in the URL");
});

Deno.test("makeApiGet: a network error or a non-JSON body never echoes the URL or the key", async () => {
  const boom = (() => Promise.reject(new TypeError(`error sending request for url (${API_BASE}/fixtures?league=39) ${KEY}`))) as unknown as typeof fetch;
  const r = await makeApiGet(KEY, boom)("/fixtures?league=39");
  assertEquals(r, { ok: false, reason: "network (TypeError)", remaining: null });
  assert(!JSON.stringify(r).includes(KEY) && !JSON.stringify(r).includes("league"), "nothing leaks");

  const html = (() => Promise.resolve(new Response("<html>Cloudflare</html>", { status: 200 }))) as unknown as typeof fetch;
  assertEquals(await makeApiGet(KEY, html)("/x"), { ok: false, reason: "not a JSON object", remaining: null });

  const limited = (() =>
    Promise.resolve(new Response("{}", { status: 429, headers: { "x-ratelimit-requests-remaining": "0" } }))) as unknown as typeof fetch;
  assertEquals(await makeApiGet(KEY, limited)("/x"), { ok: false, reason: "HTTP 429", remaining: 0 });
});
