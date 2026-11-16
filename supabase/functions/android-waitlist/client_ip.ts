// Which client address the per-IP cap keys on.
//
// Requests reach this function through Cloudflare and the project gateway. Cloudflare sets
// cf-connecting-ip itself, replacing any value the caller sent, so when it is present it is the
// address Cloudflare saw. x-forwarded-for is different: Cloudflare keeps whatever the caller wrote
// and appends to it, so its first entry is the caller's own claim. It is only the fallback, for a
// route where cf-connecting-ip does not arrive.
//
// Neither makes the cap a trust boundary. A caller with many real addresses still gets many
// buckets; the challenge (verifyChallenge in index.ts) is what tells a person from a script.
// Empty when nothing usable arrived; the caller then skips the per-IP cap rather than putting
// every such request in one bucket.

// Loose shape check for an IPv4 or IPv6 literal, so a header that carries something else is not
// used as a key.
const IP_SHAPE = /^[0-9A-Fa-f:.]{2,45}$/;

const usable = (v: string | null | undefined): string => {
  const s = (v ?? "").trim();
  return IP_SHAPE.test(s) ? s : "";
};

export function clientIp(headers: Headers): string {
  const cf = usable(headers.get("cf-connecting-ip"));
  if (cf) return cf;
  return usable((headers.get("x-forwarded-for") ?? "").split(",")[0]);
}
