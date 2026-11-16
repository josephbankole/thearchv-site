// Unit tests for delete-device-data (handler.ts). Run: `deno test` from this dir. No network, no
// permissions: the environment and the database are handed in as fakes.
import { type DeleteStore, handleDeleteDeviceData } from "./handler.ts";

function assertEquals(actual: unknown, expected: unknown, msg = ""): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`assertion failed${msg ? `: ${msg}` : ""}\n  actual:   ${a}\n  expected: ${e}`);
}

const SECRET = "s3cret";
const env = (k: string) => (k === "ARCHV_APP_SECRET" ? SECRET : undefined);

type Row = { device_id: string };

function fakeStore(opts: { capFull?: boolean; failTickets?: boolean } = {}) {
  const tickets: Row[] = [{ device_id: "me" }, { device_id: "me" }, { device_id: "other" }];
  const tokens: Row[] = [{ device_id: "me" }, { device_id: "other" }];
  const calls: string[] = [];
  const take = (rows: Row[], id: string) => {
    const before = rows.length;
    for (let i = rows.length - 1; i >= 0; i--) if (rows[i].device_id === id) rows.splice(i, 1);
    return before - rows.length;
  };
  const store: DeleteStore = {
    logLookup() {
      calls.push("log");
      return Promise.resolve(opts.capFull ? { error: "ticket_thread_rate_limited" } : {});
    },
    deleteTickets(id) {
      calls.push("tickets");
      return Promise.resolve(opts.failTickets ? { error: "boom" } : { count: take(tickets, id) });
    },
    deletePushTokens(id) {
      calls.push("tokens");
      return Promise.resolve({ count: take(tokens, id) });
    },
  };
  return { store, tickets, tokens, calls };
}

const post = (body: unknown, header: string | null = SECRET) =>
  new Request("https://example.test/delete-device-data", {
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

Deno.test("deletes only this device's tickets and push tokens and reports the counts", async () => {
  const f = fakeStore();
  const res = await quietly(() => handleDeleteDeviceData(post({ device_id: " me " }), { env, store: f.store }));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true, tickets: 2, push_tokens: 1 });
  assertEquals(f.tickets, [{ device_id: "other" }], "another device's ticket is kept");
  assertEquals(f.tokens, [{ device_id: "other" }], "another device's token is kept");
  assertEquals(f.calls, ["log", "tokens", "tickets"]);
});

Deno.test("a second call finds nothing left and still answers 200", async () => {
  const f = fakeStore();
  await quietly(() => handleDeleteDeviceData(post({ device_id: "me" }), { env, store: f.store }));
  const res = await quietly(() => handleDeleteDeviceData(post({ device_id: "me" }), { env, store: f.store }));
  assertEquals(await res.json(), { ok: true, tickets: 0, push_tokens: 0 });
});

Deno.test("no or a wrong app header is refused before anything is touched", async () => {
  for (const header of [null, "wrong"]) {
    const f = fakeStore();
    const res = await quietly(() => handleDeleteDeviceData(post({ device_id: "me" }, header), { env, store: f.store }));
    assertEquals(res.status, 401);
    assertEquals(f.calls, []);
  }
});

Deno.test("an unset app secret fails closed", async () => {
  const f = fakeStore();
  const res = await quietly(() => handleDeleteDeviceData(post({ device_id: "me" }), { env: () => undefined, store: f.store }));
  assertEquals(res.status, 401);
  assertEquals(f.calls, []);
});

Deno.test("a missing, long or unreadable device_id is a 400 and deletes nothing", async () => {
  for (const body of [{}, { device_id: "" }, { device_id: "x".repeat(129) }, "not json"]) {
    const f = fakeStore();
    const res = await quietly(() => handleDeleteDeviceData(post(body), { env, store: f.store }));
    assertEquals(res.status, 400, JSON.stringify(body));
    assertEquals(f.calls, []);
  }
});

Deno.test("the lookup cap answers 429 and deletes nothing", async () => {
  const f = fakeStore({ capFull: true });
  const res = await quietly(() => handleDeleteDeviceData(post({ device_id: "me" }), { env, store: f.store }));
  assertEquals(res.status, 429);
  assertEquals(f.calls, ["log"]);
  assertEquals(f.tickets.length, 3);
});

Deno.test("a database error is a 500 with no detail in the body", async () => {
  const f = fakeStore({ failTickets: true });
  const res = await quietly(() => handleDeleteDeviceData(post({ device_id: "me" }), { env, store: f.store }));
  assertEquals(res.status, 500);
  assertEquals(await res.json(), { error: "server_error" });
});

Deno.test("only POST is served", async () => {
  const f = fakeStore();
  const res = await handleDeleteDeviceData(new Request("https://example.test/delete-device-data"), { env, store: f.store });
  assertEquals(res.status, 405);
});
