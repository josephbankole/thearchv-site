// Unit tests for the editorial day in push_guard.ts. Run: `deno test` from this dir. No network.
// edmontonDay builds the day from its parts, so it does not rest on the en-CA short-date pattern,
// and it throws rather than hand back anything that is not YYYY-MM-DD.
import { edmontonDay, isoDayFromParts } from "./push_guard.ts";

function assertEquals(actual: unknown, expected: unknown, msg = ""): void {
  if (actual !== expected) throw new Error(`${msg} expected ${String(expected)}, got ${String(actual)}`);
}

function assertThrows(fn: () => unknown, msg = ""): void {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error(`${msg} expected a throw`);
}

const parts = (...p: [Intl.DateTimeFormatPartTypes, string][]): Intl.DateTimeFormatPart[] =>
  p.map(([type, value]) => ({ type, value }));

Deno.test("edmontonDay gives the Edmonton calendar day as YYYY-MM-DD", () => {
  assertEquals(edmontonDay(new Date("2026-10-10T05:30:00Z")), "2026-10-09");
  assertEquals(edmontonDay(new Date("2026-01-05T12:00:00Z")), "2026-01-05");
});

Deno.test("a month-first pattern from the formatter still gives an ISO day", () => {
  const p = parts(["month", "11"], ["literal", "/"], ["day", "15"], ["literal", "/"], ["year", "2026"]);
  assertEquals(isoDayFromParts(p), "2026-11-15");
});

Deno.test("parts that cannot make YYYY-MM-DD throw", () => {
  assertThrows(() => isoDayFromParts(parts(["month", "11"], ["day", "15"])), "no year");
  assertThrows(() => isoDayFromParts(parts(["year", "2026"], ["month", "1"], ["day", "5"])), "unpadded");
});

Deno.test("an invalid date throws instead of giving a day", () => {
  assertThrows(() => edmontonDay(new Date("not a date")));
});
