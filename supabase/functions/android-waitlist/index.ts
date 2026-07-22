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

  // Global hourly ceiling. Cheap HEAD with an exact count. If the probe itself fails we
  // fail OPEN, because losing a real signup is worse than letting one extra through.
  try {
    const since = new Date(Date.now() - 3600000).toISOString();
    const probe = await fetch(`${rest}?select=id&created_at=gte.${since}`, {
      method: "HEAD",
      headers: { ...auth, Prefer: "count=exact" },
    });
    const total = Number((probe.headers.get("content-range") || "").split("/")[1] || "0");
    if (total >= MAX_PER_HOUR) return json({ error: "rate_limited" }, 429, origin);
  } catch {
    // fail open
  }

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
    console.error("insert failed", res.status, await res.text());
    return json({ error: "store_failed" }, 500, origin);
  }
  return json({ ok: true }, 200, origin);
});
