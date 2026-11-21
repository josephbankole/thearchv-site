/* fetch-videos.mjs: refresh the front page's video list from YouTube's public feeds.

     node scripts/fetch-videos.mjs            (npm run videos:fetch)

   WHAT IT DOES. Reads two keyless Atom feeds for the channel (long-form and Shorts, see
   scripts/videos/lib.mjs), validates every entry, mirrors one thumbnail per video to
   public/media/videos/<id>.webp, and writes scripts/data/videos.json (archv-videos/1). The build
   never touches the network: vite.config.ts and build-feed.mjs read that snapshot.

   NO API KEY, and none may be added here. These feeds are public and CI never reads a key.

   IT NEVER FAILS A BUILD. Any network error, a feed that will not parse, or a result that looks
   wrong (an empty list, or far fewer entries than the snapshot holds) keeps the committed
   snapshot and exits 0 with a loud line. deploy.yml runs it before `npm run build`, so a YouTube
   outage costs a deploy nothing but freshness. `--strict` exits 1 instead, for running by hand.

   WHY THE THUMBNAILS ARE COPIED. The homepage CSP says img-src 'self', and the privacy policy
   says nothing is sent to YouTube until the visitor presses play. A hot-linked i.ytimg.com image
   would break both. Each run re-downloads every thumbnail, so a copy is never older than the
   last run (YouTube's developer policy asks for stored data to be refreshed within 30 days; the
   daily schedule in deploy.yml keeps it to one).

   No view counts are kept: they lag, and the policy wants any count shown to be current. */
import { writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync, unlinkSync, renameSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import {
  VIDEOS_SCHEMA, PLAYLISTS, KEEP, THUMB, THUMB_DIR, SNAPSHOT_PATH, PUBLIC_DIR,
  feedUrl, parseFeed, thumbPath, snapshotProblems, suspicious, hiddenIds,
} from "./videos/lib.mjs";

const TAG = "[fetch-videos]";
const STRICT = process.argv.includes("--strict");
const TIMEOUT_MS = 15_000;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
// A generic client name on purpose: nothing about the site or its owner goes out with a request.
const HEADERS = { "user-agent": "Mozilla/5.0 (compatible; static-site-build)", accept: "*/*" };
const OUT_DIR = join(PUBLIC_DIR, THUMB_DIR);

function keep(why) {
  console.warn(`${TAG} *** KEEPING THE COMMITTED SNAPSHOT: ${why} ***`);
  console.warn(`${TAG} *** The video block ships as it was last committed. Nothing was written. ***`);
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
  keep(`could not read the feeds (${err.message})`);
}

for (const kind of ["long", "shorts"]) {
  for (const d of parsed[kind].dropped) console.warn(`${TAG} ${kind}: dropped ${d.id || "(no id)"}: ${d.why}`);
}
// A video in both lists means the playlists no longer mean what this script assumes.
const longIds = new Set(parsed.long.items.map((v) => v.id));
if (parsed.shorts.items.some((v) => longIds.has(v.id))) keep("a video appears in both the long-form and the Shorts feed");

// Videos held off the site (scripts/data/videos-hidden.json) are dropped before anything of
// theirs is downloaded.
const hidden = hiddenIds();
for (const kind of ["long", "shorts"]) {
  parsed[kind].items = parsed[kind].items.filter((v) => {
    if (hidden.has(v.id)) console.log(`${TAG} ${kind} ${v.id}: hidden by videos-hidden.json`);
    return !hidden.has(v.id);
  });
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
const snapshot = { schema: VIDEOS_SCHEMA, fetchedAt: new Date().toISOString(), long: fresh.long, shorts: fresh.shorts };
const problems = snapshotProblems(snapshot);
if (reasons.length || problems.length) {
  discard();
  keep([...reasons, ...problems].join("; "));
}

for (const [tmp, final] of staged) renameSync(tmp, final);
writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + "\n");
// Thumbnails of videos that left the list go with them, so the folder never grows.
const wanted = new Set([...fresh.long, ...fresh.shorts].map((v) => `${v.id}.webp`));
for (const f of readdirSync(OUT_DIR)) {
  if (!wanted.has(f)) { unlinkSync(join(OUT_DIR, f)); console.log(`${TAG} removed ${THUMB_DIR}/${f}`); }
}
console.log(`${TAG} wrote ${SNAPSHOT_PATH}: ${fresh.long.length} long-form, ${fresh.shorts.length} Shorts`);
