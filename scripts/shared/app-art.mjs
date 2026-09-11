/* scripts/shared/app-art.mjs — the portrait the iOS app draws for a story.

   The app has exactly one art field, `image`, and draws it in a circle: 60pt on a row, 132pt on
   the Today lead, 300px on the share poster (thearchv-app Components.swift, TodayView.swift,
   PosterRenderer.swift). With no `image` it falls back to the crest. Unlike the website, the app
   has no registry of its own, so a story the desk filed without an image showed the crest even
   when the site was showing a banked face for the same headline. The desks stopped filing
   `image` after the July football-desk spec was retired, so from mid-August nearly every app
   card was a crest.

   This module is the fix, and it lives on the feed side so it needs no app build:

     1. an entry the desk filed with an image keeps that face, served from its app-grade
        rebuild in public/heads/hd/ (same file stem);
     2. an entry with no image gets the banked portrait of the first registered player named in
        its headline, then its dek. First-named, not longest-named: in the app the portrait
        stands for the story's subject, and the subject is the one the headline leads with.
        (The website's entryArt() keeps its own longest-name rule; this does not touch it.)
     3. otherwise no image, and the app shows the crest.

   Club badges are never served here. The app's rule is portraits or the crest.

   QUALITY GATE. Nothing is advertised unless the file exists and is a square WebP of at least
   600px, read from its own header. public/heads/hd/ is built only by
   scripts/heads/normalize-heads.py, which never upscales, so a failure here means a file went in
   by hand. It is logged and the entry falls back to the crest rather than shipping a soft or
   off-centre portrait. */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { PLAYERS } from "./illustrated.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PUBLIC = join(ROOT, "public");
export const MIN_SIDE = 600;

// Same fold as illustrated.mjs: diacritics out first, so "Šeško" finds "Sesko".
const norm = (s = "") =>
  String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Width and height of a WebP from its header (VP8, VP8L or VP8X), or null. */
export function webpSize(buf) {
  if (buf.length < 30 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunk = buf.toString("ascii", 12, 16);
  if (chunk === "VP8 ") return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  if (chunk === "VP8L") {
    const b = buf.readUInt32LE(21);
    return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
  return null;
}

const verdicts = new Map();
const warned = new Set();
/** True when a site-relative /heads/hd/ path is a real, square, >= 600px WebP. Cached. */
export function appGrade(rel) {
  if (!rel || !rel.startsWith("/heads/hd/")) return false;
  if (verdicts.has(rel)) return verdicts.get(rel);
  const file = join(PUBLIC, rel);
  let ok = false, why = "missing";
  if (existsSync(file)) {
    const size = webpSize(readFileSync(file));
    if (!size) why = "not a WebP";
    else if (size.w !== size.h) why = `not square (${size.w}x${size.h})`;
    else if (size.w < MIN_SIDE) why = `${size.w}px, below ${MIN_SIDE}`;
    else ok = true;
  }
  if (!ok && !warned.has(rel)) {
    warned.add(rel);
    console.warn(`[app-art] ${rel} refused (${why}); those stories keep the crest in the app`);
  }
  verdicts.set(rel, ok);
  return ok;
}

/** The first registered player named in the text (earliest position; longer name on a tie). */
export function firstPlayerIn(text) {
  const n = ` ${norm(text)} `;
  let best = null, bestAt = Infinity;
  for (const p of PLAYERS) {
    if (!p.hd) continue;
    const at = n.indexOf(` ${norm(p.name)} `);
    if (at < 0) continue;
    if (at < bestAt || (at === bestAt && p.name.length > best.name.length)) { best = p; bestAt = at; }
  }
  return best;
}

/** { image, imageAlt } for the app, or null for the crest. */
export function appArt(entry) {
  if (!entry) return null;
  if (entry.image) {
    const hd = `/heads/hd/${basename(entry.image).replace(/\.[a-z0-9]+$/i, "")}.webp`;
    return appGrade(hd) ? { image: hd, imageAlt: entry.imageAlt ?? `Illustration: ${entry.headline ?? ""}` } : null;
  }
  for (const text of [entry.headline, entry.dek]) {
    const p = firstPlayerIn(text ?? "");
    if (p && appGrade(p.hd)) return { image: p.hd, imageAlt: p.alt };
  }
  return null;
}

/** The entry as the feed should carry it: app-grade art in `image`, or no `image` at all. */
export function withAppArt(entry) {
  const { image: _image, imageAlt: _alt, ...rest } = entry;
  const art = appArt(entry);
  return art ? { ...rest, ...art } : rest;
}
