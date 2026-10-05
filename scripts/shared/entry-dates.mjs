/* entry-dates.mjs — the one place a page, a sitemap row or a feed item gets its dates from
   (search plan G10, 2026-10-04).

   WHY. Until this date every dated page stamped datePublished and dateModified from the entry's
   calendar date, the RSS feed and the news sitemap stamped 12:00 -06:00 on it (about seven hours
   after the 05:22 ET commit, so an entry was future-dated at its first crawl), and the sitemap
   stamped the build date on 97 evergreen URLs whose content had not changed. Google uses lastmod
   only "if it's consistently and verifiably accurate", and asks whether a site changes dates "to
   make them seem fresh when the content has not substantially changed".

   THE RULE. The dates come from fields on the data, never from git and never from the build clock:
     publishedAt  stamped by ../scripts/archv-site-commit.mjs at commit time, a full ISO time with
                  its America/Toronto offset. Entries filed before the field existed were backfilled
                  from the commit that first carried them, or, where that commit fell on a later
                  day, the entry date at 05:00 ET.
     updatedAt    stamped only by an amend (a correction or a revision). Absent means never changed,
                  and dateModified is then publishedAt.
   A page nobody touched never moves.

   Every field is optional and the build never fails on one: an entry without publishedAt gets the
   05:00 ET fallback, and the counts are reported by dateFieldReport() as a warning (warn-only for
   seven days from 2026-10-04, per plan §2 Step 0). */

const ISO_ZONED = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const isZonedIso = (s) => typeof s === "string" && ISO_ZONED.test(s) && !Number.isNaN(Date.parse(s));

/** The America/Toronto wall-clock parts of an instant. */
function torontoParts(d) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  return Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
}

/** An instant as ISO 8601 in Toronto wall time with its offset: 2026-10-04T05:22:31-04:00. */
export function torontoIso(d = new Date()) {
  const p = torontoParts(d);
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const offMin = Math.round((wall - Math.floor(d.getTime() / 1000) * 1000) / 60000);
  const a = Math.abs(offMin);
  const off = `${offMin < 0 ? "-" : "+"}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${off}`;
}

/** 05:00 Toronto time on a calendar date, with whichever offset is in force that day. */
export function fallbackPublished(dateOnly) {
  const day = String(dateOnly ?? "").slice(0, 10);
  if (!DATE_ONLY.test(day)) return day;
  for (const off of ["-04:00", "-05:00"]) {
    const s = `${day}T05:00:00${off}`;
    if (torontoIso(new Date(s)) === s) return s;
  }
  return `${day}T05:00:00-05:00`;
}

/** When the entry went out. */
export function publishedAt(entry) {
  return isZonedIso(entry && entry.publishedAt) ? entry.publishedAt : fallbackPublished(entry && entry.date);
}

/** When the entry last changed: updatedAt when an amend stamped one later than publication,
    otherwise the publication time itself. */
export function modifiedAt(entry) {
  const pub = publishedAt(entry);
  const upd = entry && entry.updatedAt;
  return isZonedIso(upd) && Date.parse(upd) > Date.parse(pub) ? upd : pub;
}

/** True when the entry carries a real update stamp. */
export const wasUpdated = (entry) => modifiedAt(entry) !== publishedAt(entry);

/** RFC 822 for RSS pubDate, in the instant's own offset. */
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function rfc822(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(String(iso));
  if (!m) return rfc822(fallbackPublished(iso));
  const [, y, mo, d, hh, mm, ss = "00", zone] = m;
  const weekday = WEEKDAYS[new Date(Date.UTC(+y, +mo - 1, +d)).getUTCDay()];
  const z = zone === "Z" ? "+0000" : zone.replace(":", "");
  return `${weekday}, ${d} ${MONTHS[+mo - 1]} ${y} ${hh}:${mm}:${ss} ${z}`;
}

/** The newest of a list of ISO instants, or undefined. */
export function newest(isos) {
  let best;
  for (const s of isos) if (isZonedIso(s) || DATE_ONLY.test(String(s))) if (!best || Date.parse(s) > Date.parse(best)) best = s;
  return best;
}

/** Warn-only census of the G10 fields over a set of entries. Never throws. */
export function dateFieldReport(entries, tag) {
  let missing = 0;
  let bad = 0;
  for (const e of entries) {
    if (e.publishedAt === undefined) missing++;
    else if (!isZonedIso(e.publishedAt)) bad++;
    if (e.updatedAt !== undefined && !isZonedIso(e.updatedAt)) bad++;
  }
  if (missing || bad) console.warn(`${tag} G10 (warn-only): ${missing} entr${missing === 1 ? "y" : "ies"} without publishedAt use the 05:00 ET fallback; ${bad} field(s) not a zoned ISO time`);
  return { missing, bad };
}

// tests-by-assertion, the convention build-article-pages.mjs uses: a regression fails the build.
(function selfTestEntryDates() {
  const eq = (got, want, what) => { if (got !== want) throw new Error(`entry-dates self-test (${what}): expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`); };
  eq(fallbackPublished("2026-10-04"), "2026-10-04T05:00:00-04:00", "summer fallback");
  eq(fallbackPublished("2026-12-01"), "2026-12-01T05:00:00-05:00", "winter fallback");
  eq(torontoIso(new Date("2026-10-04T09:22:31Z")), "2026-10-04T05:22:31-04:00", "toronto iso");
  eq(publishedAt({ date: "2026-10-04", publishedAt: "2026-10-04T05:22:31-04:00" }), "2026-10-04T05:22:31-04:00", "stamped");
  eq(publishedAt({ date: "2026-10-04" }), "2026-10-04T05:00:00-04:00", "unstamped");
  eq(modifiedAt({ date: "2026-10-04" }), "2026-10-04T05:00:00-04:00", "never updated");
  eq(modifiedAt({ date: "2026-10-04", updatedAt: "2026-10-06T07:00:00-04:00" }), "2026-10-06T07:00:00-04:00", "updated");
  eq(modifiedAt({ date: "2026-10-04", publishedAt: "2026-10-04T05:22:31-04:00", updatedAt: "2026-10-04T05:00:00-04:00" }), "2026-10-04T05:22:31-04:00", "an update stamp earlier than publication is ignored");
  eq(rfc822("2026-10-04T05:22:31-04:00"), "Sun, 04 Oct 2026 05:22:31 -0400", "rfc822");
})();
