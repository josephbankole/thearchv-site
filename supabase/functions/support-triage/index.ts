// support-triage: runs L1 automatically the moment a ticket is inserted.
// Wired to a Supabase Database Webhook on INSERT into public.tickets. Reads the new ticket, asks
// Claude (with the FAQ as the knowledge base) to resolve or escalate, then writes the reply and
// updates the ticket. This is the automatic version of the archv-support-l1 agent.
//
// Secrets used: ANTHROPIC_API_KEY (required), TRIAGE_SECRET (optional but recommended: guards this
// paid endpoint so only the webhook can call it).
import { json, adminClient } from "../_shared/cors.ts";
import { FAQ } from "../_shared/faq.ts";

const MODEL = "claude-sonnet-4-6";

const STATUS_BY_ACTION: Record<string, { status: string; tier: string }> = {
  resolve: { status: "resolved_l1", tier: "l1" },
  escalate_l2: { status: "l2_working", tier: "l2" },
  escalate_l3: { status: "escalated_l3", tier: "l3" },
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // Guard the endpoint: if TRIAGE_SECRET is set, the webhook must send it back.
  const guard = Deno.env.get("TRIAGE_SECRET");
  if (guard && req.headers.get("x-triage-secret") !== guard) {
    return json({ error: "unauthorized" }, 401);
  }

  let payload: { record?: Record<string, unknown> };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const ticket = payload.record;
  if (!ticket?.id || !ticket?.body) return json({ error: "no ticket record" }, 400);

  const supabase = adminClient();
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    await note(supabase, ticket.id as string, "auto-triage skipped: ANTHROPIC_API_KEY not set");
    return json({ ok: false, reason: "no api key" }, 200);
  }

  const system = [
    "You are the L1 support agent for The ARCHV iOS app.",
    "Voice: British, warm, brief, plain. No em dashes. No false promises. Two or three short sentences.",
    "Resolve only what the knowledge base covers, with nothing disputed. Otherwise escalate.",
    "Escalate to L2 for: confirmed feed or push failures, reproducible crashes, restore-purchase",
    "failures after the standard steps, factual corrections, accessibility reports.",
    "Escalate to L3 for sensitive matters: rights or likeness complaints, disputed or fraudulent",
    "charges, legal threats, data deletion requests.",
    "When in doubt, escalate. A wrong confident answer costs more than a handover.",
    "",
    "KNOWLEDGE BASE:",
    FAQ,
    "",
    'Respond with ONLY a JSON object, no other text, shaped exactly:',
    '{"action":"resolve"|"escalate_l2"|"escalate_l3","reply_to_user":"...","internal_note":"..."}',
    "reply_to_user is what the user reads (a short answer, or an honest holding line if escalating).",
    "internal_note is one line for the next handler.",
  ].join("\n");

  const userMsg =
    `Ticket category: ${ticket.category ?? "other"}\n` +
    `App version: ${ticket.app_version ?? "unknown"}\n\n` +
    `User message:\n${ticket.body}`;

  let decision: { action?: string; reply_to_user?: string; internal_note?: string };
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content: userMsg }],
      }),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const text = (data?.content?.[0]?.text ?? "").trim();
    decision = JSON.parse(extractJson(text));
  } catch (e) {
    await note(supabase, ticket.id as string, `auto-triage failed, left for manual handling: ${String(e).slice(0, 180)}`);
    return json({ ok: false, error: "triage failed" }, 200);
  }

  const next = STATUS_BY_ACTION[decision.action ?? ""] ?? STATUS_BY_ACTION.escalate_l2;
  const reply = (decision.reply_to_user ?? "").toString().trim();
  const internal = (decision.internal_note ?? "").toString().trim();

  if (reply) {
    await supabase.from("ticket_messages").insert({ ticket_id: ticket.id, author: "l1", body: reply });
  }
  if (internal) {
    await supabase.from("ticket_messages").insert({ ticket_id: ticket.id, author: "l1", body: internal, internal: true });
  }
  await supabase.from("tickets").update(next).eq("id", ticket.id);

  // L3 means it needs the founder. Email them, best effort: the ticket is already escalated in the DB.
  if (decision.action === "escalate_l3") {
    await notifyFounder(ticket, internal, reply);
  }

  return json({ ok: true, action: decision.action, ...next }, 200);
});

async function notifyFounder(ticket: Record<string, unknown>, internalNote: string, userReply: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const to = Deno.env.get("FOUNDER_EMAIL");
  const from = Deno.env.get("SUPPORT_FROM_EMAIL") ?? "The ARCHV <support@mail.thearchv.ca>";
  if (!apiKey || !to) return; // not configured yet
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        subject: `L3 escalation: ${ticket.category ?? "ticket"}`,
        text:
          `A support ticket has been escalated to you (L3).\n\n` +
          `Category: ${ticket.category ?? "other"}\n` +
          `App version: ${ticket.app_version ?? "unknown"}\n\n` +
          `User said:\n${ticket.body}\n\n` +
          `L1 note: ${internalNote}\n\n` +
          `Holding reply sent to the user:\n${userReply}\n\n` +
          `Ticket id: ${ticket.id}`,
      }),
    });
  } catch { /* email is best effort; the escalation is already recorded */ }
}

// Tolerate code fences or stray text around the JSON the model returns.
function extractJson(text: string): string {
  const m = text.match(/\{[\s\S]*\}/);
  return m ? m[0] : text;
}

async function note(supabase: ReturnType<typeof adminClient>, ticketId: string, body: string) {
  await supabase.from("ticket_messages").insert({ ticket_id: ticketId, author: "system", body, internal: true });
}
