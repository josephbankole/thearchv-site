// Unit tests for android-waitlist (handler.ts). Run: `deno test` from this dir. No network, no
// permissions: the environment and fetch are handed in as fakes, and each fake records the calls.
import { handleWaitlist } from "./handler.ts";

function assertEquals(actual: unknown, expected: unknown, msg = ""): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`assertion failed${msg ? `: ${msg}` : ""}\n  actual:   ${a}\n  expected: ${e}`);
}

const BASE_ENV: Record<string, string> = { SUPABASE_URL: "https://db.example.test", SUPABASE_SERVICE_ROLE_KEY: "svc" };

type Call = { url: string; body: string };
type Reply = { status: number; body: string };

function fakeFetch(opts: { claim?: Reply | "throw"; insert?: Reply; captcha?: Reply | "throw" } = {}) {
  const calls: Call[] = [];
  const reply = (r: Reply) => Promise.resolve(new Response(r.body, { status: r.status }));
  const fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === "string" ? init.body : String(init?.body ?? "");
    calls.push({ url, body });
    if (url.endsWith("/rpc/waitlist_rate_claim")) {
      if (opts.claim === "throw") return Promise.reject(new Error("down"));
      return reply(opts.claim ?? { status: 200, body: "true" });
    }
    if (url.endsWith("/android_waitlist")) return reply(opts.insert ?? { status: 201, body: "" });
    if (url.includes("turnstile")) {
      if (opts.captcha === "throw") return Promise.reject(new Error("down"));
      return reply(opts.captcha ?? { status: 200, body: '{"success":true}' });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

function deps(f: ReturnType<typeof fakeFetch>, extraEnv: Record<string, string> = {}) {
  const all = { ...BASE_ENV, ...extraEnv };
  return { env: (k: string) => all[k], fetch: f.fetch };
}

const post = (body: unknown, headers: Record<string, string> = { origin: "https://thearchv.ca", "cf-connecting-ip": "203.0.113.7" }) =>
  new Request("https://example.test/android-waitlist", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

async function quietly<T>(f: () => Promise<T>): Promise<T> {
  const log = console.log, err = console.error;
  console.log = () => {};
  console.error = () => {};
  try {
    return await f();
  } finally {
    console.log = log;
    console.error = err;
  }
}

const inserts = (calls: Call[]) => calls.filter((c) => c.url.endsWith("/android_waitlist"));
const claims = (calls: Call[]) => calls.filter((c) => c.url.endsWith("/rpc/waitlist_rate_claim"));

Deno.test("a valid signup is stored lowercased and trimmed, after one per-IP claim", async () => {
  const f = fakeFetch();
  const res = await quietly(() => handleWaitlist(post({ email: "  Reader@Example.COM ", source: "app-page" }), deps(f)));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true });
  assertEquals(res.headers.get("access-control-allow-origin"), "https://thearchv.ca");
  const row = JSON.parse(inserts(f.calls)[0].body);
  assertEquals(row.email, "reader@example.com");
  assertEquals(row.source, "app-page");
  assertEquals(claims(f.calls).length, 1);
});

Deno.test("the per-IP claim stores only a hash of the address", async () => {
  const f = fakeFetch();
  await quietly(() => handleWaitlist(post({ email: "a@b.co" }), deps(f)));
  const claim = JSON.parse(claims(f.calls)[0].body);
  assertEquals(/^ip:[0-9a-f]{64}$/.test(claim.p_key), true, claim.p_key);
  assertEquals(claim.p_key.includes("203.0.113.7"), false);
  assertEquals(claim.p_limit, 5);
});

Deno.test("a foreign Origin is 403 with no CORS headers, before anything is read or written", async () => {
  const f = fakeFetch();
  const res = await quietly(() => handleWaitlist(post({ email: "a@b.co" }, { origin: "https://evil.example" }), deps(f)));
  assertEquals(res.status, 403);
  assertEquals(res.headers.get("access-control-allow-origin"), null);
  assertEquals(f.calls.length, 0);
});

Deno.test("no Origin at all is allowed through, as scripts and server callers send none", async () => {
  const f = fakeFetch();
  const res = await quietly(() => handleWaitlist(post({ email: "a@b.co" }, {}), deps(f)));
  assertEquals(res.status, 200);
  assertEquals(claims(f.calls).length, 0, "no usable IP, so the per-IP cap is skipped");
  assertEquals(inserts(f.calls).length, 1);
});

Deno.test("bad JSON and bad emails are 400 and write nothing", async () => {
  for (const body of ["{nope", { email: "" }, { email: "not-an-email" }, { email: "a@b" }, { email: `${"x".repeat(250)}@b.co` }]) {
    const f = fakeFetch();
    const res = await quietly(() => handleWaitlist(post(body), deps(f)));
    assertEquals(res.status, 400, JSON.stringify(body));
    assertEquals(f.calls.length, 0);
  }
});

Deno.test("over the per-IP cap is 429 and nothing is inserted", async () => {
  const f = fakeFetch({ claim: { status: 200, body: "false" } });
  const res = await quietly(() => handleWaitlist(post({ email: "a@b.co" }), deps(f)));
  assertEquals(res.status, 429);
  assertEquals(inserts(f.calls).length, 0);
});

Deno.test("a limiter outage fails open, so the form still works", async () => {
  for (const claim of ["throw", { status: 500, body: "oops" }] as const) {
    const f = fakeFetch({ claim });
    const res = await quietly(() => handleWaitlist(post({ email: "a@b.co" }), deps(f)));
    assertEquals(res.status, 200);
    assertEquals(inserts(f.calls).length, 1);
  }
});

Deno.test("the global cap marker maps to 429, a duplicate is a success, other errors a generic 500", async () => {
  const capped = await quietly(() =>
    handleWaitlist(post({ email: "a@b.co" }), deps(fakeFetch({ insert: { status: 400, body: '{"message":"waitlist_rate_limited"}' } })))
  );
  assertEquals(capped.status, 429);
  const dup = await quietly(() => handleWaitlist(post({ email: "a@b.co" }), deps(fakeFetch({ insert: { status: 409, body: "" } }))));
  assertEquals(dup.status, 200);
  const broken = await quietly(() =>
    handleWaitlist(post({ email: "a@b.co" }), deps(fakeFetch({ insert: { status: 500, body: 'column "x" does not exist' } })))
  );
  assertEquals(broken.status, 500);
  assertEquals(await broken.json(), { error: "store_failed" }, "no database detail leaks");
});

Deno.test("the challenge is inert without its secret, and enforced once the secret is set", async () => {
  const off = fakeFetch();
  await quietly(() => handleWaitlist(post({ email: "a@b.co" }), deps(off)));
  assertEquals(off.calls.some((c) => c.url.includes("turnstile")), false);

  const secret = { WAITLIST_CAPTCHA_SECRET: "cap" };
  const missing = fakeFetch();
  assertEquals((await quietly(() => handleWaitlist(post({ email: "a@b.co" }), deps(missing, secret)))).status, 400);
  assertEquals(inserts(missing.calls).length, 0);

  const failed = fakeFetch({ captcha: { status: 200, body: '{"success":false}' } });
  assertEquals((await quietly(() => handleWaitlist(post({ email: "a@b.co", captcha_token: "t" }), deps(failed, secret)))).status, 403);

  const down = fakeFetch({ captcha: "throw" });
  assertEquals((await quietly(() => handleWaitlist(post({ email: "a@b.co", captcha_token: "t" }), deps(down, secret)))).status, 503, "fails closed");

  const passed = fakeFetch();
  assertEquals((await quietly(() => handleWaitlist(post({ email: "a@b.co", captcha_token: "t" }), deps(passed, secret)))).status, 200);
  assertEquals(inserts(passed.calls).length, 1);
});

Deno.test("OPTIONS from our Origin answers the preflight and GET is 405", async () => {
  const f = fakeFetch();
  const pre = await handleWaitlist(new Request("https://example.test/x", { method: "OPTIONS", headers: { origin: "https://www.thearchv.ca" } }), deps(f));
  assertEquals(pre.status, 200);
  assertEquals(pre.headers.get("access-control-allow-origin"), "https://www.thearchv.ca");
  const get = await handleWaitlist(new Request("https://example.test/x"), deps(f));
  assertEquals(get.status, 405);
});
