/* check-logos.mjs: the build gate for third-party logos (founder ruling, 21 Nov 2026). Runs at the
   end of `npm run build`, on dist.

   Fails the build when anything under /logos/ (the self-hosted, licensed logo files) is referenced:
   - from the poster pages (dist/posters/), the shop (dist/shop/), any app feed (dist/feed/), the RSS
     and news feeds, any sitemap or the search index, whatever the switch says;
   - from an og:image or twitter:image meta tag on any page (share cards never carry a logo);
   - from ANY page or file at all while THIRD_PARTY_LOGOS in scripts/shared/logos.mjs is false,
     which is what proves the switch really takes every logo off.
   It also checks that each logo file in public/logos/ still matches the sha256 recorded in
   scripts/data/logos.json, and each club crest in public/logos/crests/ the sha256 in
   scripts/data/crests.json (Wikimedia Commons files, D-2026-11-21b, with file page, author and
   licence recorded; never NC or ND, never an en.wikipedia upload): resize only, the file stays as
   downloaded. The sport icons (dist/sport-icons/) and the app pages never reference a logo.

   `checkDist(dir, { enabled })` is exported for scripts/test/logos.test.mjs. */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname, extname } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { THIRD_PARTY_LOGOS, LOGO_DIR } from "./shared/logos.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEXT = new Set([".html", ".json", ".xml", ".txt", ".js", ".css", ".svg", ".webmanifest"]);
// Places a logo may never be referenced from, switch on or off.
const NEVER = [/^posters\//, /^shop\//, /^feed\//, /^sport-icons\//, /^app\//, /^feed\.xml$/, /^rss/, /sitemap[^/]*\.xml$/, /^search-index\.json$/, /^news-sitemap/];
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
  const crests = JSON.parse(readFileSync(join(root, "scripts/data/crests.json"), "utf8"));
  if (crests.schema !== "archv-crests/1") errors.push("scripts/data/crests.json: schema is not archv-crests/1");
  for (const c of crests.crests) {
    const p = join(root, "public/logos/crests", c.file || "");
    if (!c.file || !existsSync(p)) { errors.push(`crest ${c.slug}: file missing`); continue; }
    const sha = createHash("sha256").update(readFileSync(p)).digest("hex");
    if (sha !== c.fileSha256) errors.push(`crest ${c.slug}: changed since download (sha256 ${sha})`);
    if (!/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(c.filePage || "")) errors.push(`crest ${c.slug}: file page is not on Wikimedia Commons`);
    if (!/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\//.test(c.imageUrl || "")) errors.push(`crest ${c.slug}: image is not a Commons upload`);
    if (!c.licenceName || !c.licenceTag || !c.author) errors.push(`crest ${c.slug}: licence name, tag and author must be recorded`);
    if (/\b(NC|ND)\b|non-?commercial|no-?deriv/i.test(`${c.licenceName} ${c.licenceTag}`)) errors.push(`crest ${c.slug}: NC or ND licence`);
    if (!Array.isArray(c.names) || !c.names.length) errors.push(`crest ${c.slug}: no names to match`);
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
