/* canon.mjs: dedupe keys for the Wire. The canonical URL is a KEY ONLY: it is never displayed
   and never linked, because ESPN's terms forbid modifying the feed's URL. What is stored and
   linked is always the feed's own link, byte for byte. See design-final B3. */
import { createHash } from "node:crypto";

const TRACKING = /^(utm_.*|ref|ref_src|refsrc|cmpid|cmp|src|ex_cid|mod|partner|at_.*|fbclid|gclid|mc_cid|mc_eid|ito|xtor|guccounter|ocid|smid|sr_share|taid|cid)$/i;

export const hash12 = (s) => createHash("sha256").update(String(s)).digest("hex").slice(0, 12);

export function canonicalUrl(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k));
  params.sort(([a, av], [b, bv]) => (a < b ? -1 : a > b ? 1 : av < bv ? -1 : av > bv ? 1 : 0));
  const query = params.length ? "?" + params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&") : "";
  let path = u.pathname.replace(/\/+$/, "");
  const port = u.port && u.port !== "443" && u.port !== "80" ? `:${u.port}` : "";
  return `${u.protocol}//${host}${port}${path}${query}`;
}

export function normaliseTitle(title) {
  return String(title || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’‚‛“”„‟'"`]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const titleKey = (title) => hash12(normaliseTitle(title));
export const urlKey = (url) => { const c = canonicalUrl(url); return c ? hash12(c) : null; };
export const guidKey = (guid) => (guid && String(guid).trim() ? hash12(String(guid).trim()) : null);
export const itemId = (sourceId, { guid, url }) => `${sourceId}:${guidKey(guid) || urlKey(url)}`;

// A link is usable only when it is https on one of the source's hosts (suffix match on a dot
// boundary), with no user info and no non-default port.
export function linkAllowed(raw, hosts) {
  let u;
  try { u = new URL(String(raw)); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  if (u.port && u.port !== "443") return false;
  const h = u.hostname.toLowerCase();
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(":") || h === "localhost") return false;
  return hosts.some((allowed) => h === allowed || h.endsWith("." + allowed));
}
