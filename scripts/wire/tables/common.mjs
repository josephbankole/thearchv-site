/* common.mjs: shared pieces for the table fetchers. The HOLD rule lives here (design-final B8):
   a module that fails, or whose data fails its sanity checks, keeps the previous block with
   status "held"; held days count from the last FRESH value, never from a held copy, so a block
   cannot ratchet; the renderers hide a block held more than 3 days.
   Two dates, never mixed: `asOf` (and `lastFreshAsOf`) is the day the data was last fetched and
   confirmed current, and drives holds and visibility; `through` is the newest result the data
   includes, and `throughLabel` (optional) says what it reflects in words, e.g. "After round 15".
   A table fetched today is current even when the last match was two weeks ago. */
import { daysBetween } from "../lib/schema.mjs";

export const WIKI_UA = "TheARCHV-Wire/1.0 (+https://thearchv.ca/standards/; partnerships@josephbankole.ca)";

export function fresh(block, { today, fetchedAt }) {
  return { ...block, asOf: today, through: block.through ?? null, fetchedAt, status: "fresh", heldReason: null, heldDays: 0, lastFreshAsOf: today };
}

export function hold(prevBlock, reason, today) {
  if (!prevBlock) return null;
  const since = prevBlock.lastFreshAsOf || prevBlock.asOf;
  return { ...prevBlock, status: "held", heldReason: reason, heldDays: Math.max(0, daysBetween(since, today)) };
}

// Merge a module's result into the previous blocks for that sport: a fresh block replaces its
// predecessor; a failed id is held; blocks the module did not mention are carried over as held.
export function mergeSport(prevBlocks = [], result, today) {
  const out = [];
  const byId = new Map(prevBlocks.map((b) => [b.id, b]));
  const done = new Set();
  for (const b of result.blocks || []) { out.push(b); done.add(b.id); }
  for (const [id, reason] of Object.entries(result.failed || {})) {
    if (done.has(id)) continue;
    const h = hold(byId.get(id), reason, today);
    if (h) out.push(h);
    done.add(id);
  }
  for (const b of prevBlocks) if (!done.has(b.id)) { const h = hold(b, result.skipped || "not-refreshed", today); if (h) out.push(h); }
  return out;
}

// RFC 4180 CSV, quoted fields and embedded commas included.
export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.length > 1 || r[0] !== "");
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

export const pct = (w, l, t = 0) => {
  const g = w + l + t;
  return g ? ((w + t / 2) / g).toFixed(3).replace(/^0/, "") : ".000";
};
