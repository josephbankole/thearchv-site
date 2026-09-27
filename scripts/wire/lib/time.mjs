/* time.mjs: date parsing for the Wire. No dependencies; zones go through Intl.
   ESPN stamps every item "EST" all year, and read literally that puts same-day items in the
   future, so a zone LABEL is read as the source's own wall clock (timeZoneHint), while a numeric
   offset or Z is taken exactly. See design-final B2. */

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

// Offset in minutes of `zone` at the instant `ms` (positive east of UTC).
function zoneOffsetMinutes(ms, zone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

// Wall-clock time in `zone` to a UTC instant (ms). Two passes settle DST edges.
export function wallToUtc(y, mo, d, h, mi, s, zone) {
  const guess = Date.UTC(y, mo, d, h, mi, s);
  let ms = guess - zoneOffsetMinutes(guess, zone) * 60000;
  ms = guess - zoneOffsetMinutes(ms, zone) * 60000;
  return ms;
}

// Calendar date (YYYY-MM-DD) of an instant in a zone.
export function dateInZone(ms, zone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

/* Parse an RSS or Atom date. Returns { ms, exact } or null.
   exact is true when the string carried a numeric offset or Z. */
export function parseFeedDate(raw, zoneHint = "UTC") {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim();
  // ISO 8601 (Atom)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/);
  if (iso) {
    const [, y, mo, d, h, mi, se = "0", z] = iso;
    if (z) {
      const ms = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${se.padStart(2, "0")}${z === "Z" ? "Z" : z.length === 5 ? z.slice(0, 3) + ":" + z.slice(3) : z}`);
      return Number.isFinite(ms) ? { ms, exact: true } : null;
    }
    return { ms: wallToUtc(+y, +mo - 1, +d, +h, +mi, +se, zoneHint), exact: false };
  }
  // RFC 822: "Sat, 26 Sep 2026 12:21:55 EST" or "... +0000"
  const rfc = s.match(/^(?:[A-Za-z]{3},\s*)?(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([A-Za-z]{1,5}|[+-]\d{4})?$/);
  if (rfc) {
    const [, d, monName, yRaw, h, mi, se = "0", zone] = rfc;
    const mo = MONTHS[monName.toLowerCase()];
    if (mo === undefined) return null;
    const y = yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw);
    if (zone && /^[+-]\d{4}$/.test(zone)) {
      const sign = zone[0] === "-" ? -1 : 1;
      const off = sign * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(3)));
      return { ms: Date.UTC(y, mo, +d, +h, +mi, +se) - off * 60000, exact: true };
    }
    if (zone && /^(GMT|UTC|UT|Z)$/i.test(zone)) return { ms: Date.UTC(y, mo, +d, +h, +mi, +se), exact: true };
    // A zone label such as EST/EDT/PST, or none: read as the source's wall clock.
    return { ms: wallToUtc(y, mo, +d, +h, +mi, +se, zoneHint), exact: false };
  }
  return null;
}
