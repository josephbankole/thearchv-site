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
        its headline, else in its dek provided the body names him too (an actual link). First-named, not longest-named: in the app the portrait
        stands for the story's subject, and the subject is the one the headline leads with.
        The website's entryArt() uses the same first-named matcher (scripts/shared/illustrated.mjs),
        reading headline and standfirst as one text; the two differ only in the standfirst-and-
        body rule above and in this module's app-grade gate.
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
import { PLAYERS, firstPlayerIn as firstNamed, playerNamed, aliasBlocked } from "./illustrated.mjs";

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

// Portraits taken off the app on purpose (heads-hd.json `withdrawn`, audit gap4-1): refused even
// while the file is still on disk, so a desk entry that filed one by its stem gets the crest.
export const WITHDRAWN = new Set(
  (JSON.parse(readFileSync(join(ROOT, "scripts", "data", "heads-hd.json"), "utf8")).withdrawn ?? []).map((e) => e.out)
);

const verdicts = new Map();
const warned = new Set();
/** True when a site-relative /heads/hd/ path is a real, square, >= 600px WebP and not withdrawn. Cached. */
export function appGrade(rel) {
  if (!rel || !rel.startsWith("/heads/hd/")) return false;
  if (verdicts.has(rel)) return verdicts.get(rel);
  const file = join(PUBLIC, rel);
  let ok = false, why = "missing";
  if (WITHDRAWN.has(basename(rel).replace(/\.webp$/i, ""))) why = "withdrawn in heads-hd.json";
  else if (existsSync(file)) {
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

/** The first registered player with an app-grade portrait named in the text (earliest position;
    longer name on a tie; aliases count). One matcher with the website: scripts/shared/illustrated.mjs. */
export function firstPlayerIn(text, context = text) {
  return firstNamed(text, PLAYERS.filter((p) => p.hd), context);
}

/** True when the text names the player: full name or alias, or surname where the surname is
    distinctive. The surname alone does not count in a story that names someone who shares it
    (the row's aliasUnless), the same block the aliases obey. */
function namedIn(text, player, context = text) {
  if (playerNamed(text, player, context)) return true;
  if (aliasBlocked(player, context)) return false;
  const n = ` ${norm(text)} `;
  const sur = norm(player.name).split(" ").pop();
  return sur.length >= 4 && n.includes(` ${sur} `);
}

/** { image, imageAlt } for the app, or null for the crest. */
export function appArt(entry) {
  if (!entry) return null;
  if (entry.image) {
    const hd = `/heads/hd/${basename(entry.image).replace(/\.[a-z0-9]+$/i, "")}.webp`;
    return appGrade(hd) ? { image: hd, imageAlt: entry.imageAlt ?? `Illustration: ${entry.headline ?? ""}` } : null;
  }
  const story = `${entry.headline ?? ""} ${entry.dek ?? ""} ${entry.body ?? ""}`;
  const lead = firstPlayerIn(entry.headline ?? "", story);
  if (lead && appGrade(lead.hd)) return { image: lead.hd, imageAlt: lead.alt };
  // A player named only in the dek stands in for the story only when there is an actual link:
  // the body names him too (founder, 2026-09-11: "a secondary name winning is fine if there is
  // an actual link"). A one-line passing mention in the standfirst does not earn the portrait.
  const second = firstPlayerIn(entry.dek ?? "", story);
  if (second && appGrade(second.hd) && namedIn(entry.body, second, story)) return { image: second.hd, imageAlt: second.alt };
  return null;
}

/** The entry as the feed should carry it: app-grade art in `image`, or no `image` at all. */
export function withAppArt(entry) {
  const { image: _image, imageAlt: _alt, ...rest } = entry;
  const art = appArt(entry);
  return art ? { ...rest, ...art, ...appPhoto(art.image) } : rest;
}

/* ---------- the photo fields (founder ruling, 21 Nov 2026; additive, all optional) ----------
   When the portrait in `image` belongs to a registry row that carries a free-licence Wikimedia
   Commons photograph, the entry also gets:

     photo            site-relative path of the 4:5 photo (/photos/<slug>.webp); prefix the site
     photoSquare      site-relative path of the square crop (/photos/sq/<slug>.webp)
     photoAlt         "<Name>, photographed <year>"
     photoCredit      the credit line to print beside it, verbatim
     photoLicence     the licence name (CC BY-SA 4.0, CC0, ...)
     photoLicenceUrl  the licence deed
     photoSource      the Commons file page

   All strings, so a strict Codable decoder that does not know them ignores them and one that
   does reads them as optional Strings. `image` is untouched and stays the illustration: the app
   draws it in its share poster, which leaves the app, and a photo never goes there. An app that
   shows `photo` must show `photoCredit` with it when it is not empty. */
export function appPhoto(image) {
  const p = PLAYERS.find((r) => r.kind === "photo" && r.photo && r.hd === image);
  if (!p) return {};
  return {
    photo: p.photo.src,
    photoSquare: p.photo.square,
    photoAlt: p.photo.alt,
    // "" for a CC0 photo, whose licence asks for no credit (26 Nov 2026); the key stays so the
    // seven fields always come as a set.
    photoCredit: p.credit ?? "",
    photoLicence: p.licence.name,
    photoLicenceUrl: p.licence.url,
    photoSource: p.licence.source,
  };
}
