// Android waitlist intake for thearchv.ca/app.
//
// Why: 44% of the site's inbound traffic (9,076 people in three days, measured
// 2026-07-21) is on Android and cannot install an iOS-only app. This turns that
// otherwise-wasted arrival into a number we own, which is the evidence behind any
// later pitch for Play editorial placement.
//
// Public surface, called from the website with the publishable (anon) key, so JWT
// verification stays ON: a request without the key never reaches this code. The table
// is RLS deny-all, so only this function's service_role can write to it.
//
// The number is meant to be quotable, so it has to be hard to inflate: strict email
// shape, a unique index on lower(email) so a repeat signup is a no-op rather than a
// second row, and a global hourly ceiling so a script cannot run the count up overnight.
//
// Volume controls, cheapest to defeat last. The publishable key ships in every /app/ page, so
// none of these is a credential; together they keep one source from spending the hour's ceiling:
//   1. A present Origin that is not ours is refused (403). This stops other sites' pages, not
//      scripts, which can send any Origin or none.
//   2. A per-IP hourly cap ahead of the global ceiling, through the waitlist_rate_claim RPC
//      (20261115180000_android_waitlist_source_caps.sql). Only a hash of the IP is stored.
//   3. The global 300 an hour trigger (android_waitlist_rate_cap), the last resort.
//   4. A challenge check (verifyChallenge), scaffolded and inert until WAITLIST_CAPTCHA_SECRET
//      is set and the form sends a token; see the README.
// None of these confirms that an address belongs to the person who typed it; that needs double
// opt-in (README), so the total counts addresses submitted, not confirmed.

const ORIGINS = ["https://thearchv.ca", "https://www.thearchv.ca"];
const MAX_PER_HOUR = 300;

// Per-IP hourly cap ahead of the global ceiling. A handful of real signups can share one
// office or household IP, so it is not 1.
const PER_IP_MAX_PER_HOUR = 5;

const cors = (origin: string | null) => ({
  // Only reached once the allow-list gate in the handler has passed, so `origin` here is
  // either one of ORIGINS or absent. ORIGINS[0] now covers exactly the no-Origin case.
  "Access-Control-Allow-Origin": origin ?? ORIGINS[0],
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});

const json = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json" },
  });

// Deliberately conservative. Better to turn away an exotic-but-valid address than to
// let junk inflate a number we intend to quote.
const EMAIL =
  /^[^\s@,;<>()[\]\\]{1,64}@[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

// The first hop in x-forwarded-for is the client as the platform edge saw it. It is
// caller-influenced (a spoofed header can prepend a value) and requests reach this function
// through a CDN and the project gateway, so this is defence in depth behind the global cap,
// never a trust boundary. Empty when absent; the per-IP cap is then skipped rather than putting
// every such caller in one bucket, and the global ceiling still applies.
const clientIp = (req: Request): string =>
  (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();

// A stable opaque key for the counter table, so no raw address is persisted. SHA-256 lives in
// the edge runtime's Web Crypto; hex-encode the digest.
async function hashKey(prefix: string, value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${prefix}:${hex}`;
}

// One atomic rolling-hour claim against public.waitlist_rate_claim (see the migration). Returns
// true when the key is within its cap for the current hour, false when it is over. Fails OPEN on
// a transport/RPC error: a limiter outage must not take the signup form down, and the global
// atomic trigger still backstops the ceiling.
async function withinCap(
  restBase: string,
  auth: Record<string, string>,
  key: string,
  limit: number,
): Promise<boolean> {
  try {
    const res = await fetch(`${restBase}/rpc/waitlist_rate_claim`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ p_key: key, p_limit: limit }),
    });
    if (!res.ok) {
      console.error("waitlist_rate_claim failed", res.status, await res.text());
      return true;
    }
    return (await res.json()) === true;
  } catch (e) {
    console.error("waitlist_rate_claim threw", String(e));
    return true;
  }
}

// Challenge verification (Cloudflare Turnstile assumed). Scaffold only, inert until wired.
//
// The per-IP cap above only makes a flood more expensive; a challenge is what tells a person from
// a script. It needs a provider secret and a site key, so it cannot ship self-contained, and the
// choice is the founder's. Turn it on in this order so no real signup is refused part way:
//   1. Add the challenge widget to public/app/index.html and send its token as `captcha_token` in
//      the POST body.
//   2. Deploy this function.
//   3. `supabase secrets set WAITLIST_CAPTCHA_SECRET=<provider secret>`. The moment the secret is
//      present, a missing or failing token is refused; until then this returns null (skip) and
//      steps 1-2 are harmless.
// For another provider, change the siteverify fetch to its endpoint and response shape.
async function verifyChallenge(
  req: Request,
  body: { captcha_token?: unknown },
  origin: string | null,
): Promise<Response | null> {
  const secret = Deno.env.get("WAITLIST_CAPTCHA_SECRET");
  if (!secret) return null; // Inert until provisioned; the caps above carry the load.

  const token = typeof body.captcha_token === "string" ? body.captcha_token : "";
  if (!token) return json({ error: "captcha_required" }, 400, origin);

  try {
    // Cloudflare Turnstile's verify endpoint; another provider differs in URL and field names.
    const verify = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: clientIp(req) }),
    });
    const out = (await verify.json()) as { success?: boolean };
    if (!out.success) return json({ error: "captcha_failed" }, 403, origin);
  } catch (e) {
    // A challenge-provider outage must not silently open the door: fail CLOSED here, unlike the
    // rate-claim helper, because this is the anti-automation control.
    console.error("captcha verify threw", String(e));
    return json({ error: "captcha_unavailable" }, 503, origin);
  }
  return null;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  // CORS headers only govern whether a browser lets a page read the reply, so a present Origin
  // that is not ours is refused here, before the preflight branch and before the body is read.
  // Only when an Origin is present: curl, scripts and server-side callers send none and are
  // unaffected, so this stops other sites' pages and nothing more. The form at
  // public/app/index.html posts from https://thearchv.ca, which is on the list.
  if (origin !== null && !ORIGINS.includes(origin)) {
    // No Access-Control-* headers on this one, deliberately: nothing cross-site should be able to
    // read the refusal either. Vary stays so a cache never serves it for a different Origin.
    return new Response(JSON.stringify({ error: "forbidden_origin" }), {
      status: 403,
      headers: { "Content-Type": "application/json", "Vary": "Origin" },
    });
  }

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);

  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const restBase = `${url}/rest/v1`;
  const rest = `${restBase}/android_waitlist`;
  const auth = { apikey: key, Authorization: `Bearer ${key}` };

  let body: { email?: unknown; source?: unknown; captcha_token?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400, origin);
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL.test(email)) {
    return json({ error: "invalid_email" }, 400, origin);
  }
  const source = String(body.source ?? "").slice(0, 40) || "unknown";

  // Anti-automation gate (scaffold; inert until WAITLIST_CAPTCHA_SECRET is set).
  const challenge = await verifyChallenge(req, body, origin);
  if (challenge) return challenge;

  // Per-IP cap, ahead of the global ceiling, so one host cannot spend the whole hour's budget and
  // lock the real form out. Skipped when the platform passed no client IP.
  const ip = clientIp(req);
  if (ip && !(await withinCap(restBase, auth, await hashKey("ip", ip), PER_IP_MAX_PER_HOUR))) {
    return json({ error: "rate_limited" }, 429, origin);
  }

  // The global ceiling is enforced by an ATOMIC DB trigger (android_waitlist_rate_cap), not by a
  // read-then-write probe here (security sweep 2026-07-22). The old probe was a TOCTOU race
  // (concurrent bursts each read < MAX and all inserted) AND failed OPEN if the probe threw.
  // The trigger fails CLOSED: on the 301st insert in a rolling hour it aborts with a marker,
  // which we translate to 429 below. MAX_PER_HOUR here is kept only as documentation of the
  // ceiling the migration sets.
  void MAX_PER_HOUR;

  const res = await fetch(rest, {
    method: "POST",
    headers: {
      ...auth,
      "Content-Type": "application/json",
      // A repeat address is a success for the caller, not an error.
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify({
      email,
      source,
      user_agent: (req.headers.get("user-agent") || "").slice(0, 300),
    }),
  });

  if (!res.ok && res.status !== 409) {
    const detail = await res.text();
    // The atomic cap aborts with this marker; surface a clean 429 rather than store_failed.
    if (/waitlist_rate_limited/.test(detail)) return json({ error: "rate_limited" }, 429, origin);
    console.error("insert failed", res.status, detail);
    return json({ error: "store_failed" }, 500, origin);
  }
  return json({ ok: true }, 200, origin);
});
