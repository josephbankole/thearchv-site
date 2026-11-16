// Unit tests for ticket-thread (handler.ts). Run: `deno test` from this dir. No network, no
// permissions: the environment and the database are handed in as fakes.
import { handleTicketThread, type ThreadMessage, type ThreadStore, type ThreadTicket } from "./handler.ts";

function assertEquals(actual: unknown, expected: unknown, msg = ""): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`assertion failed${msg ? `: ${msg}` : ""}\n  actual:   ${a}\n  expected: ${e}`);
}

const SECRET = "s3cret";
const env = (k: string) => (k === "ARCHV_APP_SECRET" ? SECRET : undefined);

const T1: ThreadTicket = {
  id: "t1", category: "bug", subject: null, status: "resolved_l1",
  created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T11:00:00Z", device_id: "d1",
};
const MSGS: ThreadMessage[] = [
  { author: "user", body: "The feed is empty", created_at: "2026-11-01T10:00:00Z" },
  { author: "agent", body: "Pull down to refresh.", created_at: "2026-11-01T11:00:00Z" },
];

function fakeStore(opts: { logError?: string; listError?: string; ticketError?: string; msgError?: string } = {}) {
  const lookups: string[] = [];
  const calls: string[] = [];
  const store: ThreadStore = {
    logLookup(deviceId) {
      lookups.push(deviceId);
      return Promise.resolve(opts.logError ? { error: opts.logError } : {});
    },
    listTickets(deviceId) {
      calls.push("list");
      if (opts.listError) return Promise.resolve({ error: opts.listError });
      const { device_id: _d, ...row } = T1;
      return Promise.resolve({ tickets: deviceId === "d1" ? [row] : [] });
    },
    getTicket(ticketId) {
      calls.push("ticket");
      if (opts.ticketError) return Promise.resolve({ error: opts.ticketError });
      return Promise.resolve({ ticket: ticketId === "t1" ? T1 : null });
    },
    publicMessages() {
      calls.push("messages");
      return Promise.resolve(opts.msgError ? { error: opts.msgError } : { messages: MSGS });
    },
  };
  return { store, lookups, calls };
}

const post = (body: unknown, header: string | null = SECRET) =>
  new Request("https://example.test/ticket-thread", {
    method: "POST",
    headers: header === null ? {} : { "x-archv-app": header },
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

Deno.test("list mode returns the device's tickets without device_id", async () => {
  const f = fakeStore();
  const res = await quietly(() => handleTicketThread(post({ device_id: " d1 " }), { env, store: f.store }));
  assertEquals(res.status, 200);
  const out = await res.json();
  assertEquals(out.tickets.length, 1);
  assertEquals("device_id" in out.tickets[0], false);
  assertEquals(f.lookups, ["d1"], "the lookup is logged once, with the trimmed device_id");
});

Deno.test("thread mode returns the ticket without device_id and its public messages", async () => {
  const f = fakeStore();
  const res = await quietly(() => handleTicketThread(post({ device_id: "d1", ticket_id: "t1" }), { env, store: f.store }));
  assertEquals(res.status, 200);
  const out = await res.json();
  assertEquals(out.ticket.id, "t1");
  assertEquals("device_id" in out.ticket, false);
  assertEquals(out.messages, MSGS);
});

Deno.test("another device's ticket, or one that does not exist, is 404 and its messages are never read", async () => {
  for (const [device_id, ticket_id] of [["d2", "t1"], ["d1", "nope"]]) {
    const f = fakeStore();
    const res = await quietly(() => handleTicketThread(post({ device_id, ticket_id }), { env, store: f.store }));
    assertEquals(res.status, 404);
    assertEquals(f.calls.includes("messages"), false);
  }
});

Deno.test("hard guard: a missing, wrong or unconfigured secret is 401 and logs no lookup", async () => {
  for (const [header, e] of [[null, env], ["nope", env], [SECRET, () => undefined]] as const) {
    const f = fakeStore();
    const res = await quietly(() => handleTicketThread(post({ device_id: "d1" }, header), { env: e, store: f.store }));
    assertEquals(res.status, 401);
    assertEquals(f.lookups.length, 0);
  }
});

Deno.test("bad input is 400 before any lookup is logged", async () => {
  for (const body of ["{not json", {}, { device_id: "   " }, { device_id: "x".repeat(129) }]) {
    const f = fakeStore();
    const res = await quietly(() => handleTicketThread(post(body), { env, store: f.store }));
    assertEquals(res.status, 400, JSON.stringify(body));
    assertEquals(f.lookups.length, 0);
  }
  const ok = await quietly(() => handleTicketThread(post({ device_id: "x".repeat(128) }), { env, store: fakeStore().store }));
  assertEquals(ok.status, 200, "128 characters is still allowed");
});

Deno.test("the cap marker maps to 429 and nothing is read; any other rate-log error is a generic 500", async () => {
  const f = fakeStore({ logError: "ticket_thread_rate_limited" });
  const capped = await quietly(() => handleTicketThread(post({ device_id: "d1" }), { env, store: f.store }));
  assertEquals(capped.status, 429);
  assertEquals(f.calls.length, 0, "no ticket data is read over the cap");
  const broken = await quietly(() =>
    handleTicketThread(post({ device_id: "d1" }), { env, store: fakeStore({ logError: 'relation "x" does not exist' }).store })
  );
  assertEquals(broken.status, 500);
  assertEquals(await broken.json(), { error: "server_error" }, "no schema detail leaks");
});

Deno.test("read errors are a generic 500", async () => {
  const cases: [Record<string, string>, Record<string, string>][] = [
    [{ listError: "boom" }, { device_id: "d1" }],
    [{ ticketError: "boom" }, { device_id: "d1", ticket_id: "t1" }],
    [{ msgError: "boom" }, { device_id: "d1", ticket_id: "t1" }],
  ];
  for (const [opts, body] of cases) {
    const res = await quietly(() => handleTicketThread(post(body), { env, store: fakeStore(opts).store }));
    assertEquals(res.status, 500, JSON.stringify(opts));
    assertEquals(await res.json(), { error: "server_error" });
  }
});

Deno.test("OPTIONS answers the preflight and GET is 405", async () => {
  const f = fakeStore();
  const pre = await handleTicketThread(new Request("https://example.test/ticket-thread", { method: "OPTIONS" }), { env, store: f.store });
  assertEquals(pre.status, 200);
  const get = await handleTicketThread(new Request("https://example.test/ticket-thread"), { env, store: f.store });
  assertEquals(get.status, 405);
});
