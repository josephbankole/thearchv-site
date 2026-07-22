/* ping-indexnow.mjs: submits the site's URLs to IndexNow, which is how Bing (and Yandex, Seznam,
   Naver) learn about new and changed pages within minutes instead of waiting for a crawl. MSN
   surfaces content from Bing's index, so faster Bing discovery is the on-ramp to MSN.

   Reads dist/sitemap.xml (so it must run AFTER the build), keeps only URLs on thearchv.ca, sorts
   them newest first by <lastmod>, and POSTs the list to https://api.indexnow.org/IndexNow. The
   api.indexnow.org endpoint fans the submission out to every participating engine, so one call
   covers all of them.

   Ownership is proved by the key file in public/, named <key>.txt and containing exactly that key.
   Vite copies public/ into dist/, so the file ships at https://thearchv.ca/<key>.txt and IndexNow
   fetches it to verify the submission. There is nothing to configure: the script finds the key file
   itself and refuses to run if the filename and the contents disagree.

   USAGE (run from the repo root, after `npm run build`):

     node scripts/ping-indexnow.mjs              submit every URL in the sitemap
     node scripts/ping-indexnow.mjs 20           submit only the 20 newest URLs (by <lastmod>)
     node scripts/ping-indexnow.mjs 20 --dry-run print what would be sent, send nothing
     node scripts/ping-indexnow.mjs --help       usage

   Day to day, prefer the bounded form. IndexNow is for telling an engine what changed, and a daily
   deploy changes a handful of pages, not the whole archive. Roughly: `node scripts/ping-indexnow.mjs 25`
   after a normal deploy, and the unbounded form only after a large structural change.

   Environment overrides, all optional:
     INDEXNOW_KEY   use this key instead of discovering the key file (the key file must still exist
                    and be reachable at the public URL, or IndexNow will reject the submission)
     SITE_ORIGIN    submit for a different origin, defaults to https://thearchv.ca
     SITEMAP_PATH   read a different sitemap file, defaults to dist/sitemap.xml. Useful because the
                    daily desk engine commits its data straight to main, so a local build's sitemap
                    can lag what is actually published: curl the live
                    https://thearchv.ca/sitemap.xml to a file and point this at it to submit
                    exactly what is live.

   EXIT CODES: 0 on success, and also on a 5xx from IndexNow (their outage is not our build's
   failure, the next deploy will resubmit). Non-zero on a network failure, on any 4xx (bad key,
   host mismatch, rate limit), and on a local misconfiguration such as a missing dist/sitemap.xml
   or a missing key file, since in those cases nothing was submitted and a silent success would
   hide it.

   Not wired into package.json on purpose: submission is a deploy-time action, not a build step.
   Dependency-free, matching the other scripts/ generators. Needs Node 18+ for global fetch. */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = join(ROOT, "public");
const SITEMAP = process.env.SITEMAP_PATH || join(ROOT, "dist", "sitemap.xml");
const SITE = (process.env.SITE_ORIGIN || "https://thearchv.ca").replace(/\/+$/, "");
const HOST = new URL(SITE).host;
const ENDPOINT = "https://api.indexnow.org/IndexNow";
const MAX_URLS = 10000; // IndexNow's per-request limit
const TIMEOUT_MS = 30000;
const TAG = "[ping-indexnow]";

/* ---------- arguments ---------- */
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: node scripts/ping-indexnow.mjs [N] [--dry-run]

  N          submit only the N newest URLs from dist/sitemap.xml (default: all, capped at ${MAX_URLS})
  --dry-run  print the submission without sending it`);
  process.exit(0);
}
const dryRun = args.includes("--dry-run");
const positional = args.filter((a) => !a.startsWith("-"));
if (positional.length > 1) {
  console.error(`${TAG} FAIL: expected at most one count argument, got: ${positional.join(", ")}`);
  process.exit(1);
}
let limit = Infinity;
if (positional.length === 1) {
  const n = Number(positional[0]);
  if (!Number.isInteger(n) || n < 1) {
    console.error(`${TAG} FAIL: the count argument must be a positive whole number, got "${positional[0]}".`);
    process.exit(1);
  }
  limit = n;
}

/* ---------- the key, from the key file in public/ ---------- */
const KEY_RE = /^([0-9a-f]{32})\.txt$/;
let keyFiles;
try {
  keyFiles = readdirSync(PUBLIC_DIR).filter((f) => KEY_RE.test(f));
} catch (err) {
  console.error(`${TAG} FAIL: cannot read ${PUBLIC_DIR}: ${err.message}`);
  process.exit(1);
}
if (keyFiles.length === 0) {
  console.error(`${TAG} FAIL: no IndexNow key file in public/. Expected one file named <32-char lowercase hex>.txt whose whole content is that same key.`);
  process.exit(1);
}
if (keyFiles.length > 1) {
  console.error(`${TAG} FAIL: found ${keyFiles.length} key files in public/ (${keyFiles.join(", ")}). Keep exactly one, otherwise the key used here and the key IndexNow fetches can drift apart.`);
  process.exit(1);
}
const keyFile = keyFiles[0];
const keyFromName = keyFile.match(KEY_RE)[1];
const keyFileBody = readFileSync(join(PUBLIC_DIR, keyFile), "utf8").trim();
if (keyFileBody !== keyFromName) {
  console.error(`${TAG} FAIL: public/${keyFile} does not contain its own key. IndexNow fetches that file and compares, so this submission would be rejected. Content must be exactly: ${keyFromName}`);
  process.exit(1);
}
const key = process.env.INDEXNOW_KEY || keyFromName;
const keyLocation = `${SITE}/${keyFile}`;
if (process.env.INDEXNOW_KEY && process.env.INDEXNOW_KEY !== keyFromName) {
  console.warn(`${TAG} note: INDEXNOW_KEY overrides the key file, but keyLocation still points at ${keyLocation}. IndexNow will reject the submission unless that URL serves the overriding key.`);
}

/* ---------- the URLs, from dist/sitemap.xml ---------- */
if (!existsSync(SITEMAP)) {
  console.error(`${TAG} FAIL: ${SITEMAP} not found. Run the build first (npm run build), then submit.`);
  process.exit(1);
}
const xml = readFileSync(SITEMAP, "utf8");
const entries = [];
for (const block of xml.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/g)) {
  const loc = block[1].match(/<loc>\s*([\s\S]*?)\s*<\/loc>/);
  if (!loc) continue;
  const lastmod = block[1].match(/<lastmod>\s*([\s\S]*?)\s*<\/lastmod>/);
  entries.push({
    loc: decodeXml(loc[1]),
    // undated entries sort last, behind anything with a date
    lastmod: lastmod ? Date.parse(lastmod[1]) : NaN,
    pos: entries.length,
  });
}
if (entries.length === 0) {
  console.error(`${TAG} FAIL: no <url><loc> entries in ${SITEMAP}. The sitemap is empty or malformed.`);
  process.exit(1);
}

const offHost = [];
const seen = new Set();
const onHost = [];
for (const e of entries) {
  let parsed;
  try {
    parsed = new URL(e.loc);
  } catch {
    offHost.push(e.loc);
    continue;
  }
  // IndexNow rejects the whole batch (422) if any URL sits on another host
  if (parsed.host !== HOST) {
    offHost.push(e.loc);
    continue;
  }
  if (seen.has(parsed.href)) continue;
  seen.add(parsed.href);
  onHost.push({ ...e, loc: parsed.href });
}
if (offHost.length > 0) {
  console.warn(`${TAG} skipped ${offHost.length} URL(s) not on ${HOST}: ${offHost.slice(0, 5).join(", ")}${offHost.length > 5 ? ", ..." : ""}`);
}
if (onHost.length === 0) {
  console.error(`${TAG} FAIL: the sitemap contains no URLs on ${HOST}.`);
  process.exit(1);
}

/* Newest first by <lastmod>. Ties are broken by sitemap position, latest first: the generators
   append as they run and the day's article pages go in last (build-article-pages.mjs is last in
   the build chain), while the static routes and the glossary are stamped with the build date and
   sit earlier in the file. Without that tie-break a small N would spend itself on pages that only
   look new because the build restamped them. Both are approximations: with 20-odd pages sharing a
   build-stamped date, run --dry-run first if the exact selection matters. */
const sorted = [...onHost].sort((a, b) => {
  const aUndated = Number.isNaN(a.lastmod);
  const bUndated = Number.isNaN(b.lastmod);
  if (aUndated && bUndated) return b.pos - a.pos;
  if (aUndated) return 1;
  if (bUndated) return -1;
  if (b.lastmod !== a.lastmod) return b.lastmod - a.lastmod;
  return b.pos - a.pos;
});

const selected = sorted.slice(0, Math.min(limit, MAX_URLS));
if (sorted.length > selected.length) {
  const reason = limit < sorted.length ? `newest ${selected.length} of ${sorted.length}` : `capped at IndexNow's limit of ${MAX_URLS}, ${sorted.length} available`;
  console.log(`${TAG} ${reason}.`);
}
const urlList = selected.map((e) => e.loc);

/* ---------- submit ---------- */
const payload = { host: HOST, key, keyLocation, urlList };

console.log(`${TAG} endpoint     ${ENDPOINT}`);
console.log(`${TAG} host         ${HOST}`);
console.log(`${TAG} keyLocation  ${keyLocation}`);
console.log(`${TAG} submitting   ${urlList.length} URL(s)${dryRun ? " (dry run, nothing sent)" : ""}`);
const shown = urlList.slice(0, 25);
for (const u of shown) console.log(`  ${u}`);
if (urlList.length > shown.length) console.log(`  ... and ${urlList.length - shown.length} more`);

if (dryRun) {
  console.log(`${TAG} dry run complete, no request made.`);
} else {
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    console.error(`${TAG} FAIL: request to ${ENDPOINT} failed: ${err.message}`);
    process.exit(1);
  }

  const body = await res.text().catch(() => "");
  const detail = body.trim() ? ` ${body.trim().slice(0, 300)}` : "";

  if (res.status >= 400 && res.status < 500) {
    console.error(`${TAG} FAIL: ${res.status} ${res.statusText}.${detail}`);
    console.error(`${TAG} 400 is a malformed request, 403 an invalid key (check ${keyLocation} is live and serves ${key}), 422 a host or key mismatch against the submitted URLs, 429 too many submissions.`);
    process.exit(1);
  } else if (res.status >= 500) {
    // their side, not ours: the next deploy resubmits
    console.warn(`${TAG} IndexNow returned ${res.status} ${res.statusText}.${detail} Treating as transient, nothing to fix here.`);
  } else {
    console.log(`${TAG} OK: ${res.status} ${res.statusText}.${detail}`);
    console.log(`${TAG} 200 means accepted, 202 means accepted with the key still to be validated (IndexNow will fetch ${keyLocation}).`);
  }
}

/* ---------- helpers ---------- */
function decodeXml(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
