#!/usr/bin/env node
/* scripts/build-thumbs.mjs: the 128px and 320px portrait thumbs (see scripts/shared/thumbs.mjs).

   Runs in `npm run build` before `vite build`, and on its own as `npm run thumbs`. The thumbs are
   committed under public/thumbs/, so on a clean checkout this does no image work at all: it hashes
   each original and compares against scripts/data/thumbs.json. A new or replaced head (same stem,
   new art from normalize-heads.py) has a new hash, gets fresh thumbs, and the manifest row is
   rewritten, which is the diff to commit. A thumb whose original has gone is removed.

   sharp writes no EXIF, XMP or ICC by default (no withMetadata() call here), so the output carries
   pixels and nothing else. Square cover crop, same as the object-fit: cover the slots apply. */
import sharp from "sharp";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLIC, THUMB_WIDTHS, THUMB_SHELVES, thumbPath } from "./shared/thumbs.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = join(ROOT, "scripts", "data", "thumbs.json");

const before = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {};
const after = {};
let made = 0;
let kept = 0;

for (const shelf of THUMB_SHELVES) {
  const dir = join(PUBLIC, shelf);
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir).filter((f) => /\.webp$/i.test(f)).sort()) {
    const src = `/${shelf}/${name}`;
    const buf = readFileSync(join(dir, name));
    const hash = createHash("sha1").update(buf).digest("hex").slice(0, 16);
    after[src] = hash;
    const outs = THUMB_WIDTHS.map((w) => [w, join(PUBLIC, thumbPath(src, w).slice(1))]);
    if (before[src] === hash && outs.every(([, out]) => existsSync(out))) {
      kept++;
      continue;
    }
    for (const [w, out] of outs) {
      mkdirSync(dirname(out), { recursive: true });
      await sharp(buf).resize(w, w, { fit: "cover" }).webp({ quality: 80, effort: 6 }).toFile(out);
    }
    made++;
  }
}

// Thumbs whose original is gone.
let removed = 0;
for (const src of Object.keys(before)) {
  if (src in after) continue;
  for (const w of THUMB_WIDTHS) {
    const out = join(PUBLIC, thumbPath(src, w).slice(1));
    if (existsSync(out)) {
      rmSync(out);
      removed++;
    }
  }
}

const json = JSON.stringify(after, null, 2) + "\n";
if (!existsSync(MANIFEST) || readFileSync(MANIFEST, "utf8") !== json) writeFileSync(MANIFEST, json);
console.log(`[thumbs] ${made} made, ${kept} unchanged, ${removed} removed (${THUMB_WIDTHS.join("px, ")}px)`);
