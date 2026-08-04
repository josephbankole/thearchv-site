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
   5. Requests already spent are never thrown away. The cache is written after every player and
      carries `partial: true` until the run finishes, so a 429 or a dropped connection halfway
      through costs the remaining players and not the ones already paid for. A rerun resumes.

   FILLING THE CACHE
     cd thearchv-site && set -a && . ./.env && set +a
     ARCHV_FOOTBALL_PROVIDER=api-football ARCHV_FOOTBALL_ALLOW_FETCH=1 \
       ARCHV_FOOTBALL_SEASON=2024 node scripts/build-duel-pages.mjs
   Commit the resulting scripts/data/football/cache/*.json so later builds and CI need no key.

   WHICH SEASON A KEY-FREE BUILD GETS
   The committed cache currently covers season 2024 (the 2024/25 campaign) and nothing else, while
   `newestPlayedSeason()` returns 2025 today. A build that defaulted to the newest played season
   would therefore miss the cache and hard-error, which made the no-key promise above untrue.
   `resolveSeason()` fixes that: with no ARCHV_FOOTBALL_SEASON set it picks the newest season that
   has a COMMITTED CACHE, and warns when that lags the newest played season so the gap is visible
   rather than silent. Ask for a season explicitly and you always get that season.

   MAPPING PLAYERS
   API-Football uses its own numeric ids (Manchester United is 33, Liverpool 40). ARCHV ids are
   slugs. scripts/data/football/api-football-ids.json holds the bridge. Filling it costs one
   /players/profiles request per name, so do it once, by hand, and commit the result. */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
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

/** The newest season with a committed cache file for this league, or null if there is none. */
export function newestCachedSeason(root, league) {
  const dir = join(root, CACHE_DIR);
  if (!existsSync(dir)) return null;
  const prefix = `api-football-${league}-`;
  const seasons = readdirSync(dir)
    .map((f) => (f.startsWith(prefix) && f.endsWith(".json") ? Number(f.slice(prefix.length, -5)) : NaN))
    .filter((n) => Number.isInteger(n));
  return seasons.length ? Math.max(...seasons) : null;
}

/** Which season a run gets: the explicit one, else the newest committed cache, else newest played. */
function resolveSeason(root, league) {
  if (process.env.ARCHV_FOOTBALL_SEASON) return Number(process.env.ARCHV_FOOTBALL_SEASON);

  // Default to the newest season that has actually been played, NOT SEASON_GUARD.max. The max is
  // a typo rail sitting a year in the future; defaulting to it would silently request a season
  // with no club rows in it. Then prefer a committed cache over that, so the documented key-free
  // path resolves to a file that exists instead of hard-erroring on a season nobody has filled.
  const played = newestPlayedSeason();
  const cached = newestCachedSeason(root, league);
  if (cached === null || cached >= played) return played;

  console.warn(
    `[api-football] defaulting to season ${cached}, the newest one with a committed cache. The newest\n` +
      `  played season is ${played}. Fill and commit that cache to move the default forward:\n` +
      `    ARCHV_FOOTBALL_PROVIDER=api-football ARCHV_FOOTBALL_ALLOW_FETCH=1 ARCHV_FOOTBALL_SEASON=${played} node scripts/build-duel-pages.mjs`,
  );
  return cached;
}

export default {
  name: "api-football",

  async load({ root }) {
    const league = Number(process.env.ARCHV_FOOTBALL_LEAGUE || PREMIER_LEAGUE);
    const season = resolveSeason(root, league);
    assertSeason(season);

    const cacheName = `api-football-${league}-${season}.json`;
    const cachePath = join(root, CACHE_DIR, cacheName);
    const allowFetch = process.env.ARCHV_FOOTBALL_ALLOW_FETCH === "1";

    let existing = null;
    if (existsSync(cachePath)) {
      existing = JSON.parse(readFileSync(cachePath, "utf8"));
      // A complete cache is the whole answer and costs nothing.
      if (!existing.partial) return existing;
      // A partial cache is a run that died halfway. Fail closed rather than render a page missing
      // players nobody asked to drop, but say exactly what it is and how to finish it.
      if (!allowFetch) {
        throw new Error(
          `[api-football] ${CACHE_DIR}/${cacheName} is a PARTIAL cache: ${(existing.players || []).length} player(s)\n` +
            `  were fetched before a run failed, and the rest are missing. This is not a dataset to build from.\n` +
            `  Finish it (only the missing players are fetched, the paid-for ones are reused):\n` +
            `    set -a; . ./.env; set +a\n` +
            `    ARCHV_FOOTBALL_PROVIDER=api-football ARCHV_FOOTBALL_ALLOW_FETCH=1 ARCHV_FOOTBALL_SEASON=${season} node scripts/build-duel-pages.mjs`,
        );
      }
      console.warn(
        `[api-football] resuming a partial cache: ${(existing.players || []).length} player(s) already fetched, ` +
          `only the missing ones cost a request.`,
      );
    }

    if (!existing && !allowFetch) {
      throw new Error(
        `[api-football] no cache at ${CACHE_DIR}/${cacheName} and fetching is off.\n` +
          `  A build never spends quota by accident. To fill the cache once, deliberately:\n` +
          `    set -a; . ./.env; set +a\n` +
          `    ARCHV_FOOTBALL_PROVIDER=api-football ARCHV_FOOTBALL_ALLOW_FETCH=1 ARCHV_FOOTBALL_SEASON=${season} node scripts/build-duel-pages.mjs\n` +
          `  Then commit the cache file.`,
      );
    }

    return fetchSeason({ root, league, season, cachePath, cacheName, existing });
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

// A 429 is the per-minute limit, not the daily one, and a 502/503 is the upstream having a moment.
// Both clear on their own within seconds, so retrying is the difference between a run finishing and
// a run throwing away every request it has already paid for. Anything else (401, 404, a refusal in
// the body) is a real answer and is not retried.
const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
const RETRY_ATTEMPTS = 3;
const RETRY_BASE_MS = 1500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(path, params) {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  let lastError = null;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    // The ceiling counts attempts, not successes: a retry storm spends quota exactly like a loop
    // bug does, and this is the rail that stops both.
    if (spent >= maxRequests) {
      throw new Error(
        `[api-football] per-run request ceiling of ${maxRequests} reached. Raise ARCHV_FOOTBALL_MAX_REQUESTS ` +
          `only after reading the day's remaining quota off the response's x-ratelimit-requests-remaining ` +
          `header (the Pro plan's daily allowance is 7,500, not the free plan's 100).`,
      );
    }
    spent++;

    let res = null;
    try {
      res = await fetch(url, { headers: { "x-apisports-key": apiKey() } });
    } catch (err) {
      // A dropped connection or a DNS blip. Same treatment as a 5xx.
      lastError = new Error(`[api-football] ${path} failed to connect: ${err.message}`);
      if (attempt === RETRY_ATTEMPTS) break;
      await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
      continue;
    }

    if (!res.ok) {
      lastError = new Error(`[api-football] ${path} returned HTTP ${res.status}`);
      if (!RETRY_STATUS.has(res.status) || attempt === RETRY_ATTEMPTS) break;
      // Retry-After is authoritative when the API sends it; the doubling backoff is the fallback.
      const after = Number(res.headers.get("retry-after"));
      const waitMs = Number.isFinite(after) && after > 0 ? after * 1000 : RETRY_BASE_MS * 2 ** (attempt - 1);
      console.warn(
        `[api-football] ${path} returned HTTP ${res.status}; retrying in ${Math.round(waitMs / 1000)}s ` +
          `(attempt ${attempt} of ${RETRY_ATTEMPTS}).`,
      );
      await sleep(waitMs);
      continue;
    }

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

  throw lastError;
}

/* ---------- per-club aggregation ----------

   API-Football returns `statistics` as one entry PER TEAM per league per season, so a player who
   moved clubs in January has TWO rows for the same competition. Taking the first published half a
   season's goals under one club's name, on a product whose whole pitch is sourced figures.

   THE PRESENTATION RULE, so the card is never ambiguous:
   - The NUMBERS are season totals, summed across every club row in the competition. That is the
     figure every public source prints for a season and the one a reader is checking against.
   - The CLUB LABEL is a single club, because the surfaces downstream (the duel card, the OG image,
     the head-kit guard in football-data.mjs) each take one club string and a combined label would
     have to be parsed by all three. It is the DOMINANT-MINUTES club, which for a mid-season mover
     is the one he is remembered at for that season, and it is also the club whose kit the head
     should be wearing.
   - Any player with more than one row is LOGGED with the split, because a totals-under-one-club
     card is a legitimate presentation but not one that should ship unlooked-at. */
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
// API-Football's own field is spelled "appearences". Read both so a fix upstream does not break us.
const apps = (s) => num(s.games?.appearences ?? s.games?.appearances);

function aggregateLines(lines) {
  const primary = lines
    .slice()
    .sort((a, b) => num(b.games?.minutes) - num(a.games?.minutes) || apps(b) - apps(a))[0];
  return {
    club: primary.team?.name,
    position: primary.games?.position,
    goals: lines.reduce((sum, s) => sum + num(s.goals?.total), 0),
    assists: lines.reduce((sum, s) => sum + num(s.goals?.assists), 0),
  };
}

async function fetchSeason({ root, league, season, cachePath, cacheName, existing }) {
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

  // Resume: anything already in a partial cache was paid for and is not fetched again.
  const players = (existing?.players || []).slice();
  const have = new Set(players.map((p) => p.id));
  if (have.size) console.log(`[api-football] reusing ${have.size} player(s) from the partial cache.`);

  const dataset = (partial) => ({
    schemaVersion: 1,
    ...(partial ? { partial: true } : {}),
    competition: {
      key: "premier-league",
      label: "Premier League",
      season: seasonLabel,
      scopeNote: `Premier League league matches only, ${seasonLabel}, as supplied by API-Football.`,
    },
    asOf: new Date().toISOString().slice(0, 10),
    omitted: [],
    sources,
    metrics: METRICS(seasonLabel),
    players,
  });

  const writeCache = (partial) => {
    mkdirSync(join(root, CACHE_DIR), { recursive: true });
    writeFileSync(cachePath, `${JSON.stringify(dataset(partial), null, 2)}\n`);
  };

  for (const [id, meta] of entries) {
    if (have.has(id)) continue;
    let body;
    try {
      body = await request("/players", { id: meta.apiId, season, league });
    } catch (err) {
      // Everything fetched so far is banked before the failure propagates, so a rerun resumes
      // instead of restarting and spending those requests twice.
      if (players.length) {
        writeCache(true);
        console.error(
          `[api-football] run failed after ${spent} request(s). ${players.length} player(s) were written to ` +
            `${CACHE_DIR}/${cacheName} as a PARTIAL cache; rerun the same command to fetch only the rest.`,
        );
      }
      throw err;
    }

    const record = body?.response?.[0];
    if (!record) {
      console.warn(`[api-football] no record for ${id} (api id ${meta.apiId}) in ${seasonLabel}; skipped`);
      continue;
    }
    // Every row for THIS competition, not the first one. See the aggregation note above.
    const inLeague = (record.statistics || []).filter((s) => s.league?.id === league);
    const lines = inLeague.length ? inLeague : (record.statistics?.[0] ? [record.statistics[0]] : []);
    if (!lines.length) continue;
    const agg = aggregateLines(lines);
    if (lines.length > 1) {
      console.warn(
        `[api-football] ${id} has ${lines.length} club rows in ${seasonLabel}: ` +
          lines.map((s) => `${s.team?.name} ${num(s.goals?.total)}G/${num(s.goals?.assists)}A/${num(s.games?.minutes)}min`).join(", ") +
          `.\n  Published as season totals (${agg.goals}G/${agg.assists}A) labelled ${agg.club}, the club with the most ` +
          `minutes. Check the club label and the head's kit before this card ships.`,
      );
    }

    // One provider, so a stat here carries one source. The two-source rule lives in the static
    // provider's validator because it is an editorial rule about hand-checked figures; a single
    // licensed feed is a different kind of claim and the card labels it as such.
    const stat = (value) => ({ value, sources: ["api-football"] });
    players.push({
      id,
      name: meta.name || record.player?.name,
      sortName: meta.sortName || record.player?.lastname,
      club: agg.club,
      position: agg.position,
      nationality: record.player?.nationality,
      head: meta.head,
      headAlt: meta.headAlt,
      line: meta.line || "",
      stats: {
        goals: stat(agg.goals),
        assists: stat(agg.assists),
      },
    });
    writeCache(true);
  }

  writeCache(false);
  console.log(`[api-football] ${spent} request(s) spent this run for ${players.length} player(s).`);
  console.log(`[api-football] wrote cache ${CACHE_DIR}/${cacheName}`);
  return dataset(false);
}

const METRICS = (seasonLabel) => [
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
];
