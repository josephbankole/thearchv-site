// scores-poll's one door to API-Football. The key goes in a header and nowhere else: nothing here
// logs it, puts it in a URL, or returns it, and a failure reason names the kind of failure (an HTTP
// status, a field of the API's error object) but never a request URL or an error message that
// could carry one.

export const API_BASE = "https://v3.football.api-sports.io";
const TIMEOUT_MS = 15_000;

export type ApiResult =
  | { ok: true; fixtures: unknown[]; remaining: number | null }
  | { ok: false; reason: string; remaining: number | null };

// Takes "/fixtures?league=39&..." and answers with the response array, or why not.
export type ApiGet = (pathAndQuery: string) => Promise<ApiResult>;

// What counts as a good reply: HTTP 200, a JSON object whose `errors` is empty ([] when fine, an
// object of messages when the plan or key is refused or the quota is spent) and whose `response`
// is an array. Anything else writes nothing downstream.
export function readEnvelope(
  status: number,
  body: unknown,
): { ok: true; fixtures: unknown[] } | { ok: false; reason: string } {
  if (status !== 200) return { ok: false, reason: `HTTP ${status}` };
  if (!body || typeof body !== "object") return { ok: false, reason: "not a JSON object" };
  const { errors, response } = body as { errors?: unknown; response?: unknown };
  // `errors` is [] or an object when the API is well; a non-empty string is not documented but is
  // read as the failure it would be.
  const failed = Array.isArray(errors)
    ? errors.length > 0
    : typeof errors === "string"
    ? errors.length > 0
    : !!errors && typeof errors === "object" && Object.keys(errors).length > 0;
  if (failed) {
    const keys = Array.isArray(errors) ? "list" : typeof errors === "string" ? "text" : Object.keys(errors as object).join(",").slice(0, 60);
    return { ok: false, reason: `API error (${keys})` };
  }
  if (!Array.isArray(response)) return { ok: false, reason: "no response array" };
  return { ok: true, fixtures: response };
}

// The daily quota left, from the API's own header. A count, not a secret.
export function remainingFrom(headers: Headers): number | null {
  const v = headers.get("x-ratelimit-requests-remaining");
  const n = v === null || v.trim() === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function makeApiGet(key: string, fetchFn: typeof fetch = fetch): ApiGet {
  return async (pathAndQuery) => {
    let res: Response;
    try {
      res = await fetchFn(`${API_BASE}${pathAndQuery}`, {
        headers: { "x-apisports-key": key },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      // Only the error's name: a fetch error's message can quote the URL.
      return { ok: false, reason: `network (${(e as Error)?.name ?? "error"})`, remaining: null };
    }
    const remaining = remainingFrom(res.headers);
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // A non-JSON body falls through to readEnvelope's "not a JSON object".
    }
    return { ...readEnvelope(res.status, body), remaining };
  };
}
