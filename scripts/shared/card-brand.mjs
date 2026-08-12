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
   headline on a card is the headline on the page. */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
