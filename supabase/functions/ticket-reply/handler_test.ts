// Unit tests for ticket-reply (handler.ts). Run: `deno test` from this dir. No network, no
// permissions: the environment, the database and the mailer are fakes.
import { handleTicketReply, type ReplyStore, type ReplyTicket } from "./handler.ts";

function assertEquals(actual: unknown, expected: unknown, msg = ""): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`assertion failed${msg ? `: ${msg}` : ""}\n  actual:   ${a}\n  expected: ${e}`);
}

const SECRET = "s3cret";
const env = (k: string) => (k === "ARCHV_APP_SECRET" ? SECRET : undefined);

function world(ticket: Partial<ReplyTicket>, thread: { author: string; body: string }[] = [], insertError?: string) {
  const t: ReplyTicket = { id: "t1", device_id: "d1", status: "resolved_l1", tier: "l1", category: "bug", body: "hi", ...ticket };
  const state = { status: t.status, inserted: [] as string[], mails: [] as string[] };
  const store: ReplyStore = {
    getTicket: (id) => Promise.resolve({ ticket: id === t.id ? t : null }),
    thread: () => Promise.resolve(thread),
    insertMessage: (row) => {
      if (insertError) return Promise.resolve({ error: insertError });
      state.inserted.push(row.body);
      return Promise.resolve({});
    },
    setStatus: (_id, status) => {
      state.status = status;
      return Promise.resolve({});
    },
  };
  const mail = (subject: string) => {
    state.mails.push(subject);
    return Promise.resolve(true);
  };
  return { deps: { env, store, mail }, state };
}

const post = (body: unknown, header: string | null = SECRET) =>
  new Request("https://example.test/ticket-reply", {
    method: "POST",
    headers: header === null ? {} : { "x-archv-app": header },
    body: JSON.stringify(body),
  });
const reply = (text = "still broken") => post({ device_id: "d1", ticket_id: "t1", body: text });

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

Deno.test("a follow-up on a resolved L1 ticket goes back to the triage queue", async () => {
  const w = world({ status: "resolved_l1", tier: "l1" });
  const res = await quietly(() => handleTicketReply(reply(), w.deps));
  assertEquals(res.status, 200);
  assertEquals(w.state.status, "pending_triage");
  assertEquals(w.state.mails, []);
});

Deno.test("a ticket left at l1_working is requeued too", async () => {
  const w = world({ status: "l1_working", tier: "l1" });
  await quietly(() => handleTicketReply(reply(), w.deps));
  assertEquals(w.state.status, "pending_triage");
});

Deno.test("a ticket still waiting for triage is left alone", async () => {
  for (const status of ["new", "pending_triage"]) {
    const w = world({ status, tier: "l1" });
    await quietly(() => handleTicketReply(reply(), w.deps));
    assertEquals(w.state.status, status);
  }
});

Deno.test("a follow-up on an L2 or L3 ticket emails the founder, whatever its status", async () => {
  for (const [tier, status] of [["l2", "l2_working"], ["l3", "escalated_l3"], ["l2", "resolved_l2"]]) {
    const w = world({ tier, status }, [{ author: "user", body: "hi" }, { author: "l1", body: "Passed on." }]);
    await quietly(() => handleTicketReply(reply(), w.deps));
    assertEquals(w.state.mails, [`Ticket follow-up (${tier.toUpperCase()}): bug`], `${tier} ${status}`);
  }
});

Deno.test("a resolved L2 ticket is reopened as l2_working, an L3 one as escalated_l3", async () => {
  const two = world({ tier: "l2", status: "resolved" });
  await quietly(() => handleTicketReply(reply(), two.deps));
  assertEquals(two.state.status, "l2_working");
  const three = world({ tier: "l3", status: "closed" });
  await quietly(() => handleTicketReply(reply(), three.deps));
  assertEquals(three.state.status, "escalated_l3");
});

Deno.test("a second user message in a row does not email again", async () => {
  const w = world({ tier: "l2", status: "l2_working" }, [{ author: "l1", body: "Passed on." }, { author: "user", body: "hello?" }]);
  await quietly(() => handleTicketReply(reply(), w.deps));
  assertEquals(w.state.mails, []);
});

Deno.test("someone else's ticket is 404, and the cap marker is 429", async () => {
  const w = world({ device_id: "other" });
  assertEquals((await quietly(() => handleTicketReply(reply(), w.deps))).status, 404);
  assertEquals(w.state.inserted, []);
  const capped = world({}, [], "ticket_reply_rate_limited");
  assertEquals((await quietly(() => handleTicketReply(reply(), capped.deps))).status, 429);
  assertEquals(capped.state.status, "resolved_l1", "nothing reopened when the message was refused");
});

Deno.test("hard guard: a missing or wrong header is 401", async () => {
  for (const header of [null, "nope"]) {
    const w = world({});
    const res = await quietly(() => handleTicketReply(post({ device_id: "d1", ticket_id: "t1", body: "x" }, header), w.deps));
    assertEquals(res.status, 401);
    assertEquals(w.state.inserted, []);
  }
});
