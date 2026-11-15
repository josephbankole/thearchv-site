// Unit tests for register-push (handler.ts). Run: `deno test` from this dir. No network, no
// permissions: the environment and the database are handed in as fakes.
import { handleRegisterPush, type PushRow, type PushTokenStore } from "./handler.ts";

function assertEquals(actual: unknown, expected: unknown, msg = ""): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`assertion failed${msg ? `: ${msg}` : ""}\n  actual:   ${a}\n  expected: ${e}`);
}

const SECRET = "s3cret";
const env = (k: string) => (k === "ARCHV_APP_SECRET" ? SECRET : undefined);
const TOKEN = "ab".repeat(32); // 64 lowercase hex, the shape the iOS client sends

// An in-memory push_tokens table with the cap trigger's marker on demand.
function fakeStore(opts: { known?: string[]; capFull?: boolean; failLookup?: boolean } = {}) {
  const rows = new Map<string, PushRow>((opts.known ?? []).map((t) => [t, { token: t, opt_in: true }]));
  const calls: string[] = [];
  const store: PushTokenStore = {
    exists(token) {
      calls.push("exists");
      return Promise.resolve(opts.failLookup ? { exists: false, error: "boom" } : { exists: rows.has(token) });
    },
    update(token, row) {
      calls.push("update");
      rows.set(token, { ...rows.get(token), ...row });
      return Promise.resolve({});
    },
    upsert(row) {
      calls.push("upsert");
      // The BEFORE INSERT cap fires on the upsert whatever the row holds.
      if (opts.capFull) return Promise.resolve({ error: 'push_token_rate_limited' });
      rows.set(row.token as string, row);
      return Promise.resolve({});
    },
  };
  return { store, rows, calls };
}

const post = (body: unknown, header: string | null = SECRET) =>
  new Request("https://example.test/register-push", {
    method: "POST",
    headers: header === null ? { "content-type": "application/json" } : { "content-type": "application/json", "x-archv-app": header },
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

Deno.test("a new token is upserted and answers 200", async () => {
  const f = fakeStore();
  const res = await quietly(() => handleRegisterPush(post({ device_id: "d1", token: TOKEN }), { env, store: f.store }));
  assertEquals(res.status, 200);
  assertEquals(f.calls, ["exists", "upsert"]);
  assertEquals(f.rows.get(TOKEN)?.opt_in, true);
});

Deno.test("an opt-out for a known token is an update and lands even with the hour's cap full", async () => {
  const f = fakeStore({ known: [TOKEN], capFull: true });
  const res = await quietly(() =>
    handleRegisterPush(post({ device_id: "d1", token: TOKEN, opt_in: false }), { env, store: f.store })
  );
  assertEquals(res.status, 200);
  assertEquals(f.calls, ["exists", "update"], "never the capped upsert path");
  assertEquals(f.rows.get(TOKEN)?.opt_in, false, "opt_in false is stored");
});

Deno.test("the cap marker maps to 429, not 500", async () => {
  const f = fakeStore({ capFull: true });
  const res = await quietly(() => handleRegisterPush(post({ device_id: "d1", token: TOKEN }), { env, store: f.store }));
  assertEquals(res.status, 429);
});

Deno.test("a malformed token is refused before the database is touched", async () => {
  for (const token of ["x", TOKEN.toUpperCase(), TOKEN.slice(0, 63), "g".repeat(64), "a".repeat(201)]) {
    const f = fakeStore();
    const res = await quietly(() => handleRegisterPush(post({ device_id: "d1", token }), { env, store: f.store }));
    assertEquals(res.status, 400, `token ${token.slice(0, 12)}...`);
    assertEquals(f.calls, [], "no database call");
  }
});

Deno.test("soft guard: no header is let through, a wrong header is refused, an unset secret fails closed", async () => {
  const ok = await quietly(() => handleRegisterPush(post({ device_id: "d1", token: TOKEN }, null), { env, store: fakeStore().store }));
  assertEquals(ok.status, 200);
  const wrong = await quietly(() => handleRegisterPush(post({ device_id: "d1", token: TOKEN }, "nope"), { env, store: fakeStore().store }));
  assertEquals(wrong.status, 401);
  const unset = await quietly(() =>
    handleRegisterPush(post({ device_id: "d1", token: TOKEN }), { env: () => undefined, store: fakeStore().store })
  );
  assertEquals(unset.status, 401);
});

Deno.test("a failed lookup is a 500 and writes nothing", async () => {
  const f = fakeStore({ failLookup: true });
  const res = await quietly(() => handleRegisterPush(post({ device_id: "d1", token: TOKEN }), { env, store: f.store }));
  assertEquals(res.status, 500);
  assertEquals(f.calls, ["exists"]);
});

Deno.test("bad bodies are 400", async () => {
  for (const body of ["not json", { token: TOKEN }, { device_id: "d1" }, "null"]) {
    const res = await quietly(() => handleRegisterPush(post(body), { env, store: fakeStore().store }));
    assertEquals(res.status, 400, JSON.stringify(body));
  }
});

Deno.test("sport is resolved and only stored when sent", async () => {
  const f = fakeStore();
  await quietly(() => handleRegisterPush(post({ device_id: "d1", token: TOKEN, sport: "all" }), { env, store: f.store }));
  assertEquals(f.rows.get(TOKEN)?.sport, "football");
  const g = fakeStore();
  await quietly(() => handleRegisterPush(post({ device_id: "d1", token: TOKEN }), { env, store: g.store }));
  assertEquals("sport" in (g.rows.get(TOKEN) ?? {}), false);
});
