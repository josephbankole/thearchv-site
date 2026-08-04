/* api-football.mjs — the live provider, written against the real API and deliberately hard to
   misuse. It is NOT the default: select it with ARCHV_FOOTBALL_PROVIDER=api-football.

   WHAT THE KEY CAN DO (PRO PLAN, verified against the live API 2026-08-04, renews 2026-09-04)
   - 7,500 requests a day, up from the free plan's 100.
   - Every season, including the current one. The free plan's 2022-2024 window is gone, and so is
     the paywall body that used to arrive as a healthy 200.
   - Paid-only parameters work, `last` among them, so head to head no longer has to be walked
     season by season.

   THE SEASON TRAP THAT SURVIVED THE UPGRADE
   API-Football labels a season by its opening year, so season=2025 is the completed 2025/26
   campaign and season=2026 is 2026/27. **The 2026/27 Premier League starts on 21 August 2026.**
   Before then, asking for season=2026 returns a healthy 200 carrying international fixtures and no
   club league rows, because no club games have been played. That is not an error and nothing
   throws; it is simply an empty card if nobody looks. Until the season opens, club figures come
   from season=2025 and must be labelled as the 2025/26 season on the surface. SEASON_GUARD below
   now blocks only a season the API cannot know about at all.

   THE RULES THIS FILE ENFORCES
   1. Fetching happens at build time and lands in a committed cache file. Never at render time.
   2. A normal `npm run build` spends nothing. A cache miss is a hard error unless the run sets
      ARCHV_FOOTBALL_ALLOW_FETCH=1, so filling the cache is always a deliberate act.
   3. A per-run request ceiling (ARCHV_FOOTBALL_MAX_REQUESTS, default 20) stops a loop bug from
      eating the day's quota before anyone reads the log.
   4. The key is read from the environment only. Load it with `set -a; . ./.env; set +a`. It is
      never logged, never written to the cache, and never given a VITE_ prefix, which would put it
      in the client bundle.

   FILLING THE CACHE
     cd thearchv-site && set -a && . ./.env && set +a
     ARCHV_FOOTBALL_PROVIDER=api-football ARCHV_FOOTBALL_ALLOW_FETCH=1 \
       ARCHV_FOOTBALL_SEASON=2024 node scripts/build-duel-pages.mjs
   Commit the resulting scripts/data/football/cache/*.json so later builds and CI need no key.

   MAPPING PLAYERS
   API-Football uses its own numeric ids (Manchester United is 33, Liverpool 40). ARCHV ids are
   slugs. scripts/data/football/api-football-ids.json holds the bridge. Filling it costs one
   /players/profiles request per name, so do it once, by hand, and commit the result. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const BASE = "https://v3.football.api-sports.io";
const PREMIER_LEAGUE = 39;

// Pro plan (2026-08-04). The old free-plan ceiling of 2024 is lifted. The remaining bounds are
// sanity rails, not entitlement: below 2010 the coverage thins out, and a season beyond next year
// is a typo rather than a request. Kept as data so the guard cannot drift from the comment.
const SEASON_GUARD = { min: 2010, max: new Date().getUTCFullYear() + 1 };

// A season whose club competition has not kicked off answers 200 with internationals only and no
// league rows. CLUB_SEASON_OPENS carries the confirmed opening date for any year we have checked;
// Premier League 2026/27 opens 21 August 2026, verified against the leagues endpoint.
const CLUB_SEASON_OPENS = { 2026: "2026-08-21" };

// For a year with no confirmed date, fall back to 1 August. European club seasons open in August,
// so anything earlier in the calendar year still belongs to the previous season. Without this
// fallback the function is only correct for years listed above: a March 2027 build would ask for
// season 2027 while the 2026/27 season was still being played.
const DEFAULT_OPENING = "-08-01";

/** The newest season with club data actually behind it, given today's date. */
export function newestPlayedSeason(today = new Date()) {
  const year = today.getUTCFullYear();
  const opens = CLUB_SEASON_OPENS[year] || `${year}${DEFAULT_OPENING}`;
  return today < new Date(`${opens}T00:00:00Z`) ? year - 1 : year;
}

const CACHE_DIR = "scripts/data/football/cache";
const ID_MAP = "scripts/data/football/api-football-ids.json";

export default {
  name: "api-football",

  async load({ root }) {
    // Default to the newest season that has actually been played, NOT SEASON_GUARD.max. The max is
    // a typo rail sitting a year in the future; defaulting to it would silently request a season
    // with no club rows in it.
    const season = Number(process.env.ARCHV_FOOTBALL_SEASON || newestPlayedSeason());
    const league = Number(process.env.ARCHV_FOOTBALL_LEAGUE || PREMIER_LEAGUE);
    assertSeason(season);

    const cachePath = join(root, CACHE_DIR, `api-football-${league}-${season}.json`);
    if (existsSync(cachePath)) {
      return JSON.parse(readFileSync(cachePath, "utf8"));
    }

    if (process.env.ARCHV_FOOTBALL_ALLOW_FETCH !== "1") {
      throw new Error(
        `[api-football] no cache at ${CACHE_DIR}/api-football-${league}-${season}.json and fetching is off.\n` +
          `  A build never spends quota by accident. To fill the cache once, deliberately:\n` +
          `    set -a; . ./.env; set +a\n` +
          `    ARCHV_FOOTBALL_PROVIDER=api-football ARCHV_FOOTBALL_ALLOW_FETCH=1 ARCHV_FOOTBALL_SEASON=${season} node scripts/build-duel-pages.mjs\n` +
          `  Then commit the cache file.`,
      );
    }

    const dataset = await fetchSeason({ root, league, season });
    mkdirSync(join(root, CACHE_DIR), { recursive: true });
    writeFileSync(cachePath, `${JSON.stringify(dataset, null, 2)}\n`);
    console.log(`[api-football] wrote cache ${CACHE_DIR}/api-football-${league}-${season}.json`);
    return dataset;
  },
};

function assertSeason(season) {
  if (!Number.isInteger(season) || season < SEASON_GUARD.min || season > SEASON_GUARD.max) {
    throw new Error(
      `[api-football] season ${season} is outside the sanity window (${SEASON_GUARD.min} to ${SEASON_GUARD.max}).\n` +
        `  The Pro plan serves every season, so this is a typo rail rather than an entitlement check.`,
    );
  }

  // The upgrade removed the paywall but not the calendar. A season whose club competition has not
  // kicked off returns a healthy 200 with internationals and no league rows, which reads as a
  // working request right up until the card renders empty. Warn loudly rather than throw, because
  // internationals are a legitimate thing to ask for during a break.
  const played = newestPlayedSeason();
  if (season > played) {
    console.warn(
      `[api-football] season ${season} has no club data yet; the newest played season is ${played}.\n` +
        `  Expect internationals only. For club figures use ARCHV_FOOTBALL_SEASON=${played} and label\n` +
        `  the card ${played}/${String(played + 1).slice(2)}.`,
    );
  }
}

/* ---------- the fetch path ---------- */

function apiKey() {
  const key = process.env.APIFOOTBALL_KEY;
  if (!key) {
    throw new Error(
      "[api-football] APIFOOTBALL_KEY is not in the environment. Load it with: set -a; . ./.env; set +a",
    );
  }
  return key;
}

let spent = 0;
const maxRequests = Number(process.env.ARCHV_FOOTBALL_MAX_REQUESTS || 20);

async function request(path, params) {
  if (spent >= maxRequests) {
    throw new Error(
      `[api-football] per-run request ceiling of ${maxRequests} reached. Raise ARCHV_FOOTBALL_MAX_REQUESTS ` +
        `only if you have counted the day's remaining quota out of 100.`,
    );
  }
  spent++;
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const res = await fetch(url, { headers: { "x-apisports-key": apiKey() } });
  if (!res.ok) throw new Error(`[api-football] ${path} returned HTTP ${res.status}`);
  const body = await res.json();

  // A paywalled season, a bad key and a malformed query all arrive as a 200 with the complaint
  // tucked inside `errors`. Treat any non-empty `errors` as a failure; the alternative is an
  // empty dataset that renders as a page full of zeroes.
  const errors = body?.errors;
  const hasErrors = Array.isArray(errors) ? errors.length > 0 : errors && Object.keys(errors).length > 0;
  if (hasErrors) {
    throw new Error(`[api-football] ${path} refused the request: ${JSON.stringify(errors)}`);
  }
  return body;
}

async function fetchSeason({ root, league, season }) {
  const idMapPath = join(root, ID_MAP);
  if (!existsSync(idMapPath)) {
    throw new Error(
      `[api-football] ${ID_MAP} is missing. It maps ARCHV player slugs to API-Football numeric ids ` +
        `and has to be filled by hand once, because guessing ids by name costs a request each.`,
    );
  }
  const idMap = JSON.parse(readFileSync(idMapPath, "utf8"));
  const entries = Object.entries(idMap.players || {});
  if (!entries.length) throw new Error(`[api-football] ${ID_MAP} has no players in it yet.`);

  const seasonLabel = `${season}/${String(season + 1).slice(2)}`;
  const sources = {
    "api-football": {
      name: "API-Football",
      detail: `Premier League ${seasonLabel} player statistics, league ${league}`,
      url: "https://www.api-football.com/",
      retrieved: new Date().toISOString().slice(0, 10),
    },
  };

  const players = [];
  for (const [id, meta] of entries) {
    const body = await request("/players", { id: meta.apiId, season, league });
    const record = body?.response?.[0];
    if (!record) {
      console.warn(`[api-football] no record for ${id} (api id ${meta.apiId}) in ${seasonLabel}; skipped`);
      continue;
    }
    const line = record.statistics?.find((s) => s.league?.id === league) || record.statistics?.[0];
    if (!line) continue;

    // One provider, so a stat here carries one source. The two-source rule lives in the static
    // provider's validator because it is an editorial rule about hand-checked figures; a single
    // licensed feed is a different kind of claim and the card labels it as such.
    const stat = (value) => ({ value, sources: ["api-football"] });
    players.push({
      id,
      name: meta.name || record.player?.name,
      sortName: meta.sortName || record.player?.lastname,
      club: line.team?.name,
      position: line.games?.position,
      nationality: record.player?.nationality,
      head: meta.head,
      headAlt: meta.headAlt,
      line: meta.line || "",
      stats: {
        goals: stat(line.goals?.total ?? 0),
        assists: stat(line.goals?.assists ?? 0),
      },
    });
  }

  console.log(`[api-football] ${spent} request(s) spent this run for ${players.length} player(s).`);

  return {
    schemaVersion: 1,
    competition: {
      key: "premier-league",
      label: "Premier League",
      season: seasonLabel,
      scopeNote: `Premier League league matches only, ${seasonLabel}, as supplied by API-Football.`,
    },
    asOf: new Date().toISOString().slice(0, 10),
    omitted: [],
    sources,
    metrics: [
      { key: "goals", label: "Goals", short: "G", higherIsBetter: true, blurb: `Premier League goals, ${seasonLabel}.` },
      { key: "assists", label: "Assists", short: "A", higherIsBetter: true, blurb: `Premier League assists, ${seasonLabel}.` },
      {
        key: "involvements",
        label: "Goal involvements",
        short: "G+A",
        higherIsBetter: true,
        derived: "goals + assists",
        blurb: "Goals and assists added together, worked out by The ARCHV from the two figures above.",
      },
    ],
    players,
  };
}
