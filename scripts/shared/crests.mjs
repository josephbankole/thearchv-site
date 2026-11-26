/* crests.mjs: club crests beside team names (founder ruling, 21 Nov 2026 evening: "we wont be
   doing emails, anything that specifically says you need a written license, dont use, anything else
   that we can find in wikimedia, use"). D-2026-11-21b in ../CANONICAL-CONTEXT.md.

   THE SOURCE. scripts/data/crests.json, one row per club: Wikimedia Commons files only (never an
   en.wikipedia non-free upload), each with its file page, author, licence tag and the sha256 of the
   file in public/logos/crests/, which is the Commons file byte for byte. Resize only: CSS sets the
   size, nothing redraws, recolours or crops it. Formula 1, NBA and WNBA marks never go in.

   THE SWITCH. THIRD_PARTY_LOGOS in logos.mjs turns these off with the Premier League logo: one flag
   for every third-party mark on the site. src/lib/crests.ts mirrors normTeam() and the switch for
   the homepage scores strip (the bundle cannot import a Node module); scripts/test/logos.test.mjs
   fails the build if the two switches or the two normalisers disagree.

   WHERE. Beside a team's name, 16 to 20px, in /tables/ standings and match rows, the /scores/ match
   rows and the homepage scores strip. Never posters, the shop, storefront or app feeds, share cards,
   the sport icons or App Store material (check-logos.mjs fails the build if one leaks).

   NAMES. A crest is found by the team's name as the feed prints it. Each row lists its names
   (football-data.org's "Manchester United FC", API-Football's "Manchester United", and the short
   forms); matching is exact after normalising case, accents, "&"/"and" and spacing. No fuzzy match:
   a miss draws nothing, which is the safe failure. */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { THIRD_PARTY_LOGOS } from "./logos.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CRESTS_FILE = join("scripts", "data", "crests.json");

export const normTeam = (s) =>
  String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

let cache = null;
export function loadCrests(root = ROOT) {
  if (cache && root === ROOT) return cache;
  const reg = JSON.parse(readFileSync(join(root, CRESTS_FILE), "utf8"));
  const byName = new Map();
  for (const c of reg.crests) for (const n of c.names) byName.set(normTeam(n), c);
  const out = { reg, byName };
  if (root === ROOT) cache = out;
  return out;
}

/* The compact map the clients embed: { "<normalised name>": "<src>" }. */
export function crestMap(root = ROOT) {
  const { reg } = loadCrests(root);
  const m = {};
  for (const c of reg.crests) for (const n of c.names) m[normTeam(n)] = `/logos/crests/${c.file}`;
  return m;
}

export function crestFor(name, { enabled = THIRD_PARTY_LOGOS, root = ROOT } = {}) {
  if (!enabled) return null;
  return loadCrests(root).byName.get(normTeam(name)) || null;
}

/* The <img> for a team's crest, or '' (no crest, or the switch off). Decorative: the team's name is
   printed right beside it, so alt is empty rather than repeating the name to a screen reader. */
export function crestImg(name, opts = {}) {
  const c = crestFor(name, opts);
  if (!c) return "";
  return `<img class="team-crest" src="/logos/crests/${c.file}" alt="" aria-hidden="true" width="18" height="18" loading="lazy" decoding="async" />`;
}

export const TEAM_CREST_CSS = `.team-crest { display: inline-block; width: 18px; height: 18px; object-fit: contain; vertical-align: -3px; margin-right: .4em; }`;
