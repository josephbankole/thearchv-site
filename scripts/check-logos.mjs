/* check-logos.mjs: the build gate for third-party logos (founder ruling, 21 Nov 2026). Runs at the
   end of `npm run build`, on dist.

   Fails the build when anything under /logos/ (the self-hosted, licensed logo files) is referenced:
   - from the poster pages (dist/posters/), the shop (dist/shop/), any app feed (dist/feed/), the RSS
     and news feeds, any sitemap or the search index, whatever the switch says;
   - from an og:image or twitter:image meta tag on any page (share cards never carry a logo);
   - from ANY page or file at all while THIRD_PARTY_LOGOS in scripts/shared/logos.mjs is false,
     which is what proves the switch really takes every logo off.
   It also checks that each logo file in public/logos/ still matches the sha256 recorded in
   scripts/data/logos.json: the terms allow resizing only, so the file must stay as downloaded.

   `checkDist(dir, { enabled })` is exported for scripts/test/logos.test.mjs. */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname, extname } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { THIRD_PARTY_LOGOS, LOGO_DIR } from "./shared/logos.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEXT = new Set([".html", ".json", ".xml", ".txt", ".js", ".css", ".svg", ".webmanifest"]);
// Places a logo may never be referenced from, switch on or off.
const NEVER = [/^posters\//, /^shop\//, /^feed\//, /^feed\.xml$/, /^rss/, /sitemap[^/]*\.xml$/, /^search-index\.json$/, /^news-sitemap/];
const SHARE_META = /<meta\b[^>]*(?:property|name)="(?:og:image|twitter:image)[^"]*"[^>]*>/gi;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

export function checkDist(dist, { enabled = THIRD_PARTY_LOGOS } = {}) {
  const errors = [];
  let refs = 0;
  for (const file of walk(dist)) {
    const rel = relative(dist, file).split("\\").join("/");
    if (rel.startsWith("logos/")) continue;
    if (!TEXT.has(extname(file).toLowerCase())) continue;
    const text = readFileSync(file, "utf8");
    if (!text.includes(LOGO_DIR)) continue;
    refs++;
    if (!enabled) { errors.push(`${rel}: references ${LOGO_DIR} while THIRD_PARTY_LOGOS is off`); continue; }
    if (NEVER.some((re) => re.test(rel))) errors.push(`${rel}: a logo may never be referenced here (posters, shop, feeds, sitemaps, search)`);
    for (const m of text.matchAll(SHARE_META)) if (m[0].includes(LOGO_DIR)) errors.push(`${rel}: logo in a share-card meta tag`);
  }
  return { errors, refs };
}

export function checkFiles(root = ROOT) {
  const errors = [];
  const reg = JSON.parse(readFileSync(join(root, "scripts/data/logos.json"), "utf8"));
  for (const l of reg.logos) {
    const p = join(root, l.file);
    if (!existsSync(p)) { errors.push(`${l.file}: missing`); continue; }
    const sha = createHash("sha256").update(readFileSync(p)).digest("hex");
    if (sha !== l.fileSha256) errors.push(`${l.file}: changed since download (sha256 ${sha}); the terms allow resizing only`);
  }
  return errors;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dist = join(ROOT, "dist");
  const { errors, refs } = checkDist(dist);
  errors.push(...checkFiles());
  if (errors.length) {
    console.error(`check-logos: ${errors.length} problem(s)`);
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }
  console.log(`check-logos: OK (switch ${THIRD_PARTY_LOGOS ? "on" : "off"}, ${refs} file(s) reference ${LOGO_DIR}, none in posters, shop, feeds or share cards)`);
}
