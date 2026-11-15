// Unit tests for the triage core (triage.ts). Run: `deno test` from this dir. No network, no
// permissions: the database, the Anthropic call, the environment and the mailer are fakes.
import { buildUserMessage, MAX_ATTEMPTS, triageTicket, type TriageDb, type TriageDeps } from "./triage.ts";

function assertEquals(actual: unknown, expected: unknown, msg = ""): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`assertion failed${msg ? `: ${msg}` : ""}\n  actual:   ${a}\n  expected: ${e}`);
}
function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

const TICKET = { id: "t1", category: "bug", app_version: "1.6.0", body: "The feed is blank" };

function world(opts: {
  permitted?: boolean;
  attempts?: number;
  reply?: () => Promise<Response>;
  thread?: { author: string; body: string }[];
} = {}) {
  const state = {
    calls: 0,
    released: 0,
    attempts: opts.attempts ?? 0,
    ticket: {} as Record<string, unknown>,
    messages: [] as Record<string, unknown>[],
    mails: [] as string[],
    prompts: [] as string[],
  };
  const db: TriageDb = {
    permit: () => {
      state.calls++;
      return Promise.resolve({ permitted: opts.permitted ?? true });
    },
    releasePermit: () => {
      state.released++;
      return Promise.resolve();
    },
    thread: () => Promise.resolve(opts.thread ?? [{ author: "user", body: TICKET.body }]),
    addMessage: (row) => {
      state.messages.push(row);
      return Promise.resolve();
    },
    updateTicket: (_id, patch) => {
      Object.assign(state.ticket, patch);
      return Promise.resolve();
    },
    recordFailure: () => Promise.resolve(++state.attempts),
  };
  const deps: TriageDeps = {
    db,
    env: (k) => (k === "ANTHROPIC_API_KEY" ? "test-key" : undefined),
    fetch: (_url, init) => {
      state.prompts.push(JSON.parse(String(init?.body)).messages[0].content);
      return opts.reply ? opts.reply() : Promise.resolve(new Response("{}", { status: 500 }));
    },
    mail: (subject) => {
      state.mails.push(subject);
      return Promise.resolve(true);
    },
  };
  return { deps, state };
}

const modelSays = (obj: unknown) => () =>
  Promise.resolve(new Response(JSON.stringify({ content: [{ text: JSON.stringify(obj) }] }), { status: 200 }));
const modelText = (text: string) => () =>
  Promise.resolve(new Response(JSON.stringify({ content: [{ text }] }), { status: 200 }));

Deno.test("resolve: reply written, ticket resolved, no email", async () => {
  const w = world({ reply: modelSays({ action: "resolve", reply_to_user: "Pull to refresh.", internal_note: "faq 5" }) });
  const out = await triageTicket(w.deps, TICKET);
  assertEquals(w.state.ticket, { status: "resolved_l1", tier: "l1" });
  assertEquals(w.state.mails, []);
  assertEquals(out.body.ok, true);
});

Deno.test("escalate_l2 emails the founder, as L3 always has", async () => {
  const w = world({ reply: modelSays({ action: "escalate_l2", reply_to_user: "We are looking.", internal_note: "feed down" }) });
  await triageTicket(w.deps, TICKET);
  assertEquals(w.state.ticket, { status: "l2_working", tier: "l2" });
  assertEquals(w.state.mails, ["L2 escalation: bug"]);
});

Deno.test("escalate_l3 emails the founder", async () => {
  const w = world({ reply: modelSays({ action: "escalate_l3", reply_to_user: "Passed on.", internal_note: "deletion" }) });
  await triageTicket(w.deps, TICKET);
  assertEquals(w.state.ticket, { status: "escalated_l3", tier: "l3" });
  assertEquals(w.state.mails, ["L3 escalation: bug"]);
});

Deno.test("an action outside the allowed set is L2 and the founder is told", async () => {
  for (const action of ["close_ticket", undefined, "toString"]) {
    const w = world({ reply: modelSays({ action, reply_to_user: "Hi." }) });
    const out = await triageTicket(w.deps, TICKET);
    assertEquals(w.state.ticket, { status: "l2_working", tier: "l2" }, String(action));
    assertEquals(w.state.mails, ["L2 escalation (unreadable triage action): bug"], String(action));
    assertEquals(out.body.action, "escalate_l2");
  }
});

Deno.test("an API error gives the permit back and queues the ticket for retry", async () => {
  const w = world({ reply: () => Promise.resolve(new Response("overloaded", { status: 529 })) });
  const out = await triageTicket(w.deps, { ...TICKET });
  assertEquals(w.state.released, 1, "no paid call, so no permit spent");
  assertEquals(w.state.ticket, { status: "pending_triage" }, "a webhook ticket no longer stays at 'new'");
  assertEquals(out.body.attempts, 1);
  assertEquals(w.state.mails, []);
});

Deno.test("a thrown fetch also gives the permit back", async () => {
  const w = world({ reply: () => Promise.reject(new Error("dns")) });
  await triageTicket(w.deps, TICKET);
  assertEquals(w.state.released, 1);
});

Deno.test("an unreadable model reply keeps the permit spent (the call was paid) and queues a retry", async () => {
  const w = world({ reply: modelText("Sure, here is my answer in prose.") });
  await triageTicket(w.deps, TICKET);
  assertEquals(w.state.released, 0);
  assertEquals(w.state.ticket, { status: "pending_triage" });
});

Deno.test(`the ${MAX_ATTEMPTS}th failure ends the retries and goes to the founder`, async () => {
  const w = world({ attempts: MAX_ATTEMPTS - 1, reply: modelText("no json here") });
  const out = await triageTicket(w.deps, TICKET);
  assertEquals(w.state.ticket, { status: "l2_working", tier: "l2" });
  assertEquals(w.state.mails, ["Triage failed: bug"]);
  assertEquals(out.body.status, "l2_working");
});

Deno.test("past the daily ceiling nothing is called and the ticket waits", async () => {
  const w = world({ permitted: false, reply: modelSays({ action: "resolve" }) });
  const out = await triageTicket(w.deps, TICKET);
  assertEquals(w.state.prompts.length, 0);
  assertEquals(w.state.ticket, { status: "pending_triage" });
  assertEquals(out.body.reason, "daily_triage_ceiling_reached");
});

Deno.test("a follow-up is triaged with the conversation, not as a fresh question", async () => {
  const thread = [
    { author: "user", body: TICKET.body },
    { author: "l1", body: "Pull down to refresh." },
    { author: "user", body: "Still blank after refreshing." },
  ];
  const w = world({ thread, reply: modelSays({ action: "escalate_l2", reply_to_user: "Passing this on." }) });
  await triageTicket(w.deps, TICKET);
  const prompt = w.state.prompts[0];
  assert(prompt.includes("[support] Pull down to refresh."), "agent reply included");
  assert(prompt.includes("[user] Still blank after refreshing."), "latest user message included");
  assertEquals(prompt.split(TICKET.body).length - 1, 1, "the mirrored first message is not repeated");
});

Deno.test("a fresh ticket's prompt is just the ticket", () => {
  const msg = buildUserMessage(TICKET, [{ author: "user", body: TICKET.body }]);
  assert(!msg.includes("Conversation"), "no conversation block");
});
