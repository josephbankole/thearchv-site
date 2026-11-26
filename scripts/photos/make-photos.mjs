#!/usr/bin/env node
/* scripts/photos/make-photos.mjs: the photo shelf (founder ruling, 21 Nov 2026).

   "lets use free-licence one from Wikimedia Commons with credit, if an up to date photo does not
   exist, then we will create an illustration." This script turns a verified Commons original into
   the two files the site draws, and records the photo, its credit and its licence on the person's
   row in scripts/data/illustrated.json. It is NOT in `npm run build`: the originals live on the
   founder's Mac (fifa.archv/photo-sourcing-2026-11-21/originals/, kept byte for byte as downloaded,
   author and licence metadata intact), and the build reads only what this writes into the repo
   (trap 0).

     public/photos/<slug>.webp     4:5 head and shoulders, long side up to 1200px (article art)
     public/photos/sq/<slug>.webp  square, face centred, up to 640px (card circles, the lead);
                                   build-thumbs.mjs makes the 128 and 320px thumbs from this shelf

   CROPPING AND RESIZING ARE THE ONLY ALTERATIONS. No colour change, no retouch, no filter, no
   overlay. The crop box comes from a face rectangle (macOS Vision, run on the original by the
   caller and passed in as JSON lines: {file, faces: [[x, y, w, h, conf], ...]} with x/y/w/h
   normalised to the oriented image, top-left origin). The box used is written to the row as
   photo.crop in original pixels, so anyone can re-derive the file from the original.

   CC BY-SA files: the crop is an adaptation and is shared under the same licence. The About page
   credits block says so (build-about-page.mjs).

   Usage:
     node scripts/photos/make-photos.mjs --manifest <manifest-verified.json> \
       --originals <dir> --faces <faces.jsonl> [--only slug,slug] [--checked 2026-11-21] [--create]
   --create adds a photo-only row (kind "photo", photoOnly true, no illustration) for a verified
   person with no registry row (founder, 25 Nov 2026). Without it such a person is skipped.
   Rows with found !== true are skipped. A row with no original on disk or no face found is
   reported and left on its illustration. */
import sharp from "sharp";
import { creditText, NO_CREDIT } from "../shared/photo-credit.mjs";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join, dirname, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REGISTRY = join(ROOT, "scripts", "data", "illustrated.json");
const OUT = join(ROOT, "public", "photos");
const LONG = 1200;
const SQ = 640;

const arg = (k, d = null) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const manifest = JSON.parse(readFileSync(arg("manifest"), "utf8"));
const originals = arg("originals");
const checked = arg("checked", new Date().toISOString().slice(0, 10));
const only = arg("only") ? new Set(arg("only").split(",")) : null;
const create = process.argv.includes("--create");
// Registry names for photo-only rows where the manifest's display name is not what the copy says.
const NAME_FIX = { "javier-hernandez": "Javier Hernández" };
// Never wired, whatever a manifest says (26 Nov 2026): Jannik Sinner's file is a White House
// photograph whose embedded notice limits it to personal use by its subject and forbids changes,
// and its public-domain status is US-only. He keeps his illustration.
const EXCLUDE = new Set(["jannik-sinner"]);
// What each licence legally requires us to print (26 Nov 2026, founder: "only add credits that are
// legally required"), read from Commons by hand into scripts/data/photo-attribution.json: the credit
// the author asked for (else the author), the title for CC 2.0/3.0 files, any copyright notice the
// file carries. CC0 and public-domain files need no credit, so they get none.
const ATTR_FILE = join(ROOT, "scripts", "data", "photo-attribution.json");
const ATTR = existsSync(ATTR_FILE) ? JSON.parse(readFileSync(ATTR_FILE, "utf8")) : {};

const ALIASES = { "javier-hernandez": ["Chicharito"] };
const faces = new Map(
  readFileSync(arg("faces"), "utf8").split("\n").filter(Boolean).map((l) => {
    const j = JSON.parse(l);
    return [basename(j.file).replace(/\.[^.]+$/, ""), j];
  }),
);

const files = new Map(readdirSync(originals).map((f) => [f.replace(/\.[^.]+$/, ""), join(originals, f)]));
const registry = JSON.parse(readFileSync(REGISTRY, "utf8"));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const stripUtm = (u) => u.split("?")[0];
mkdirSync(join(OUT, "sq"), { recursive: true });

const done = [];
const skipped = [];
for (const r of manifest) {
  if (r.found !== true) continue;
  if (EXCLUDE.has(r.slug)) { skipped.push(`${r.slug}: excluded (see EXCLUDE)`); continue; }
  if (only && !only.has(r.slug)) continue;
  let row = registry.players.find((p) => p.slug === r.slug);
  if (!row && create) {
    // A photo-only row (founder, 25 Nov 2026: "Yes, add them"): someone we never drew. The registry
    // name must be the plain full name the desk writes (manifest names can carry a nickname), and a
    // bare mononym is never registered (CLAUDE.md: "Bare mononyms are left out on purpose").
    const name = (NAME_FIX[r.slug] ?? r.name).trim();
    if (!/\s/.test(name)) { skipped.push(`${r.slug}: "${name}" is a bare mononym, not registered`); continue; }
    row = { slug: r.slug, name, ...(ALIASES[r.slug] ? { aliases: ALIASES[r.slug] } : {}), kind: "photo", photoOnly: true };
    registry.players.push(row);
  }
  if (!row) { skipped.push(`${r.slug}: no registry row (pass --create for a photo-only row)`); continue; }
  const file = files.get(r.slug);
  if (!file) { skipped.push(`${r.slug}: original not downloaded`); continue; }
  const f = faces.get(r.slug)?.faces?.[0];
  if (!f) { skipped.push(`${r.slug}: no face found in the original`); continue; }
  if (!/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(r.filePage)) { skipped.push(`${r.slug}: file page is not on Commons`); continue; }

  const img = sharp(readFileSync(file)).rotate();
  const { width: W0, height: H0, orientation } = await sharp(file).metadata();
  const [W, H] = orientation >= 5 ? [H0, W0] : [W0, H0];
  const fx = f[0] * W, fy = f[1] * H, fw = f[2] * W, fh = f[3] * H;
  const cx = fx + fw / 2;

  // 4:5 head and shoulders: about 3.2 face widths across, the face in the upper third.
  let w = Math.min(W, fw * 3.2, H / 1.25);
  let h = w * 1.25;
  let left = clamp(cx - w / 2, 0, W - w);
  let top = clamp(fy - fh * 0.75, 0, H - h);
  const crop = { left: Math.round(left), top: Math.round(top), width: Math.round(w), height: Math.round(h) };
  crop.width = Math.min(crop.width, W - crop.left);
  crop.height = Math.min(crop.height, H - crop.top);

  // Square for the circles: about 2.4 face widths, face centred a touch high. Was 2.1 and centred
  // lower until 25 Nov 2026: the face box starts near the eyebrows, so that cut the top of the head
  // (Messi, Rooney).
  const s = Math.min(W, H, fw * 2.4);
  const sq = {
    left: Math.round(clamp(cx - s / 2, 0, W - s)),
    top: Math.round(clamp(fy + fh * 0.42 - s / 2, 0, H - s)),
    width: Math.round(s),
    height: Math.round(s),
  };
  sq.width = sq.height = Math.min(sq.width, W - sq.left, H - sq.top);

  const outMain = join(OUT, `${r.slug}.webp`);
  const outSq = join(OUT, "sq", `${r.slug}.webp`);
  // Keep the author and licence notices with every copy (CC 2.0/3.0: keep existing notices intact).
  // sharp drops the original's metadata on re-encode, so the notice is written back as EXIF.
  const a0 = ATTR[r.slug] ?? {};
  const exif = { IFD0: {
    Artist: String(a0.exifArtist || r.author).trim(),
    Copyright: `${a0.exifCopyright || r.author}. ${r.licenceName}${r.licenceUrl ? ` ${r.licenceUrl}` : ""}. Cropped from ${r.filePage}`.trim(),
  } };
  const main = await img.clone().extract(crop).resize({ height: LONG, width: Math.round(LONG / 1.25), fit: "fill", withoutEnlargement: true })
    .withExif(exif).webp({ quality: 82, effort: 6 }).toFile(outMain);
  const sqo = await img.clone().extract(sq).resize({ width: SQ, height: SQ, fit: "fill", withoutEnlargement: true })
    .withExif(exif).webp({ quality: 82, effort: 6 }).toFile(outSq);

  const year = String(r.dateTaken ?? "").slice(0, 4);
  const author = r.author.trim();
  row.kind = "photo";
  const a = ATTR[r.slug] ?? {};
  const free = NO_CREDIT(r.licenceName);
  row.licence = { name: r.licenceName, url: r.licenceUrl, author, source: r.filePage, checked };
  if (free) {
    delete row.credit;
  } else {
    // The plain-text credit; photoCreditHtml() in both readers builds the linked form from the same
    // fields: attribution linked to the file page, licence linked to its deed.
    row.licence.attribution = (a.attribution || author).trim();
    if (a.title) row.licence.title = a.title;
    if (a.copyright) row.licence.copyright = a.copyright;
    row.credit = creditText(row.licence);
  }
  row.photo = {
    src: `/photos/${r.slug}.webp`,
    width: main.width,
    height: main.height,
    square: `/photos/sq/${r.slug}.webp`,
    squareSize: sqo.width,
    alt: year ? `${row.name}, photographed ${year}` : `${row.name}, photograph`,
    taken: r.dateTaken ?? null,
    original: stripUtm(r.imageUrl),
    originalSize: [W, H],
    crop: [crop.left, crop.top, crop.width, crop.height],
    squareCrop: [sq.left, sq.top, sq.width, sq.height],
    shareAlike: /\bSA\b/.test(r.licenceName),
  };
  done.push(`${r.slug} ${main.width}x${main.height} sq ${sqo.width}`);
}
// An excluded person who already has a photo row goes back to the illustration, files and all.
for (const p of registry.players) {
  if (!EXCLUDE.has(p.slug) || p.kind !== "photo") continue;
  for (const f of [p.photo?.src, p.photo?.square]) if (f && existsSync(join(ROOT, "public", f))) unlinkSync(join(ROOT, "public", f));
  delete p.photo; delete p.credit; delete p.licence; p.kind = "illustration";
  done.push(`${p.slug} reverted to its illustration`);
}
// A photo-only row created above whose original or face was missing never got a photo: drop it,
// so the registry never holds a row with nothing to draw.
registry.players = registry.players.filter((p) => !(p.photoOnly && !p.photo));
for (const p of registry.players) if (!p.kind) p.kind = "illustration";
for (const c of registry.clubs) if (!c.kind) c.kind = "illustration";
writeFileSync(REGISTRY, JSON.stringify(registry, null, 2) + "\n");
console.log(`[photos] ${done.length} written`);
for (const d of done) console.log(`  ${d}`);
for (const s of skipped) console.log(`  SKIP ${s}`);
