// Unit tests for ticket-intake (handler.ts). Run: `deno test` from this dir. No network, no
// permissions: the environment and the database are handed in as fakes.
import { handleTicketIntake, normaliseEmail, type TicketStore } from "./handler.ts";

function assertEquals(actual: unknown, expected: unknown, msg = ""): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`assertion failed${msg ? `: ${msg}` : ""}\n  actual:   ${a}\n  expected: ${e}`);
}

const SECRET = "s3cret";
const env = (k: string) => (k === "ARCHV_APP_SECRET" ? SECRET : undefined);

function fakeStore(insertError?: string, messageError?: string) {
  const tickets: Record<string, unknown>[] = [];
  const messages: Record<string, unknown>[] = [];
  const store: TicketStore = {
    insertTicket(row) {
      if (insertError) return Promise.resolve({ error: insertError });
      tickets.push(row);
      return Promise.resolve({ ticket: { id: `t${tickets.length}`, status: "new" } });
    },
    insertMessage(row) {
      if (messageError) return Promise.resolve({ error: messageError });
      messages.push(row);
      return Promise.resolve({});
    },
  };
  return { store, tickets, messages };
}

const post = (body: unknown, header: string | null = SECRET) =>
  new Request("https://example.test/ticket-intake", {
    method: "POST",
    headers: header === null ? {} : { "x-archv-app": header },
    body: JSON.stringify(body),
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

Deno.test("a ticket is created with its first message and answers 201", async () => {
  const f = fakeStore();
  const res = await quietly(() =>
    handleTicketIntake(post({ device_id: "d1", body: "The feed is empty", category: "bug" }), { env, store: f.store })
  );
  assertEquals(res.status, 201);
  assertEquals(await res.json(), { ok: true, ticket_id: "t1", status: "new" });
  assertEquals(f.messages, [{ ticket_id: "t1", author: "user", body: "The feed is empty" }]);
});

Deno.test("hard guard: a missing, wrong or unconfigured secret is 401 and writes nothing", async () => {
  for (const [header, e] of [[null, env], ["nope", env], [SECRET, () => undefined]] as const) {
    const f = fakeStore();
    const res = await quietly(() => handleTicketIntake(post({ device_id: "d1", body: "hello" }, header), { env: e, store: f.store }));
    assertEquals(res.status, 401);
    assertEquals(f.tickets.length, 0);
  }
});

Deno.test("the cap marker maps to 429 and any other database error to a generic 500", async () => {
  const capped = await quietly(() =>
    handleTicketIntake(post({ device_id: "d1", body: "hello" }), { env, store: fakeStore("ticket_rate_limited").store })
  );
  assertEquals(capped.status, 429);
  const broken = await quietly(() =>
    handleTicketIntake(post({ device_id: "d1", body: "hello" }), { env, store: fakeStore('column "x" does not exist').store })
  );
  assertEquals(broken.status, 500);
  assertEquals(await broken.json(), { error: "server_error" }, "no schema detail leaks");
});

Deno.test("an unknown category is stored as other, and short or long bodies are refused", async () => {
  const f = fakeStore();
  await quietly(() => handleTicketIntake(post({ device_id: "d1", body: "hello", category: "drop table" }), { env, store: f.store }));
  assertEquals(f.tickets[0].category, "other");
  for (const body of ["hi", "x".repeat(5001)]) {
    const res = await quietly(() => handleTicketIntake(post({ device_id: "d1", body }), { env, store: fakeStore().store }));
    assertEquals(res.status, 400);
  }
});

Deno.test("a first message the database refuses is logged, and the ticket still answers 201", async () => {
  const f = fakeStore(undefined, "ticket_reply_rate_limited");
  const errors: unknown[][] = [];
  const err = console.error;
  console.error = (...a: unknown[]) => errors.push(a);
  let res: Response;
  try {
    res = await handleTicketIntake(post({ device_id: "d1", body: "The feed is empty" }), { env, store: f.store });
  } finally {
    console.error = err;
  }
  assertEquals(res.status, 201);
  assertEquals(f.tickets.length, 1);
  assertEquals(errors.length, 1, "the failure is logged");
  assertEquals(String(errors[0][0]).includes("first message for ticket t1 not stored"), true);
  assertEquals(errors[0][1], "ticket_reply_rate_limited");
});

Deno.test("billing and account from older builds are accepted and filed as other", async () => {
  for (const category of ["billing", "account"]) {
    const f = fakeStore();
    const res = await quietly(() => handleTicketIntake(post({ device_id: "d1", body: "hello", category }), { env, store: f.store }));
    assertEquals(res.status, 201, `${category} is not refused`);
    assertEquals(f.tickets[0].category, "other");
  }
  for (const category of ["bug", "content", "other"]) {
    const f = fakeStore();
    await quietly(() => handleTicketIntake(post({ device_id: "d1", body: "hello", category }), { env, store: f.store }));
    assertEquals(f.tickets[0].category, category);
  }
});

Deno.test("the email is trimmed, and one that fails the shape check is stored as null", async () => {
  const f = fakeStore();
  const res = await quietly(() =>
    handleTicketIntake(post({ device_id: "d1", body: "hello", email: "  reader@example.com \n" }), { env, store: f.store })
  );
  assertEquals(res.status, 201);
  assertEquals(f.tickets[0].email, "reader@example.com");
  const g = fakeStore();
  const bad = await quietly(() => handleTicketIntake(post({ device_id: "d1", body: "hello", email: "name@gmial" }), { env, store: g.store }));
  assertEquals(bad.status, 201, "a bad email never blocks the ticket");
  assertEquals(g.tickets[0].email, null);
});

Deno.test("normaliseEmail matches the app's light check", () => {
  for (const ok of ["a@b.co", "first.last@mail.example.org", " x@y.ca "]) {
    assertEquals(normaliseEmail(ok), ok.trim(), ok);
  }
  for (const bad of [
    "", "   ", "name@gmial", "@example.com", "a@.com", "a@example.", "a@exa..mple.com", "a@b@c.com",
    "a b@example.com", `${"x".repeat(320)}@e.co`, 42, null,
  ]) {
    assertEquals(normaliseEmail(bad), null, String(bad));
  }
});
