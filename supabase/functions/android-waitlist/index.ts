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

const ORIGINS = ["https://thearchv.ca", "https://www.thearchv.ca"];
const MAX_PER_HOUR = 300;

const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ORIGINS.includes(origin) ? origin : ORIGINS[0],
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

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);

  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const rest = `${url}/rest/v1/android_waitlist`;
  const auth = { apikey: key, Authorization: `Bearer ${key}` };

  let body: { email?: unknown; source?: unknown };
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

  // The hourly ceiling is enforced by an ATOMIC DB trigger (waitlist_hourly_cap), not by a
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
