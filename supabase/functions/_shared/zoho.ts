// Shared Zoho Mail sender (Canadian DC). Extracted from support-triage's L3-escalation email so
// health-probe can reuse the exact same send path for launch-health alerts.
// Secrets: ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_ACCOUNT_ID, FOUNDER_EMAIL.
// Best effort: never throws. Returns false if not configured or the send fails; callers treat the
// escalation/alert as already recorded elsewhere and the email as a bonus, not a dependency.
export async function sendFounderMail(subject: string, content: string): Promise<boolean> {
  const clientId = Deno.env.get("ZOHO_CLIENT_ID");
  const clientSecret = Deno.env.get("ZOHO_CLIENT_SECRET");
  const refreshToken = Deno.env.get("ZOHO_REFRESH_TOKEN");
  const accountId = Deno.env.get("ZOHO_ACCOUNT_ID");
  const to = Deno.env.get("FOUNDER_EMAIL");
  if (!clientId || !clientSecret || !refreshToken || !accountId || !to) return false; // not configured yet
  try {
    const tokenRes = await fetch("https://accounts.zohocloud.ca/oauth/v2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    const { access_token } = await tokenRes.json();
    if (!access_token) return false;
    const res = await fetch(`https://zmail.zohocloud.ca/api/accounts/${accountId}/messages`, {
      method: "POST",
      headers: { authorization: `Zoho-oauthtoken ${access_token}`, "content-type": "application/json" },
      body: JSON.stringify({
        fromAddress: to,
        toAddress: to,
        subject,
        mailFormat: "plaintext",
        content,
      }),
    });
    return res.ok;
  } catch {
    return false; // email is best effort; the caller's own record of the event already exists
  }
}
