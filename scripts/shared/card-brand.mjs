/* scripts/shared/card-brand.mjs — the white system, for the images.

   Every share card the build renders (the per-article OG pair in build-article-pages.mjs, the
   player-duel card in build-duel-pages.mjs, the site-wide /og.jpg in make-og.mjs) used to be
   navy, cream and gold, drawn from three separate copies of the same hex codes. The site flipped
   to a white ground in phase 2A and the cards did not, so a shared link previewed as a different
   publication from the page it opened.

   This is the one place the card palette and the card fonts live now. The values MIRROR the
   :root block in pageStyles() (scripts/shared/page-shell.mjs), src/style.css and
   public/content.css; none of those files import each other, so a colour change is four edits and
   this comment is the map. Contrast on the two that carry words: ink on white is 15.54:1, accent
   ink on white is 5.13:1.

   Fonts are static TTF instances committed at scripts/fonts/. satori does not take variable fonts
   well and cannot read woff2 at all, which is why Anton-Regular.ttf sits there as a TTF
   decompressed from the very woff2 the site itself serves — same version, same outlines, so a
   headline on a card is the headline on the page.

   NOTE, since the render pipeline moved in here (see the bottom of the file): this module now
   pulls satori, resvg and sharp. That is fine for the four card generators, which all had them
   already, and it is the reason scripts/shared/infogram.mjs still carries its own copies of the
   `div`/`text` helpers rather than importing these. That module is imported by build-feed.mjs and
   states its own rule about staying free of the render stack; importing from here would break it. */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";

const FONTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "fonts");

export const CARD = {
  bg: "#FFFFFF",
  bgSunken: "#F4F2F3",
  ink: "#1E223D",
  inkSoft: "#4A4F73",
  inkMuted: "#5F6485",
  accentFill: "#F54F1B",
  accentInk: "#C93A0F",
  rule: "#DED9DB",
  ruleSoft: "#EDEAEB",
};

// The soft lift under the masthead, as the page draws it: a wash of the sunken grey off the top
// edge, gone by two thirds down. Same gesture as body's background-image in pageStyles().
export const CARD_GROUND = `radial-gradient(at 50% -30%, ${CARD.bgSunken} 0%, ${CARD.bg} 62%)`;

export const CARD_FONTS = [
  { name: "Anton", data: readFileSync(join(FONTS_DIR, "Anton-Regular.ttf")), weight: 400, style: "normal" },
  { name: "Fraunces", data: readFileSync(join(FONTS_DIR, "Fraunces-SemiBold.ttf")), weight: 600, style: "normal" },
  { name: "Inter Tight", data: readFileSync(join(FONTS_DIR, "InterTight-Regular.ttf")), weight: 400, style: "normal" },
  { name: "Inter Tight", data: readFileSync(join(FONTS_DIR, "InterTight-SemiBold.ttf")), weight: 600, style: "normal" },
];

/* ---------- satori tree helpers ----------
   satori takes React-element-shaped plain objects. These two keep the card code readable without
   pulling JSX or a transform into the build. */
export const div = (style, children) => ({ type: "div", props: { style, children } });
export const text = (style, value) => ({ type: "div", props: { style, children: String(value) } });

/** The accent hairline, as a card-width bar. The page draws it 3px under the masthead; a 1200px
    card needs more weight to read as the same mark at share-preview size. */
export const accentRule = (width, height = 10) =>
  div({ display: "flex", width, height, backgroundColor: CARD.accentFill }, []);

/** THE ARCHV. — the wordmark as the masthead sets it: Anton throughout, "THE" in the accent ink
    and letterspaced, the full stop in the bright accent. */
export function wordmark(size = 34) {
  return div({ display: "flex", alignItems: "baseline" }, [
    text({ fontFamily: "Anton", fontSize: Math.round(size * 0.62), letterSpacing: size * 0.14, color: CARD.accentInk, marginRight: Math.round(size * 0.22) }, "THE"),
    text({ fontFamily: "Anton", fontSize: size, letterSpacing: size * 0.01, color: CARD.ink }, "ARCHV"),
    text({ fontFamily: "Anton", fontSize: size, color: CARD.accentFill }, "."),
  ]);
}

/* ---------- the render pipeline ----------
   Every card in the build is satori to SVG, then resvg to PNG, at the tree's own width. Four
   generators each wrote that pair out by hand (build-article-pages.mjs, build-duel-pages.mjs,
   make-og.mjs, build-infograms.mjs), along with four copies of the sharp call that turns the
   240px brand webp heads into something the SVG stack can read. They are here now.

   renderCard IS DELIBERATELY PALETTE-AGNOSTIC. It rasterises the tree it is handed and nothing
   more: no ground, no colours, no wordmark applied on the way through. The infogram story cards
   are a founder-approved NAVY poster format and are not on the white system, so folding CARD or
   CARD_GROUND into this function would either break them or force them off the shared path.
   Same reason `fonts` is an argument: the infograms carry no Anton and pass their own set.

   ERROR POLICY LIVES AT THE CALL SITE, NOT HERE. CLAUDE.md is explicit that a card failure logs
   and that page falls back to the static /og.jpg, and that it never fails the build. Both
   functions below throw on a real failure so each generator's own try/catch keeps deciding what
   that means. artPng returns null only for the one non-failure: no art to draw. */

/** satori -> resvg -> PNG bytes. `width` doubles as the raster width, which is what every caller
    wanted: the cards are drawn at their final pixel size, never scaled. */
export async function renderCard(tree, { width, height, fonts = CARD_FONTS }) {
  const svg = await satori(tree, { width, height, fonts });
  return new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng();
}

/** A banked head or badge as PNG bytes, ready to be inlined as a data URI. satori and resvg
    cannot read webp and the head bank is 240px webp, so sharp converts on the way in — sharp
    reads webp perfectly well, it is only the SVG stack that does not.

    `size` is the square cover crop. `flatten` composites the alpha over white, which the
    white-system cards want (a transparent head inside a white disc) and the navy infograms do
    not. Returns null when there is nothing to draw: no path, or the file is not on disk. Note
    that the resize takes no `background`: under `fit: "cover"` there is never any padding to
    fill, so the option two of these callers passed was doing nothing (verified byte-identical). */
export async function artPng(path, { size = 600, flatten = true } = {}) {
  if (!path || !existsSync(path)) return null;
  const pipeline = sharp(path).resize(size, size, { fit: "cover" });
  return (flatten ? pipeline.flatten({ background: { r: 255, g: 255, b: 255 } }) : pipeline)
    .png()
    .toBuffer();
}
