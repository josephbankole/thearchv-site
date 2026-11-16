import { clientIp } from "./client_ip.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

Deno.test("cf-connecting-ip wins over a caller-written x-forwarded-for", () => {
  const h = new Headers({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1, 203.0.113.7" });
  assertEquals(clientIp(h), "203.0.113.7");
});

Deno.test("a fresh made-up x-forwarded-for does not change the key when cf-connecting-ip is set", () => {
  const a = clientIp(new Headers({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "10.0.0.1" }));
  const b = clientIp(new Headers({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "10.0.0.2" }));
  assertEquals(a, b);
});

Deno.test("IPv6 from cf-connecting-ip is used", () => {
  assertEquals(clientIp(new Headers({ "cf-connecting-ip": " 2001:db8::1 " })), "2001:db8::1");
});

Deno.test("falls back to the first x-forwarded-for entry without cf-connecting-ip", () => {
  assertEquals(clientIp(new Headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" })), "198.51.100.1");
});

Deno.test("a cf-connecting-ip that is not an address falls back", () => {
  assertEquals(clientIp(new Headers({ "cf-connecting-ip": "not an ip", "x-forwarded-for": "198.51.100.1" })), "198.51.100.1");
});

Deno.test("nothing usable gives an empty key", () => {
  assertEquals(clientIp(new Headers()), "");
  assertEquals(clientIp(new Headers({ "x-forwarded-for": "<script>" })), "");
});
