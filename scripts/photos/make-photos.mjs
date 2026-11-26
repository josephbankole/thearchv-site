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
       --originals <dir> --faces <faces.jsonl> [--only slug,slug] [--checked 2026-11-21]
   Rows with found !== true are skipped. A row with no original on disk or no face found is
   reported and left on its illustration. */
import sharp from "sharp";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
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
  if (only && !only.has(r.slug)) continue;
  const row = registry.players.find((p) => p.slug === r.slug);
  if (!row) { skipped.push(`${r.slug}: no registry row`); continue; }
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
  const main = await img.clone().extract(crop).resize({ height: LONG, width: Math.round(LONG / 1.25), fit: "fill", withoutEnlargement: true })
    .webp({ quality: 82, effort: 6 }).toFile(outMain);
  const sqo = await img.clone().extract(sq).resize({ width: SQ, height: SQ, fit: "fill", withoutEnlargement: true })
    .webp({ quality: 82, effort: 6 }).toFile(outSq);

  const year = String(r.dateTaken ?? "").slice(0, 4);
  const author = r.author.trim();
  row.kind = "photo";
  row.credit = `Photograph: ${author} / Wikimedia Commons / ${r.licenceName}`;
  row.licence = { name: r.licenceName, url: r.licenceUrl, author, source: r.filePage, checked };
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
for (const p of registry.players) if (!p.kind) p.kind = "illustration";
for (const c of registry.clubs) if (!c.kind) c.kind = "illustration";
writeFileSync(REGISTRY, JSON.stringify(registry, null, 2) + "\n");
console.log(`[photos] ${done.length} written`);
for (const d of done) console.log(`  ${d}`);
for (const s of skipped) console.log(`  SKIP ${s}`);
