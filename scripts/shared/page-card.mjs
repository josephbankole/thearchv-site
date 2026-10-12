/* page-card.mjs — the per-page 1200x630 share card, one renderer for every page family.

   This is the article pages' ogCard() body, lifted out of scripts/build-article-pages.mjs on
   2026-10-12 so the long reads (/reads/<slug>/), the explainers (/explainers/<slug>/) and the
   glossary entries (/glossary/<slug>/) get their own card from the same code instead of all
   sharing the site-wide /og.jpg. build-article-pages.mjs still owns its call site and its
   og-wide crop; it now passes kicker, headline and art path in here, and the desk cards come
   out byte-identical to what the inline copy drew.

   The design notes that lived beside the original (white ground, the accent hairline across the
   top, the kicker in accent ink, the headline in Anton and uppercase exactly as the page sets its
   own h1, the wordmark as the masthead draws it) still hold, and palette and fonts still come
   from shared/card-brand.mjs only.

   Error policy is the caller's, as card-brand.mjs says: pageCard() throws on a real failure.
   writePageCard() is the convenience the three new families use: it writes og.png into the
   page's own dist folder, logs a failure and returns false, and the page falls back to /og.jpg.
   A card failure never fails the build. */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import satori from "satori";
import { renderAsync } from "@resvg/resvg-js";
import { CARD, CARD_GROUND, CARD_FONTS, div, text, accentRule, wordmark, renderCard, artPng } from "./card-brand.mjs";

export const CARD_W = 1200;

// Shrink-to-fit headline sizing: three lines maximum, ellipsized by satori's lineClamp as a last
// resort so text can never overflow the card. The steps sit above the old Fraunces ones because
// Anton is a condensed face and fits noticeably more per line at the same size.
function headlineSize(text) {
  const len = String(text).length;
  if (len <= 42) return 82;
  if (len <= 64) return 70;
  if (len <= 90) return 58;
  return 50;
}

// The entries reference far fewer distinct head files than there are pages, so cache the
// conversion by resolved path — build-duel-pages.mjs has carried the same cache since it
// shipped (2026-08-12 review). The conversion itself is artPng() in card-brand.mjs; a missing
// file gives null and the card draws no face.
const headPngCache = new Map();
async function headPngDataUri(imgPath) {
  if (headPngCache.has(imgPath)) return headPngCache.get(imgPath);
  const png = await artPng(imgPath, { size: 600 });
  const uri = png ? `data:image/png;base64,${png.toString("base64")}` : null;
  headPngCache.set(imgPath, uri);
  return uri;
}

/** One card as PNG bytes. `kicker` is uppercased here, `headline` likewise. `artPath` is an
    absolute file path (or null for a text-only card). The card was designed at 1200x630; a
    taller render (the article pages' og-wide at 675) keeps the content block at its designed
    height by absorbing the difference into the vertical padding, so the headline wraps
    identically at both sizes. */
export async function pageCard(spec, height = 630) {
  return renderCard(await cardTree(spec, height), { width: CARD_W, height });
}

async function cardTree({ kicker, headline, artPath = null }, height) {
  const padY = 60 + Math.round((height - 630) / 2);
  const portrait = artPath ? await headPngDataUri(artPath) : null;

  const left = div(
    { display: "flex", flexDirection: "column", justifyContent: "space-between", flexGrow: 1, flexShrink: 1, height: "100%", minWidth: 0 },
    [
      div({ display: "flex", flexDirection: "column" }, [
        text({ color: CARD.accentInk, fontFamily: "Inter Tight", fontWeight: 600, fontSize: 24, letterSpacing: 4.5, lineClamp: 1, marginBottom: 30 }, String(kicker).toUpperCase()),
        text({ color: CARD.ink, fontFamily: "Anton", fontSize: headlineSize(headline), lineHeight: 1.06, letterSpacing: 0.5, lineClamp: 3 }, String(headline).toUpperCase()),
      ]),
      div({ display: "flex", alignItems: "baseline", justifyContent: "space-between", width: "100%" }, [
        wordmark(38),
        text({ color: CARD.inkMuted, fontFamily: "Inter Tight", fontWeight: 400, fontSize: 20 }, "thearchv.ca"),
      ]),
    ],
  );

  const children = [left];
  if (portrait) {
    children.push(
      div({ display: "flex", alignItems: "center", marginLeft: 56, flexShrink: 0 }, [
        {
          type: "img",
          props: {
            src: portrait,
            width: 300,
            height: 300,
            style: { borderRadius: 300, border: `2px solid ${CARD.rule}`, boxShadow: `0 0 0 12px ${CARD.bg}` },
          },
        },
      ]),
    );
  }

  return div({ width: CARD_W, height, display: "flex", flexDirection: "column", backgroundColor: CARD.bg, backgroundImage: CARD_GROUND }, [
    accentRule(CARD_W),
    div({ display: "flex", alignItems: "center", flexGrow: 1, width: CARD_W, padding: `${padY}px 72px` }, children),
  ]);
}

/** Render and write `<dir>/og.png` at 1200x630. Returns true when the card is on disk, false
    (after one warning line naming `where`) when it is not, so the caller points og:image at
    /og.jpg.

    BUILD TIME. Rasterising is about 95 per cent of a card's cost (satori lays one out in ~7ms,
    resvg takes ~110ms to paint it), and renderCard() paints synchronously on the main thread.
    This path paints with resvg's renderAsync instead, which runs on libuv's thread pool, so a
    caller that starts every card of a family at once (Promise.all) paints them four at a time
    and the 120-odd reads, explainer and glossary cards cost a few seconds of build rather than
    thirteen. Same engine, same options: the bytes match renderCard() exactly (checked
    2026-10-12 on a text-only card and a portrait card). */
export async function writePageCard(dir, spec, where) {
  try {
    const svg = await satori(await cardTree(spec, 630), { width: CARD_W, height: 630, fonts: CARD_FONTS });
    const png = (await renderAsync(svg, { fitTo: { mode: "width", value: CARD_W } })).asPng();
    writeFileSync(join(dir, "og.png"), png);
    return true;
  } catch (err) {
    console.warn(`[page-card] og card failed for ${where} (${spec && spec.headline}): ${err && err.message ? err.message : err}`);
    return false;
  }
}
