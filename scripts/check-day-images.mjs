/* check-day-images.mjs: warn when a dated entry's portrait names nobody its story mentions
   (audit gap4-12, 2026-11-15).

   A day entry may carry an illustrated headshot (`image`, e.g. /heads/balogun.webp). The face is
   meant to illustrate the story, and the page, its share card and the app row all show it beside
   the headline. The 2026-06-19 World Cup entry carried Folarin Balogun's portrait while its
   headline, dek and body named Alex Freeman, Matheus Cunha and Ismael Saibari, never Balogun.

   The rule: split the image file stem on "-" and "_" into name tokens ("bruno-fernandes" gives
   "bruno" and "fernandes"), and expect at least one token of three letters or more to appear as a
   whole word in the headline, dek or body. Case and accents are folded, so "mbappe" matches
   "Mbappé" and "kone" matches "Koné". One token is enough because the copy usually uses a surname.

   WARN-ONLY, like check-freshness.mjs. Day data is written to main by the desk engine and a fix
   goes there, so this never fails the build; it names the lane, the date and the image so the desk
   can swap or drop the portrait. Runs in `npm run build` after the day pages are built, and on its
   own as `npm run check-day-images`. */
import { fileURLToPath } from "node:url";

const TAG = "[check-day-images]";

const fold = (s) => String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** The name tokens of an image path's file stem, three letters or more. */
export function stemTokens(image) {
  const stem = String(image ?? "").split("/").pop().replace(/\.[a-z0-9]+$/i, "");
  return fold(stem).split(/[-_\s]+/).filter((t) => /^[a-z]{3,}$/.test(t));
}

/** True when some stem token appears as a whole word in the entry's headline, dek or body. */
export function imageMatchesEntry(entry) {
  const tokens = stemTokens(entry.image);
  if (!tokens.length) return true; // nothing name-like to check, e.g. a numbered file
  const words = new Set(fold(`${entry.headline} ${entry.dek} ${entry.body}`).split(/[^a-z0-9]+/).filter(Boolean));
  return tokens.some((t) => words.has(t));
}

/** Every entry with an image that matches no word in it, as { lane, date, image }. */
export function imageMismatches(lanes) {
  const out = [];
  for (const { lane, days } of lanes) {
    for (const e of days) {
      if (e && e.image && !imageMatchesEntry(e)) out.push({ lane, date: e.date, image: e.image });
    }
  }
  return out;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  try {
    const { loadDayData } = await import("./shared/day-data.mjs");
    const data = await loadDayData();
    const lanes = [
      { lane: "transfer", days: data.transferDays },
      { lane: "world-cup", days: data.worldCupDays },
      { lane: "leagues", days: data.leaguesDays },
      ...Object.entries(data.sportDays).map(([lane, days]) => ({ lane, days })),
    ];
    const seen = new Set();
    const unique = lanes.filter(({ days }) => (seen.has(days) ? false : (seen.add(days), true)));
    const found = imageMismatches(unique);
    const total = unique.reduce((n, { days }) => n + days.filter((e) => e && e.image).length, 0);
    for (const m of found) {
      console.warn(`${TAG} WARN: ${m.lane} ${m.date} shows ${m.image}, but no part of that name appears in its headline, dek or body`);
    }
    console.log(`${TAG} ${found.length ? `${found.length} of ${total}` : `all ${total}`} dated images ${found.length ? "name nobody in their entry (warn only)" : "name someone in their entry"}.`);
  } catch (err) {
    // Warn-only: a failure here never stops the build.
    console.warn(`${TAG} skipped: ${err && err.message ? err.message : err}`);
  }
}
