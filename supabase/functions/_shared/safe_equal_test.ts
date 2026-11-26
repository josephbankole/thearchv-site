// Unit tests for safeEqual. No network: local assert, like the other _shared suites.
function assertEquals(actual: unknown, expected: unknown): void {
  if (actual !== expected) throw new Error(`expected ${String(expected)}, got ${String(actual)}`);
}
import { safeEqual } from "./safe_equal.ts";

Deno.test("equal strings match", () => assertEquals(safeEqual("s3cret-value", "s3cret-value"), true));
Deno.test("different strings of the same length do not match", () => assertEquals(safeEqual("s3cret-value", "s3cret-valuf"), false));
Deno.test("a prefix does not match", () => assertEquals(safeEqual("s3cret", "s3cret-value"), false));
Deno.test("a longer string does not match", () => assertEquals(safeEqual("s3cret-value-x", "s3cret-value"), false));
Deno.test("missing values never match", () => {
  assertEquals(safeEqual(null, "x"), false);
  assertEquals(safeEqual("x", undefined), false);
  assertEquals(safeEqual("", ""), false);
  assertEquals(safeEqual(null, null), false);
});
Deno.test("non-ASCII compares by bytes", () => {
  assertEquals(safeEqual("clé", "clé"), true);
  assertEquals(safeEqual("clé", "cle"), false);
});
