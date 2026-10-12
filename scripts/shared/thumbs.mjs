/* scripts/shared/thumbs.mjs: small copies of the portraits, for the places that draw them small.

   The lane, sport and author pages draw a portrait in a 64px circle (cardArt() in page-shell.mjs)
   and /legends/ does the same. The files behind them are the app-grade 600px rebuilds in
   public/heads/hd/ and the 1024px Legends art in public/legends/, so a sport hub with fourteen
   faces moved close to 900 KB to paint fourteen thumbnails (site review, 2026-10-12).

   scripts/build-thumbs.mjs writes a 128px and a 320px WebP of every image on those two shelves to
   public/thumbs/<width>/<original path>, and the <img> gets srcset + sizes: 128 covers a 64px slot
   up to 2x, 320 covers 3x. The originals stay where they are for the large uses (the iOS feed, the
   share cards, the article art).

   A missing thumb is never a broken image. thumbImgAttrs() checks the files exist and hands back
   the original src alone when they do not, so a head filed by hand without a build-thumbs run
   still shows, just heavier. Nothing here reads outside the repo. */
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PUBLIC = join(ROOT, "public");
export const THUMB_WIDTHS = [128, 320];
export const THUMB_SHELVES = ["heads/hd", "legends"];

/** Site-relative path of the `w`px thumb of a site-relative image path. */
export const thumbPath = (src, w) => `/thumbs/${w}${src}`;

/** True when `src` is a WebP on one of the shelves build-thumbs.mjs covers. */
export const isThumbable = (src) =>
  typeof src === "string" && /\.webp$/i.test(src) && THUMB_SHELVES.some((s) => src.startsWith(`/${s}/`));

const present = new Map();
function hasThumbs(src) {
  if (!present.has(src)) {
    present.set(src, THUMB_WIDTHS.every((w) => existsSync(join(PUBLIC, thumbPath(src, w)))));
  }
  return present.get(src);
}

/**
 * src, srcset and sizes for an <img> drawn `slot` CSS pixels square. srcset and sizes are null
 * when the image has no thumbs, and src is then the original, unchanged.
 */
export function thumbImgAttrs(src, slot) {
  if (!isThumbable(src) || !hasThumbs(src)) return { src, srcset: null, sizes: null };
  const fallback = THUMB_WIDTHS.find((w) => w >= slot * 2) ?? THUMB_WIDTHS[THUMB_WIDTHS.length - 1];
  return {
    src: thumbPath(src, fallback),
    srcset: THUMB_WIDTHS.map((w) => `${thumbPath(src, w)} ${w}w`).join(", "),
    sizes: `${slot}px`,
  };
}

const attr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The same, written out as ` src="…" srcset="…" sizes="…"` (leading space) for a template. */
export function thumbSrcAttrs(src, slot) {
  const t = thumbImgAttrs(src, slot);
  return ` src="${attr(t.src)}"` + (t.srcset ? ` srcset="${attr(t.srcset)}" sizes="${t.sizes}"` : "");
}
