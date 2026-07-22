/* scripts/shared/infogram.mjs — pure, render-agnostic helpers for the per-article
   "infogram" story card (INFOGRAM-PLAN.md P2/P3, founder-approved route: AI verifies data,
   DETERMINISTIC code draws the picture — "no AI garbage").

   Imported by BOTH scripts/build-infograms.mjs (which renders the PNGs via satori + resvg)
   AND scripts/build-feed.mjs (which emits the additive feed field only for entries whose PNG
   was actually generated). Keeping the tree / alt / eligibility pure and shared here means the
   two scripts can never disagree about which entries qualify or what the alt says.

   This module deliberately imports NO satori/resvg (only page-shell's pure helpers), so
   build-feed stays lean — the heavy render stack lives in build-infograms.mjs alone.

   The visual language reproduces the three founder-approved mocks in fifa.archv/infogram-mocks/
   (rendered by render-mocks.mjs): navy field + radial gradient, quiet THE ARCHV wordmark, thin
   gold rules, a Fraunces headline, a mono facts row, thearchv.ca footer. This is the "clean
   branded story card" variant of P1's approved template set: it composes ONLY the entry's own
   verified fields (headline, dek, status, date, lane) — no generative image model, no invented
   numbers. Structured infogram blocks (fees, scorelines, stat bars) are P2 desk-authoring work
   that lands later; until an entry carries verified figures worth a card, the story card is the
   approved fallback. */
import { longDate } from "./page-shell.mjs";

// ---- brand tokens (locked palette, matches render-mocks.mjs / the OG cards) ----
export const INFOGRAM_NAVY_DEEP = "#071C2B";
export const INFOGRAM_CREAM = "#F2EAD3";
export const INFOGRAM_GOLD = "#C9A14A";
export const INFOGRAM_W = 1080;
export const INFOGRAM_H = 1350;

// A story card needs a headline and a dek to say anything. Everything in the live feed carries
// both, so in practice every daily entry gets a card; the guard exists so a malformed entry
// (missing either) is skipped rather than rendering an empty card — same "absence beats filler"
// instinct as the plan's guardrail, applied at the floor.
export function infogramEligible(entry) {
  return Boolean(
    entry &&
      String(entry.headline ?? "").trim() &&
      String(entry.dek ?? "").trim()
  );
}

// Site-relative path the feed carries and the app resolves via AppConfig.imageURL (like `image`).
export function infogramRelPath(urlLane, date) {
  return `/desk/${urlLane}/${date}/infogram.png`;
}

// status → a human, honest label. 'verified' and 'pending' are the only values the data uses
// today (see src/data/*.ts DayEntry); anything else title-cases the raw value rather than
// inventing a status.
const STATUS_LABEL = { verified: "Verified", pending: "Developing" };
export function infogramStatusLabel(status) {
  const key = String(status ?? "").trim().toLowerCase();
  if (!key) return "Filed";
  if (STATUS_LABEL[key]) return STATUS_LABEL[key];
  return key.charAt(0).toUpperCase() + key.slice(1);
}

// One plain sentence, for the app's accessibilityLabel and the feed's `infogramAlt`.
// British, no em dash, no hype (house rule). Strips the headline's own terminal punctuation so
// the sentence reads cleanly with a single full stop.
export function infogramAlt(entry, laneLabel) {
  const headline = String(entry.headline ?? "").trim().replace(/[.!?]+$/, "");
  return `The ARCHV ${laneLabel} card: ${headline}.`;
}

// Abbreviated date for the footer ("13 Jun 2026"), matching the mocks' footer note style.
function shortDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

// Shrink-to-fit headline sizing so a one-word name and a two-sentence headline both sit inside
// the card; satori's lineClamp is the last-resort backstop so text can never overflow.
function headlineSize(text) {
  const len = String(text).length;
  if (len <= 20) return 104;
  if (len <= 34) return 84;
  if (len <= 50) return 66;
  if (len <= 74) return 54;
  return 46;
}

// tiny satori element helper (same shape render-mocks.mjs and build-article-pages.mjs use).
function el(style, children) {
  return { type: "div", props: { style, children } };
}
function metaRow(label, value) {
  return el(
    { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 22 },
    [
      el(
        {
          color: "rgba(242,234,211,.55)",
          fontFamily: "Inter Tight",
          fontWeight: 600,
          fontSize: 25,
          letterSpacing: 1.5,
        },
        String(label).toUpperCase()
      ),
      el(
        { color: INFOGRAM_CREAM, fontFamily: "Inter Tight", fontWeight: 600, fontSize: 30 },
        String(value)
      ),
    ]
  );
}

// The satori JSX-object tree for one story card. Pure: given an entry + lane, returns the tree;
// the caller renders it to SVG→PNG. Reproduces the mock chrome (wordmark + kicker header, gold
// rules, Fraunces hero headline, mono facts row, thearchv.ca footer).
export function infogramTree({ entry, laneLabel, portrait }) {
  const eyebrow = `${entry.day} · ${longDate(entry.date)}`.toUpperCase();

  const header = el(
    { display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 },
    [
      el({ display: "flex", alignItems: "baseline" }, [
        el(
          {
            color: "rgba(242,234,211,.62)",
            fontFamily: "Inter Tight",
            fontWeight: 600,
            fontSize: 22,
            letterSpacing: 5,
            marginRight: 10,
          },
          "THE"
        ),
        el({ color: INFOGRAM_CREAM, fontFamily: "Fraunces", fontWeight: 600, fontSize: 30 }, "ARCHV"),
        el({ color: INFOGRAM_GOLD, fontFamily: "Fraunces", fontWeight: 600, fontSize: 30 }, "."),
      ]),
      el(
        {
          color: INFOGRAM_GOLD,
          fontFamily: "Inter Tight",
          fontWeight: 600,
          fontSize: 22,
          letterSpacing: 3.5,
        },
        String(laneLabel).toUpperCase()
      ),
    ]
  );

  // Eyebrow pinned top, facts pinned bottom, the headline+dek floating in the centre band
  // between equal spacers — the same hero-centred balance the mocks use for their big number,
  // so a card with no hero figure reads as deliberate composition rather than top-loaded text.
  // Mandatory portrait (founder call 2026-07-21). Every card carries a face: the entry's own
  // illustrated headshot when the desk attached one, otherwise our OWN crest. Never a photo,
  // never a club mark - the same imagery rule the iOS app follows. The caller prepares the data
  // URI (satori cannot read webp, and this module stays pure so build-feed can import it without
  // pulling in sharp).
  const portraitEl = portrait
    ? {
        type: "img",
        props: {
          src: portrait,
          width: 240,
          height: 240,
          style: {
            width: 240,
            height: 240,
            borderRadius: 120,
            objectFit: "cover",
            border: `3px solid ${INFOGRAM_GOLD}`,
            marginBottom: 44,
          },
        },
      }
    : null;

  const body = el({ display: "flex", flexDirection: "column", flexGrow: 1 }, [
    el(
      {
        color: "rgba(242,234,211,.6)",
        fontFamily: "Inter Tight",
        fontWeight: 600,
        fontSize: 24,
        letterSpacing: 3,
      },
      eyebrow
    ),
    el({ display: "flex", flexGrow: 1 }, []),
    el({ display: "flex", flexDirection: "column" }, [
      ...(portraitEl ? [portraitEl] : []),
      el(
        {
          color: INFOGRAM_CREAM,
          fontFamily: "Fraunces",
          fontWeight: 600,
          fontSize: headlineSize(entry.headline),
          lineHeight: 1.05,
          letterSpacing: -1,
          lineClamp: 4,
        },
        String(entry.headline)
      ),
      el(
        {
          color: "rgba(242,234,211,.72)",
          fontFamily: "Inter Tight",
          fontWeight: 400,
          fontSize: 34,
          lineHeight: 1.32,
          marginTop: 28,
          lineClamp: 3,
        },
        String(entry.dek)
      ),
    ]),
    el({ display: "flex", flexGrow: 1 }, []),
    // Status row retired 2026-07-18 (founder ruling, EDITOR_STANDARDS "Labels
    // retired from reader-facing copy"): verification stays backend discipline;
    // the card no longer prints it.
  ]);

  const footer = [
    el({ display: "flex", height: 1, backgroundColor: "rgba(201,161,74,.28)", marginTop: 40, marginBottom: 28 }, []),
    el({ display: "flex", alignItems: "baseline", justifyContent: "space-between" }, [
      el(
        { color: "rgba(242,234,211,.55)", fontFamily: "Inter Tight", fontWeight: 400, fontSize: 22 },
        `Source: The ARCHV, ${shortDate(entry.date)}`
      ),
      el(
        {
          color: "rgba(242,234,211,.75)",
          fontFamily: "Inter Tight",
          fontWeight: 600,
          fontSize: 22,
          letterSpacing: 1,
        },
        "thearchv.ca"
      ),
    ]),
  ];

  return el(
    {
      width: INFOGRAM_W,
      height: INFOGRAM_H,
      display: "flex",
      flexDirection: "column",
      backgroundColor: INFOGRAM_NAVY_DEEP,
      backgroundImage: "radial-gradient(at 50% -10%, #133A52 0%, #071C2B 62%)",
      padding: "72px 76px 56px",
      fontFamily: "Inter Tight",
    },
    [header, el({ display: "flex", height: 2, backgroundColor: "rgba(201,161,74,.4)", marginBottom: 48 }, []), body, ...footer]
  );
}
