// The helper itself, checked against zones whose rules no timezone update has touched.
import { atEdmonton, atWallClock } from "./edmonton_testkit.ts";

function assertEquals(actual: unknown, expected: unknown, msg = ""): void {
  if (actual !== expected) throw new Error(`expected ${expected} got ${actual}${msg ? `: ${msg}` : ""}`);
}

Deno.test("atWallClock finds the instant in a zone with no clock changes (Regina, UTC-6 all year)", () => {
  assertEquals(atWallClock("America/Regina", "2026-11-16", 7).toISOString(), "2026-11-16T13:00:00.000Z");
  assertEquals(atWallClock("America/Regina", "2026-07-01", 20, 59, 59).toISOString(), "2026-07-02T02:59:59.000Z");
});

Deno.test("atWallClock follows a zone that changes clocks (Toronto)", () => {
  assertEquals(atWallClock("America/Toronto", "2026-11-16", 9).toISOString(), "2026-11-16T14:00:00.000Z");
  assertEquals(atWallClock("America/Toronto", "2026-07-01", 9).toISOString(), "2026-07-01T13:00:00.000Z");
});

Deno.test("atEdmonton agrees with the runtime's own Edmonton clock, whichever rules it has", () => {
  for (const [day, hour] of [["2026-11-16", 7], ["2026-07-01", 7], ["2027-01-10", 21]] as const) {
    const at = atEdmonton(day, hour);
    const shown = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton", hour: "2-digit", hourCycle: "h23" }).format(at);
    assertEquals(Number(shown), hour, `${day} ${hour}:00`);
  }
  // Summer was UTC-6 before the change and after it.
  assertEquals(atEdmonton("2026-07-01", 7).toISOString(), "2026-07-01T13:00:00.000Z");
});
