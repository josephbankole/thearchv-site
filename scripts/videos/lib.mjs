/* lib.mjs: the front page's video block (founder, 2026-11-21: the latest YouTube long-form videos
   and the latest Shorts on the home page, directly below the live scores strip, playable on the
   site, and a feed the iOS app can read).

   One module, four readers:
   - scripts/fetch-videos.mjs parses YouTube's public Atom feeds with parseFeed() and writes the
     snapshot scripts/data/videos.json (schema archv-videos/1) plus one thumbnail per video under
     public/media/videos/. That is the only step that touches the network.
   - vite.config.ts swaps renderHomeVideos(loadVideos()) in at the <!--archv:videos--> marker.
   - scripts/build-feed.mjs publishes the same snapshot as dist/feed/videos.json for the app.
   - the tests in scripts/test/ and scripts/verify-csp-pages.mjs read the constants below.

   Pure apart from loadVideos(), which reads two things inside the repo (trap 0 in CLAUDE.md).
   Nothing here may emit a <script> tag: index.html carries exactly one inline bootstrap and
   scripts/check-csp-hash.mjs asserts that. The player is the bundled src/components/videos.ts.

   NO VIEW COUNTS. The feed carries them, they lag by hours, and YouTube's developer policy wants
   any count shown to be current. They are dropped at parse time and never reach the snapshot. */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const VIDEOS_SCHEMA = "archv-videos/1";
export const CHANNEL_ID = "UCl6d9aV0mLImkGwvYzunWBg";
export const CHANNEL_URL = "https://www.youtube.com/@thearchvca";
// YouTube's own auto-playlists for a channel: the id with UC swapped for UULF is every public
// long-form upload, UUSH every Short. They are undocumented but long-standing, so each entry is
// also cross-checked against its own link (/watch for long-form, /shorts/ for a Short).
export const PLAYLISTS = {
  long: `UULF${CHANNEL_ID.slice(2)}`,
  shorts: `UUSH${CHANNEL_ID.slice(2)}`,
};
export const feedUrl = (playlistId) => `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`;

// The one origin the homepage CSP's frame-src names. src/components/videos.ts builds the player
// URL from the same string (a test holds the two together) and verify-csp-pages.mjs fails the
// build if a page carrying data-embed-origin does not allow it.
export const EMBED_ORIGIN = "https://www.youtube-nocookie.com";

// What the snapshot keeps, and what the front page shows of it. The feed keeps a few more than the
// page shows so the app can run a longer shelf from the same file.
export const KEEP = { long: 6, shorts: 8 };
export const SHOW = { long: 3, shorts: 6 };

// Thumbnails are mirrored to our own origin at these sizes (WebP), so img-src stays 'self' and
// nothing reaches Google until the visitor presses play.
export const THUMB = {
  long: { width: 800, height: 450 },
  shorts: { width: 405, height: 720 },
};
export const THUMB_DIR = "/media/videos";
export const thumbPath = (id) => `${THUMB_DIR}/${id}.webp`;

export const SNAPSHOT_PATH = join(ROOT, "scripts", "data", "videos.json");
export const HIDDEN_PATH = join(ROOT, "scripts", "data", "videos-hidden.json");
export const APPROVED_PATH = join(ROOT, "scripts", "data", "videos-approved.json");
// A snapshot older than this is not shown or published at all. YouTube's developer policy asks
// for stored data to be refreshed within 30 days, and a list that old may name videos that have
// since been deleted or made private. The daily fetch in deploy.yml keeps the age to a day; this
// is what happens when that fetch has failed for a month.
export const MAX_AGE_DAYS = 30;
export const PUBLIC_DIR = join(ROOT, "public");

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/* ---------- parsing the Atom feed ---------- */

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
export function decodeXml(s) {
  return String(s ?? "").replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, ref) => {
    if (ref[0] === "#") {
      const code = ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return Object.hasOwn(ENTITIES, ref) ? ENTITIES[ref] : m;
  });
}

/* A title as the site prints it. The channel signs long-form titles " | The ARCHV", which says
   nothing on The ARCHV's own page; hashtags never ship from this house (workspace rule), so a
   "#shorts" a title picked up on YouTube is dropped here as well. Only a tag that starts with a
   letter is a hashtag: "#10", "#1" and "#9s" are shirt numbers and rankings and stay. The
   sign-off goes last, so it is still found when a hashtag followed it. */
export function cleanTitle(raw) {
  return decodeXml(raw)
    .replace(/(^|\s)#(?=\p{L})[\p{L}\p{N}_]+(?=\s|$)/gu, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*\|\s*The ARCHV$/i, "")
    .trim();
}

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? m[1].trim() : "";
};

/* parseFeed(xml, kind): the entries of one playlist feed as snapshot items WITHOUT a thumbnail
   (the fetcher adds thumb, thumbWidth and thumbHeight once the image is on disk), newest first.
   `kind` is "long" or "shorts". An entry is dropped, and named in `dropped`, when its id is not a
   video id, it belongs to another channel, its date does not parse, its title is empty, or its
   link disagrees with the playlist it came from. Throws when the text is not an Atom feed at all,
   so an HTML error page can never be read as "the channel has no videos". */
export function parseFeed(xml, kind) {
  if (kind !== "long" && kind !== "shorts") throw new Error(`parseFeed: unknown kind ${kind}`);
  const text = String(xml ?? "");
  if (!/<feed[\s>]/.test(text) || !text.includes("</feed>")) throw new Error("not an Atom feed");
  const items = [];
  const dropped = [];
  const seen = new Set();
  // Attributes are read by name, in any order and either quote style, and <entry> may carry
  // attributes of its own: a harmless re-serialisation of the feed must not read as "no videos".
  // The exact-URL check below is the guard, so nothing looser gets through.
  const attr = (t, name) => (t.match(new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`)) || [])[2] ?? "";
  for (const [, entry] of text.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/g)) {
    const id = tag(entry, "yt:videoId");
    const channel = tag(entry, "yt:channelId");
    const title = cleanTitle(tag(entry, "title"));
    const published = tag(entry, "published");
    const alt = (entry.match(/<link\b[^>]*>/g) || []).find((t) => attr(t, "rel") === "alternate");
    const link = decodeXml(alt ? attr(alt, "href") : "");
    const drop = (why) => dropped.push({ id, why });
    if (!ID_RE.test(id)) { drop("bad video id"); continue; }
    if (seen.has(id)) { drop("duplicate"); continue; }
    if (channel !== CHANNEL_ID) { drop(`channel ${channel || "missing"}`); continue; }
    if (!title) { drop("empty title"); continue; }
    const when = new Date(published);
    if (!published || Number.isNaN(when.getTime())) { drop("bad published date"); continue; }
    const isShortLink = link === `https://www.youtube.com/shorts/${id}`;
    const isWatchLink = link === `https://www.youtube.com/watch?v=${id}`;
    if (kind === "shorts" ? !isShortLink : !isWatchLink) { drop(`link is not a ${kind} link: ${link || "missing"}`); continue; }
    seen.add(id);
    items.push({ id, title, published: when.toISOString(), url: link });
  }
  items.sort((a, b) => (a.published < b.published ? 1 : a.published > b.published ? -1 : 0));
  return { items, dropped };
}

/* ---------- the snapshot ---------- */

const isStr = (v) => typeof v === "string" && v.trim() !== "";

/** Every problem with one snapshot item, as text. Empty means it is sound. */
export function itemProblems(v, kind, where) {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return [`${where}: not an object`];
  const out = [];
  if (!ID_RE.test(v.id ?? "")) out.push(`${where}.id: not a video id`);
  if (!isStr(v.title)) out.push(`${where}.title: empty`);
  if (!isStr(v.published) || Number.isNaN(new Date(v.published).getTime())) out.push(`${where}.published: not a date`);
  const want = kind === "shorts" ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`;
  if (v.url !== want) out.push(`${where}.url: expected ${want}`);
  if (v.thumb !== thumbPath(v.id)) out.push(`${where}.thumb: expected ${thumbPath(v.id)}`);
  if (v.thumbWidth !== THUMB[kind].width || v.thumbHeight !== THUMB[kind].height) {
    out.push(`${where}: thumbnail must be ${THUMB[kind].width}x${THUMB[kind].height}`);
  }
  return out;
}

/** Every problem with a whole snapshot (or the published feed, which is the same shape). */
export function snapshotProblems(data) {
  if (typeof data !== "object" || data === null) return ["snapshot: not an object"];
  const out = [];
  if (data.schema !== VIDEOS_SCHEMA) out.push(`schema: expected ${VIDEOS_SCHEMA}`);
  if (!isStr(data.fetchedAt) || Number.isNaN(new Date(data.fetchedAt).getTime())) out.push("fetchedAt: not a date");
  for (const kind of ["long", "shorts"]) {
    if (!Array.isArray(data[kind])) { out.push(`${kind}: not an array`); continue; }
    data[kind].forEach((v, i) => out.push(...itemProblems(v, kind, `${kind}[${i}]`)));
    const ids = data[kind].map((v) => v?.id);
    if (new Set(ids).size !== ids.length) out.push(`${kind}: duplicate ids`);
  }
  return out;
}

/* A fresh fetch is refused, and the committed snapshot kept, when it looks wrong rather than
   new: nothing came back for a list, or far fewer than the snapshot holds. A channel does not
   lose half its videos overnight; a feed that says so is having a bad day. */
export function suspicious(fresh, previous) {
  const reasons = [];
  for (const kind of ["long", "shorts"]) {
    const now = fresh[kind]?.length ?? 0;
    const before = previous?.[kind]?.length ?? 0;
    if (now === 0) reasons.push(`${kind}: no entries`);
    else if (before > 0 && now < Math.ceil(before / 2)) reasons.push(`${kind}: ${now} entries, the snapshot has ${before}`);
  }
  return reasons;
}

/* hiddenIds(): the ids in scripts/data/videos-hidden.json. The site's rights line is no crests,
   kits, sponsor marks or match photographs anywhere, and a thumbnail that is a frame of match
   footage would put one on the front page, so such a video is listed there and never shown. A
   missing file hides nothing; a malformed one throws. */
export function hiddenIds(path = HIDDEN_PATH) {
  if (!existsSync(path)) return new Set();
  const { hidden } = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(hidden) || hidden.some((h) => !ID_RE.test(h?.id ?? ""))) throw new Error(`[videos] ${path}: "hidden" must be a list of { id, why }`);
  return new Set(hidden.map((h) => h.id));
}

/* approvedIds(): the ids in scripts/data/videos-approved.json. APPROVE FIRST: a video reaches the
   front page, the mirror and the app feed only once someone has looked at its thumbnail (no kit,
   crest, sponsor mark or match frame) and listed its id there. Nothing can check a thumbnail for
   those by machine, and two in five of the channel's recent uploads broke the line, so an
   unlisted video is held, not shown. A missing file approves nothing; a malformed one throws. */
export function approvedIds(path = APPROVED_PATH) {
  if (!existsSync(path)) return new Set();
  const { approved } = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(approved) || approved.some((a) => !ID_RE.test(a?.id ?? ""))) throw new Error(`[videos] ${path}: "approved" must be a list of { id, why }`);
  return new Set(approved.map((a) => a.id));
}

/* loadVideos(): the committed snapshot, checked, with any video that is hidden, not approved or
   whose thumbnail is not on disk left out. Returns null when there is no snapshot, or when the
   snapshot is older than MAX_AGE_DAYS (the block and the feed then ship empty, and one line says
   why). An unreadable or malformed snapshot throws: that is a broken commit, and a build that
   quietly dropped the block would hide it. `now` is a parameter so a test can hold the clock. */
export function loadVideos({ path = SNAPSHOT_PATH, publicDir = PUBLIC_DIR, hidden = hiddenIds(), approved = approvedIds(), now = Date.now(), log = console.warn } = {}) {
  if (!existsSync(path)) return null;
  const data = JSON.parse(readFileSync(path, "utf8"));
  const problems = snapshotProblems(data);
  if (problems.length) throw new Error(`[videos] ${path} is not a valid ${VIDEOS_SCHEMA} snapshot:\n  ${problems.join("\n  ")}`);
  const ageDays = (now - Date.parse(data.fetchedAt)) / 86_400_000;
  if (ageDays > MAX_AGE_DAYS) {
    const line = `[videos] the snapshot was fetched ${Math.floor(ageDays)} days ago (limit ${MAX_AGE_DAYS}): the video block and the videos feed ship empty. Run npm run videos:fetch.`;
    log(process.env.GITHUB_ACTIONS ? `::warning title=Video block left out::${line}` : line);
    return null;
  }
  const onDisk = (v) => {
    if (hidden.has(v.id) || !approved.has(v.id)) return false;
    const ok = existsSync(join(publicDir, v.thumb));
    if (!ok) log(`[videos] ${v.id}: thumbnail missing at public${v.thumb}, video left out`);
    return ok;
  };
  return { schema: data.schema, fetchedAt: data.fetchedAt, long: data.long.filter(onDisk), shorts: data.shorts.filter(onDisk) };
}

/* ---------- rendering ---------- */

export const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// The desk's day, as everywhere else on the site: a video published at 01:00 UTC went up the
// evening before in Toronto.
const TZ = "America/Toronto";
export function displayDate(iso, nowIso) {
  const d = new Date(iso);
  const year = (x) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric" }).format(x);
  const sameYear = year(d) === year(new Date(nowIso));
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }) }).format(d);
}

/* One card: a plain link to YouTube holding our own still, the title and the date. With no
   JS that link is the whole behaviour. src/components/videos.ts turns an unmodified click into
   the player, built in a sibling element so the iframe never sits inside the link. */
function card(v, kind, fetchedAt) {
  const { width, height } = THUMB[kind];
  const what = kind === "shorts" ? "Still from the Short" : "Still from the video";
  return `<li class="video-card video-card--${kind}" data-video-id="${esc(v.id)}" data-video-kind="${kind}">
          <a class="video-card__link" href="${esc(v.url)}" target="_blank" rel="noopener noreferrer" data-video-play>
            <span class="video-card__media"><img src="${esc(v.thumb)}" alt="${esc(`${what}: ${v.title}`)}" width="${width}" height="${height}" loading="lazy" decoding="async" /><span class="video-card__play" aria-hidden="true"></span></span>
            <span class="video-card__body">
              <span class="video-card__title">${esc(v.title)}</span>
              <time class="video-card__date" datetime="${esc(v.published)}">${esc(displayDate(v.published, fetchedAt))}</time>
            </span>
          </a>
        </li>`;
}

function group(kind, label, items, fetchedAt) {
  if (!items.length) return "";
  return `<div class="videos__group videos__group--${kind}">
      <h3 class="videos__rubric kicker" id="videos-${kind}">${label}</h3>
      <ul class="videos__list videos__list--${kind}" aria-labelledby="videos-${kind}">
        ${items.map((v) => card(v, kind, fetchedAt)).join("\n        ")}
      </ul>
    </div>`;
}

/* renderHomeVideos(data): the whole <section>, or '' when there is nothing to show, so no empty
   block ever ships (the Wire block's rule). */
export function renderHomeVideos(data) {
  if (!data) return "";
  const long = (data.long || []).slice(0, SHOW.long);
  const shorts = (data.shorts || []).slice(0, SHOW.shorts);
  if (!long.length && !shorts.length) return "";
  return `<section class="videos" id="videos" aria-labelledby="videos-title" data-embed-origin="${EMBED_ORIGIN}">
  <div class="wrap videos__inner">
    <div class="videos__head">
      <h2 id="videos-title" class="videos__title">Video</h2>
      <a class="videos__more" href="${CHANNEL_URL}" target="_blank" rel="noopener noreferrer">More on YouTube</a>
    </div>
    ${[group("long", "Watch", long, data.fetchedAt), group("shorts", "Shorts", shorts, data.fetchedAt)].filter(Boolean).join("\n    ")}
  </div>
</section>`;
}
