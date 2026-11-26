/* photo-credit.mjs: the photo credit line, and only what the licence requires (26 Nov 2026).

   Founder: "only add credits that are legally required, if we dont need to add wiki commons
   details then remove it". Read against the CC legal codes (2.0, 3.0, 4.0) on 26 Nov 2026:
   - CC0 and public-domain files: no credit at all.
   - CC BY and CC BY-SA: the creator in the form the licensor asked for (the Commons
     "Attribution" field, e.g. "Bryan Berlin / WikiPortraits"), any copyright notice the file
     carries (e.g. "©SPORTSFILE"), the licence named and linked, a link to the file (the
     attribution is linked to the Commons file page), and that the photo was cropped. CC 2.0 and
     3.0 also ask for the work's title when one was supplied. Naming Wikimedia Commons is not
     required, so the line no longer does.
   For BY-SA the licence named beside the cropped photo is the share-alike label for the crop.

   creditText() is the plain form (the registry's `credit`, the app feed's `photoCredit`).
   photoCreditHtml() in scripts/shared/illustrated.mjs and src/render/illustrated.ts builds the
   linked form from the same licence fields; check-portrait-provenance.mjs holds them together. */
export const NO_CREDIT = (licenceName) => /^(CC0|Public domain)\b/i.test(String(licenceName ?? ""));

export function creditText(l) {
  const who = `${l.title ? `“${l.title}” by ` : ""}${l.attribution}${l.copyright ? `, ${l.copyright}` : ""}`;
  return `Photo: ${who}, ${l.name}, cropped`;
}
