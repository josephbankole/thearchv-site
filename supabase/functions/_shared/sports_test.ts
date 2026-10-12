// Unit tests for the push sport registry (sports.ts). Run: `deno test` from this dir.
// Dependency-free, same tiny local assert as daily-push/fanout_test.ts, so a bare `deno test`
// runs it with no network fetch. The drift test imports the site's own registry
// (src/data/sports.ts, a plain module with no imports) and fails if the two lists part.
import { DEFAULT_SPORT, isSportShape, resolveSport, SPORT_KEYS, unknownSportKey } from "./sports.ts";
import { sports as siteSports } from "../../../src/data/sports.ts";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}
function assertEquals(actual: unknown, expected: unknown, msg = ""): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`expected ${e} got ${a}${msg ? ` — ${msg}` : ""}`);
}

// ---- the list itself ----

Deno.test("the push sport keys match the site registry, in order", () => {
  assertEquals([...SPORT_KEYS], siteSports.map((s) => s.key), "edit src/data/sports.ts and _shared/sports.ts together");
});

Deno.test("football is the default and every key passes the shape check", () => {
  assertEquals(DEFAULT_SPORT, "football");
  for (const key of SPORT_KEYS) assert(isSportShape(key), `${key} should pass the shape check`);
});

// ---- resolveSport: unknown or absent means football ----

Deno.test("every known key resolves to itself, f1 included (digits are allowed)", () => {
  for (const key of SPORT_KEYS) assertEquals(resolveSport(key), key);
});

Deno.test("absent, null and non-string values are football", () => {
  for (const raw of [undefined, null, 42, true, {}, ["nfl"]]) {
    assertEquals(resolveSport(raw), "football", `raw ${JSON.stringify(raw)}`);
  }
});

Deno.test("the app's All tab maps to football", () => {
  assertEquals(resolveSport("all"), "football");
});

Deno.test("a well-formed key the site does not publish is football", () => {
  assertEquals(resolveSport("cricket"), "football");
  assertEquals(resolveSport("rugby-union"), "football");
});

Deno.test("the wrong shape is football and never matched", () => {
  for (const raw of ["NFL", "Tennis", "../nfl", "nfl.json", "nfl/", "", "   ", "a".repeat(33), "f 1", "n\u0000fl"]) {
    assertEquals(resolveSport(raw), "football", `raw ${JSON.stringify(raw)}`);
  }
});

Deno.test("surrounding whitespace is trimmed, case is not folded", () => {
  assertEquals(resolveSport("  tennis "), "tennis");
  assertEquals(resolveSport("Golf"), "football");
});

Deno.test("the shape check is lowercase letters, digits and hyphen, 1 to 32 long", () => {
  assert(isSportShape("a"), "one letter");
  assert(isSportShape("a".repeat(32)), "32 letters");
  assert(!isSportShape("a".repeat(33)), "33 letters");
  assert(isSportShape("formula-1"), "hyphen and digit");
  assert(!isSportShape(""), "empty");
  assert(!isSportShape("nfl_x"), "underscore");
});

// ---- unknownSportKey: what register-push logs ----

Deno.test("unknownSportKey names a well-formed key the server does not know, and nothing else", () => {
  assertEquals(unknownSportKey("cricket"), "cricket");
  assertEquals(unknownSportKey(" cricket "), "cricket");
  assertEquals(unknownSportKey("nfl"), null);
  assertEquals(unknownSportKey("football"), null);
  assertEquals(unknownSportKey("all"), null);
  assertEquals(unknownSportKey("NFL"), null);
  assertEquals(unknownSportKey("<script>"), null);
  assertEquals(unknownSportKey(7), null);
  assertEquals(unknownSportKey(undefined), null);
});
