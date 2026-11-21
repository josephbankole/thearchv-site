/* fetch-videos.mjs: refresh the front page's video list from YouTube's public feeds.

     node scripts/fetch-videos.mjs            (npm run videos:fetch)

   WHAT IT DOES. Reads two keyless Atom feeds for the channel (long-form and Shorts, see
   scripts/videos/lib.mjs), validates every entry, mirrors one thumbnail per video to
   public/media/videos/<id>.webp, and writes scripts/data/videos.json (archv-videos/1). The build
   never touches the network: vite.config.ts and build-feed.mjs read that snapshot.

   NO API KEY, and none may be added here. These feeds are public and CI never reads a key.

   IT NEVER FAILS A BUILD. Any network error, a feed that will not parse, or a result that looks
   wrong (an empty list, or far fewer entries than the snapshot holds) keeps a list it already
   trusts and exits 0 with a loud line, and in CI a warning on the run's summary page. deploy.yml
   runs it before `npm run build`, so a YouTube outage costs a deploy nothing but freshness.
   `--strict` exits 1 instead, for running by hand.

   WHICH LIST IS KEPT. CI commits nothing, so the committed snapshot only moves when someone
   commits it by hand, and falling back to it would roll the front page back to that day. In CI
   the fallback is therefore the list the live site is serving (thearchv.ca/feed/videos.json and
   its thumbnails), when it is valid and newer than the committed one; only then the committed
   snapshot. Either way hidden videos are taken out of the kept list and their thumbnails are
   deleted, so hiding a video works on a day YouTube does not answer. The build drops the block
   altogether once the list is older than MAX_AGE_DAYS (scripts/videos/lib.mjs).

   EVERY PUBLIC UPLOAD IS LISTED (founder, 2026-11-21), unless its id is in videos-hidden.json.

   THE ORDER (founder, same day). Each group is stored in rankVideos() order: the videos of the
   last seven days, most viewed first, then older ones, newest first. The feed gives views for the
   newest 15 of each kind.

   WHY THE THUMBNAILS ARE COPIED. The homepage CSP says img-src 'self', and the privacy policy
   says nothing is sent to YouTube until the visitor presses play. A hot-linked i.ytimg.com image
   would break both. Each run re-downloads every thumbnail, so a copy is never older than the
   last run (YouTube's developer policy asks for stored data to be refreshed within 30 days; every
   deploy runs this first, and the desks push to main most days. There is no scheduled run).

   View counts are kept in the snapshot as a sort key only and are never shown or published:
   they lag, and the policy wants any count shown to be current. */
import { writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync, unlinkSync, renameSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import {
  VIDEOS_SCHEMA, PLAYLISTS, KEEP, THUMB, THUMB_DIR, SNAPSHOT_PATH, PUBLIC_DIR,
  feedUrl, parseFeed, rankVideos, thumbPath, snapshotProblems, suspicious, hiddenIds,
} from "./videos/lib.mjs";

const TAG = "[fetch-videos]";
const STRICT = process.argv.includes("--strict");
const TIMEOUT_MS = 15_000;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
// A generic client name on purpose: nothing about the site or its owner goes out with a request.
const HEADERS = { "user-agent": "Mozilla/5.0 (compatible; static-site-build)", accept: "*/*" };
const OUT_DIR = join(PUBLIC_DIR, THUMB_DIR);

const LIVE_ORIGIN = "https://thearchv.ca";
const IN_CI = Boolean(process.env.GITHUB_ACTIONS);
const oneLine = (s) => String(s).replace(/\s*\r?\n\s*/g, " ");
// A GitHub annotation: it shows on the run's summary page, where a console line does not.
const annotate = (level, title, msg) => { if (IN_CI) console.log(`::${level} title=${title}::${oneLine(msg)}`); };

/* The list the live site is serving, written in place of the committed snapshot. True when it
   was used. Any problem (the feed is not there yet, it is not valid, it is no newer than the
   committed one, a thumbnail will not download) leaves everything as it was. */
async function useLiveList() {
  const staged = [];
  try {
    const live = JSON.parse(await get(`${LIVE_ORIGIN}/feed/videos.json`, "text"));
    const problems = snapshotProblems(live);
    if (problems.length) throw new Error(`not a valid ${VIDEOS_SCHEMA} list (${problems[0]})`);
    if (previous && !(Date.parse(live.fetchedAt) > Date.parse(previous.fetchedAt))) throw new Error("it is no newer than the committed snapshot");
    const hidden = hiddenIds();
    const list = { long: [], shorts: [] };
    mkdirSync(OUT_DIR, { recursive: true });
    for (const kind of ["long", "shorts"]) {
      for (const v of live[kind]) {
        if (hidden.has(v.id)) continue;
        const buf = await get(`${LIVE_ORIGIN}${thumbPath(v.id)}`, "buffer");
        const meta = await sharp(buf).metadata();
        if (meta.format !== "webp" || meta.width !== THUMB[kind].width || meta.height !== THUMB[kind].height) throw new Error(`${thumbPath(v.id)} is not a ${THUMB[kind].width}x${THUMB[kind].height} WebP`);
        const final = join(PUBLIC_DIR, thumbPath(v.id));
        writeFileSync(`${final}.tmp`, buf);
        staged.push([`${final}.tmp`, final]);
        list[kind].push({ id: v.id, title: v.title, published: v.published, url: v.url, thumb: thumbPath(v.id), thumbWidth: THUMB[kind].width, thumbHeight: THUMB[kind].height });
      }
    }
    if (!list.long.length && !list.shorts.length) throw new Error("nothing in it may be shown");
    for (const [tmp, final] of staged) renameSync(tmp, final);
    // Its own fetchedAt is kept, so the list's age stays honest.
    writeFileSync(SNAPSHOT_PATH, JSON.stringify({ schema: VIDEOS_SCHEMA, fetchedAt: live.fetchedAt, long: list.long, shorts: list.shorts }, null, 2) + "\n");
    const wanted = new Set([...list.long, ...list.shorts].map((v) => `${v.id}.webp`));
    for (const f of readdirSync(OUT_DIR)) if (!wanted.has(f)) unlinkSync(join(OUT_DIR, f));
    console.warn(`${TAG} *** Using the list the live site is serving (fetched ${live.fetchedAt}): ${list.long.length} long-form, ${list.shorts.length} Shorts. ***`);
    return live.fetchedAt;
  } catch (err) {
    for (const [tmp] of staged) { try { unlinkSync(tmp); } catch { /* already gone */ } }
    console.warn(`${TAG} the live site's list was not used: ${err.message}`);
    return null;
  }
}

/* A kept snapshot still obeys videos-hidden.json: hidden entries leave it and their thumbnails
   leave public/, so they are not built into dist. Never throws. */
function dropHiddenFromKept() {
  try {
    const hidden = hiddenIds();
    for (const id of hidden) {
      const file = join(PUBLIC_DIR, thumbPath(id));
      if (existsSync(file)) { unlinkSync(file); console.warn(`${TAG} removed ${thumbPath(id)}: hidden by videos-hidden.json`); }
    }
    if (!previous || !Array.isArray(previous.long) || !Array.isArray(previous.shorts)) return;
    const long = previous.long.filter((v) => !hidden.has(v?.id)), shorts = previous.shorts.filter((v) => !hidden.has(v?.id));
    if (long.length === previous.long.length && shorts.length === previous.shorts.length) return;
    writeFileSync(SNAPSHOT_PATH, JSON.stringify({ ...previous, long, shorts }, null, 2) + "\n");
    console.warn(`${TAG} took ${previous.long.length - long.length + previous.shorts.length - shorts.length} hidden video(s) out of the kept snapshot`);
  } catch (err) {
    console.warn(`${TAG} could not apply videos-hidden.json to the kept snapshot: ${err.message}`);
  }
}

async function keep(why) {
  console.warn(`${TAG} *** NOT REFRESHED: ${why} ***`);
  const live = IN_CI && !STRICT ? await useLiveList() : null;
  if (!live) {
    dropHiddenFromKept();
    console.warn(`${TAG} *** KEEPING THE COMMITTED SNAPSHOT (fetched ${previous?.fetchedAt ?? "never"}). The video block ships as it was last committed. ***`);
  }
  annotate("warning", "Video list not refreshed", `${why}. The build ships the list fetched ${live ?? previous?.fetchedAt ?? "never"} (${live ? "the live site's own list" : "the committed snapshot"}).`);
  process.exit(STRICT ? 1 : 0);
}

async function get(url, as) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "follow" });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  if (as === "text") return res.text();
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_IMAGE_BYTES) throw new Error(`${url} is ${buf.length} bytes`);
  return buf;
}

// One retry after three seconds, the same patience the dashboard's reader of this feed has.
async function getFeed(url) {
  try { return await get(url, "text"); } catch (first) {
    console.warn(`${TAG} ${first.message}; one retry in 3s`);
    await new Promise((r) => setTimeout(r, 3000));
    return get(url, "text");
  }
}

/* The best still YouTube holds for a video, as a WebP at the card's own shape.
   Long-form: the 16:9 stills first (maxresdefault, hq720), then the 4:3 ones, which carry the
   16:9 frame letterboxed and are cropped back to it by the cover fit.
   Shorts: oardefault is the upright frame itself but is undocumented, so it is used only when it
   really is portrait; otherwise the upright frame is cut from the middle of a landscape still,
   where YouTube places it. A missing still answers 404 with a small grey placeholder, hence the
   status check and the minimum size. */
async function mirrorThumb(id, kind) {
  const { width, height } = THUMB[kind];
  const names = kind === "shorts"
    ? ["oardefault", "maxresdefault", "hq720", "sddefault", "hqdefault"]
    : ["maxresdefault", "hq720", "sddefault", "hqdefault"];
  let lastError = null;
  for (const name of names) {
    try {
      const buf = await get(`https://i.ytimg.com/vi/${id}/${name}.jpg`, "buffer");
      const meta = await sharp(buf).metadata();
      if (!meta.width || !meta.height || meta.width < 320) throw new Error(`${name} is ${meta.width}x${meta.height}`);
      if (name === "oardefault" && meta.height <= meta.width) throw new Error("oardefault is not portrait");
      let img = sharp(buf);
      if (kind === "shorts" && meta.height <= meta.width) {
        // The upright 9:16 frame sits in the middle of the landscape still.
        const w = Math.min(meta.width, Math.round((meta.height * 9) / 16));
        img = img.extract({ left: Math.round((meta.width - w) / 2), top: 0, width: w, height: meta.height });
      }
      const out = await img.resize(width, height, { fit: "cover", position: "centre" }).webp({ quality: 72 }).toBuffer();
      return { buf: out, source: name };
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`no usable thumbnail for ${id}: ${lastError?.message ?? "unknown"}`);
}

const previous = existsSync(SNAPSHOT_PATH) ? JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) : null;

let parsed;
try {
  const [longXml, shortsXml] = await Promise.all([getFeed(feedUrl(PLAYLISTS.long)), getFeed(feedUrl(PLAYLISTS.shorts))]);
  parsed = { long: parseFeed(longXml, "long"), shorts: parseFeed(shortsXml, "shorts") };
} catch (err) {
  await keep(`could not read the feeds (${err.message})`);
}

for (const kind of ["long", "shorts"]) {
  for (const d of parsed[kind].dropped) console.warn(`${TAG} ${kind}: dropped ${d.id || "(no id)"}: ${d.why}`);
}
// A video in both lists means the playlists no longer mean what this script assumes.
const longIds = new Set(parsed.long.items.map((v) => v.id));
if (parsed.shorts.items.some((v) => longIds.has(v.id))) await keep("a video appears in both the long-form and the Shorts feed");

// Videos held off the site (scripts/data/videos-hidden.json) are dropped before anything of
// theirs is downloaded. Then each group takes its order: this week's most viewed, then newest.
const hidden = hiddenIds();
const fetchedAt = Date.now();
for (const kind of ["long", "shorts"]) {
  parsed[kind].items = rankVideos(parsed[kind].items.filter((v) => {
    if (hidden.has(v.id)) { console.log(`${TAG} ${kind} ${v.id}: hidden by videos-hidden.json`); return false; }
    return true;
  }), fetchedAt);
}

const fresh = { long: [], shorts: [] };
const staged = []; // [tmpPath, finalPath]
mkdirSync(OUT_DIR, { recursive: true });
for (const kind of ["long", "shorts"]) {
  for (const v of parsed[kind].items.slice(0, KEEP[kind])) {
    const final = join(PUBLIC_DIR, thumbPath(v.id));
    try {
      const { buf, source } = await mirrorThumb(v.id, kind);
      const tmp = `${final}.tmp`;
      writeFileSync(tmp, buf);
      staged.push([tmp, final]);
      console.log(`${TAG} ${kind} ${v.id}: thumbnail from ${source}, ${buf.length} bytes`);
    } catch (err) {
      // An older copy of this video's thumbnail is better than losing the video.
      if (!existsSync(final)) { console.warn(`${TAG} ${kind} ${v.id}: left out (${err.message})`); continue; }
      console.warn(`${TAG} ${kind} ${v.id}: kept the thumbnail already on disk (${err.message})`);
    }
    fresh[kind].push({ ...v, thumb: thumbPath(v.id), thumbWidth: THUMB[kind].width, thumbHeight: THUMB[kind].height });
  }
}

const discard = () => { for (const [tmp] of staged) { try { unlinkSync(tmp); } catch { /* already gone */ } } };
const reasons = suspicious(fresh, previous);
const snapshot = { schema: VIDEOS_SCHEMA, fetchedAt: new Date(fetchedAt).toISOString(), long: fresh.long, shorts: fresh.shorts };
const problems = snapshotProblems(snapshot);
if (reasons.length || problems.length) {
  discard();
  await keep([...reasons, ...problems].join("; "));
}

for (const [tmp, final] of staged) renameSync(tmp, final);
writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + "\n");
// Thumbnails of videos that left the list go with them, so the folder never grows.
const wanted = new Set([...fresh.long, ...fresh.shorts].map((v) => `${v.id}.webp`));
for (const f of readdirSync(OUT_DIR)) {
  if (!wanted.has(f)) { unlinkSync(join(OUT_DIR, f)); console.log(`${TAG} removed ${THUMB_DIR}/${f}`); }
}
console.log(`${TAG} wrote ${SNAPSHOT_PATH}: ${fresh.long.length} long-form, ${fresh.shorts.length} Shorts`);
