// Unit tests for push_run.ts. Run: `deno test` from this dir.
import { pushRunFailing, runOutcomeRow } from "./push_run.ts";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}
function assertEquals(actual: unknown, expected: unknown, msg = ""): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`expected ${e} got ${a}${msg ? ` — ${msg}` : ""}`);
}

const NOW = new Date("2026-11-15T18:00:00Z");
const row = (o: { claimed: number; sent: number; failed: number; dead?: number; reasons?: Record<string, number> }, at = "2026-11-15T15:00:00Z") =>
  runOutcomeRow({ dead: 0, reasons: {}, ...o }, new Date(at));

Deno.test("the row keeps the five commonest reasons, most first", () => {
  const r = runOutcomeRow({
    claimed: 10,
    sent: 2,
    failed: 8,
    dead: 1,
    reasons: { a: 1, b: 3, c: 2, d: 1, e: 1, f: 0, g: 1 },
  }, NOW);
  assertEquals(r.last_run_reasons, { b: 3, c: 2, a: 1, d: 1, e: 1 });
  assertEquals(r.last_run_at, NOW.toISOString());
  assertEquals([r.last_run_claimed, r.last_run_sent, r.last_run_failed, r.last_run_dead], [10, 2, 8, 1]);
});

Deno.test("every send failing alerts, even though the lead is recorded as sent", () => {
  const detail = pushRunFailing(row({ claimed: 40, sent: 0, failed: 40, reasons: { InvalidProviderToken: 40 } }), NOW);
  assert(detail?.includes("sent 0 of 40"), `got ${detail}`);
  assert(detail?.includes("InvalidProviderToken"), "names the reason");
});

Deno.test("more than half failing alerts, half or less does not", () => {
  assert(pushRunFailing(row({ claimed: 10, sent: 4, failed: 6 }), NOW)?.includes("failed 6 of 10"), "6 of 10");
  assertEquals(pushRunFailing(row({ claimed: 10, sent: 5, failed: 5 }), NOW), null, "5 of 10");
  assertEquals(pushRunFailing(row({ claimed: 10, sent: 10, failed: 0 }), NOW), null, "clean run");
});

Deno.test("more dead tokens than one run deletes alerts", () => {
  assert(pushRunFailing(row({ claimed: 400, sent: 374, failed: 26, dead: 26 }), NOW)?.includes("26 dead"), "26 dead");
  assertEquals(pushRunFailing(row({ claimed: 400, sent: 375, failed: 25, dead: 25 }), NOW), null, "25 dead");
});

Deno.test("nothing claimed, no run recorded, or an old run raises nothing", () => {
  assertEquals(pushRunFailing(row({ claimed: 0, sent: 0, failed: 0 }), NOW), null);
  assertEquals(pushRunFailing({ last_build_hash: "x", last_sent_at: "2026-11-15T15:00:00Z" }, NOW), null);
  assertEquals(pushRunFailing(null, NOW), null);
  assertEquals(pushRunFailing(row({ claimed: 5, sent: 0, failed: 5 }, "2026-11-13T15:00:00Z"), NOW), null);
});
