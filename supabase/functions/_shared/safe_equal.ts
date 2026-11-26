// Constant-time string equality for shared secrets (security review 2026-11-25, V12).
// `a !== b` stops at the first differing character, so response time can hint how much of a
// guessed secret is right. This walks every byte of the longer UTF-8 encoding and folds the
// length difference into the result, so it has no early exit. Sync on purpose: the guards that
// call it (appGuard, the x-push-secret and x-triage-secret checks) stay synchronous.
// A missing value (null, undefined, empty) never matches, so an unset secret cannot be met by an
// absent header.
const enc = new TextEncoder();

export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length === 0 || b.length === 0) return false;
  const x = enc.encode(a);
  const y = enc.encode(b);
  const n = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
