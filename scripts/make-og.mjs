/* scripts/make-og.mjs — the site-wide 1200x630 share card, public/og.jpg.

   This is the fallback og:image for every page that has no card of its own: the front page, the
   three lane fronts, the sport sections, /reads/, the glossary, standards, the author page, the
   daily archive game, the hand-built pages under public/, and any article whose own card failed
   to render. One image, seen far more often than any single article card.

   REWRITTEN, phase 2B, for two reasons.

   The card was navy, cream and gold on a site that has been white since phase 2A, so a shared
   link previewed as a different publication from the one it opened. It is now the same furniture
   as the per-article cards (scripts/shared/card-brand.mjs): white ground, the accent hairline
   across the top, Anton for the statement, the wordmark as the masthead draws it.

   And it read a JPEG from ../../POSTERS/FINAL/, two directories above the repo root. Actions
   checks out this repo alone, so that path only ever resolved on one laptop — the same class of
   break as trap 0 in CLAUDE.md. Nothing outside this repo is read now, and nothing is composited
   at all: the card is type on a ground, which is also why it holds at the thumbnail size a feed
   actually shows it in.

   The brand crest is deliberately NOT on it. The crest is still the navy, gold and green mark
   from before the flip, and it carries a football, so it would both reimport the old palette and
   say football on a card that fronts five sports.

   Not part of `npm run build`: the output is a committed asset in public/, so this runs by hand
   (`npm run og`) when the card itself changes. */
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { CARD, CARD_GROUND, CARD_FONTS, div, text, accentRule, wordmark } from "./shared/card-brand.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "og.jpg");

const W = 1200;
const H = 630;

const tree = div({ width: W, height: H, display: "flex", flexDirection: "column", backgroundColor: CARD.bg, backgroundImage: CARD_GROUND }, [
  accentRule(W),
  div({ display: "flex", flexDirection: "column", justifyContent: "space-between", flexGrow: 1, width: W, padding: "64px 72px" }, [
    div({ display: "flex", flexDirection: "column" }, [
      text({ fontFamily: "Inter Tight", fontWeight: 600, fontSize: 24, letterSpacing: 4.5, color: CARD.accentInk, marginBottom: 34 }, "THE ARCHV · EST. 2026"),
      text({ fontFamily: "Anton", fontSize: 106, lineHeight: 1.02, letterSpacing: 0.5, color: CARD.ink, width: 980 }, "SPORTS HISTORY, ILLUSTRATED."),
      text({ fontFamily: "Inter Tight", fontWeight: 400, fontSize: 27, lineHeight: 1.35, color: CARD.inkSoft, marginTop: 28, width: 800 },
        "A daily desk across football, the NFL, F1, tennis and golf. Every face on it is drawn, never photographed."),
    ]),
    div({ display: "flex", alignItems: "baseline", justifyContent: "space-between", width: "100%" }, [
      wordmark(38),
      text({ fontFamily: "Inter Tight", fontWeight: 400, fontSize: 20, color: CARD.inkMuted }, "thearchv.ca"),
    ]),
  ]),
]);

const svg = await satori(tree, { width: W, height: H, fonts: CARD_FONTS });
const png = new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();
await sharp(png).jpeg({ quality: 90 }).toFile(OUT);

console.log(`Wrote public/og.jpg (${W}x${H}, white system)`);
