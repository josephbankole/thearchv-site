// Unit tests for the app guards (appGuard.ts). Run: `deno test` from this dir. No network, no
// permissions: the environment is handed in.
import { checkAppSecret, checkAppSecretSoft } from "./appGuard.ts";

function assertEquals(actual: unknown, expected: unknown, msg = ""): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`assertion failed${msg ? `: ${msg}` : ""}\n  actual:   ${a}\n  expected: ${e}`);
}

const SECRET = "s3cret";
const withSecret = (k: string) => (k === "ARCHV_APP_SECRET" ? SECRET : undefined);
const unset = (_k: string) => undefined;
const req = (header?: string) =>
  new Request("https://example.test/fn", {
    method: "POST",
    headers: header === undefined ? {} : { "x-archv-app": header },
  });

// Console noise from the guards' own logging is not what is under test.
function quiet<T>(f: () => T): T {
  const log = console.log, err = console.error;
  console.log = () => {};
  console.error = () => {};
  try {
    return f();
  } finally {
    console.log = log;
    console.error = err;
  }
}
const status = (r: Response | null) => (r === null ? "pass" : r.status);

Deno.test("hard guard: the right header passes", () => {
  assertEquals(quiet(() => status(checkAppSecret(req(SECRET), "t", withSecret))), "pass");
});

Deno.test("hard guard: a missing header is refused", () => {
  assertEquals(quiet(() => status(checkAppSecret(req(), "t", withSecret))), 401);
});

Deno.test("hard guard: a wrong header is refused", () => {
  assertEquals(quiet(() => status(checkAppSecret(req("nope"), "t", withSecret))), 401);
});

Deno.test("hard guard: an unset secret fails closed", () => {
  assertEquals(quiet(() => status(checkAppSecret(req(SECRET), "t", unset))), 401);
});

Deno.test("soft guard: the right header passes", () => {
  assertEquals(quiet(() => status(checkAppSecretSoft(req(SECRET), "t", withSecret))), "pass");
});

Deno.test("soft guard: a missing header is let through", () => {
  assertEquals(quiet(() => status(checkAppSecretSoft(req(), "t", withSecret))), "pass");
});

Deno.test("soft guard: a wrong header is still refused", () => {
  assertEquals(quiet(() => status(checkAppSecretSoft(req("nope"), "t", withSecret))), 401);
});

Deno.test("soft guard: an unset secret fails closed", () => {
  assertEquals(quiet(() => status(checkAppSecretSoft(req(), "t", unset))), 401);
});
