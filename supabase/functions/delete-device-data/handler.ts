// delete-device-data handler: the app's "Delete my data" action.
// POST { device_id } -> { ok, tickets, push_tokens }
// Deletes every support ticket this device_id filed (its messages go with it, on delete cascade)
// and every push token registered under it. There is no login, so the device_id is the only key,
// exactly as for reading the inbox through ticket-thread: whoever can read a device's tickets can
// also delete them, and nothing else. The app sends its own DeviceID, then forgets it, so a later
// ticket starts a new history.
//
// Not touched: the Android waitlist (keyed by email, not device), and ticket-thread's lookup log,
// which holds only a device_id and a time, is what this endpoint's own rate limit counts, and is
// deleted after two hours anyway (20261115191900).
//
// index.ts wires this to the service-role client; handler_test.ts tests it.
import { corsHeaders, type Env, json } from "../_shared/http.ts";
import { checkAppSecret } from "../_shared/appGuard.ts";

export type DeleteStore = {
  // One row in ticket_thread_requests, so the same per-device and global hourly caps apply. The
  // error is the database's own message, matched for the cap's abort marker.
  logLookup(device_id: string): Promise<{ error?: string }>;
  deleteTickets(device_id: string): Promise<{ count?: number; error?: string }>;
  deletePushTokens(device_id: string): Promise<{ count?: number; error?: string }>;
};

export async function handleDeleteDeviceData(
  req: Request,
  deps: { env: Env; store: DeleteStore },
): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const guardResp = checkAppSecret(req, "delete-device-data", deps.env);
  if (guardResp) return guardResp;

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  if (!payload || typeof payload !== "object") return json({ error: "invalid json" }, 400);

  const device_id = typeof payload.device_id === "string" ? payload.device_id.trim() : "";
  if (!device_id) return json({ error: "device_id required" }, 400);
  if (device_id.length > 128) return json({ error: "device_id too long" }, 400);

  const logged = await deps.store.logLookup(device_id);
  if (logged.error) {
    if (/ticket_thread_rate_limited/.test(logged.error)) {
      return json({ error: "rate limited, please try again later" }, 429);
    }
    console.error("delete-device-data: rate-log db error", logged.error);
    return json({ error: "server_error" }, 500);
  }

  // Push tokens first: if the ticket delete then fails, a retry finds the tokens already gone and
  // still deletes the tickets, so a partial run never needs anything but the same call again.
  const tokens = await deps.store.deletePushTokens(device_id);
  if (tokens.error) {
    console.error("delete-device-data: push_tokens db error", tokens.error);
    return json({ error: "server_error" }, 500);
  }
  const tickets = await deps.store.deleteTickets(device_id);
  if (tickets.error) {
    console.error("delete-device-data: tickets db error", tickets.error);
    return json({ error: "server_error" }, 500);
  }

  // Counts only: no device_id, token or ticket text is logged or returned.
  const result = { tickets: tickets.count ?? 0, push_tokens: tokens.count ?? 0 };
  console.log(JSON.stringify({ fn: "delete-device-data", ...result }));
  return json({ ok: true, ...result }, 200);
}
