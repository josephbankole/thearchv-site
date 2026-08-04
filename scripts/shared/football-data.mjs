/* scripts/shared/football-data.mjs — THE DATA SEAM for the duel system.
 *
 * Every consumer (build-duel-pages.mjs, build-content.mjs's sitemap, anything the carousel work
 * adds later) imports from HERE and never touches a JSON file or an HTTP endpoint directly. That
 * is the whole point: the day a paid football data key lands, the only file that changes is the
 * provider it selects, and nothing downstream notices.
 *
 * SELECTING A PROVIDER
 *   ARCHV_FOOTBALL_PROVIDER=static        (default) reads scripts/data/football/roster-*.json
 *   ARCHV_FOOTBALL_PROVIDER=api-football  reads the API-Football cache, filling it on a miss
 *
 * THE PROVIDER CONTRACT — a provider is a module with a default export exposing:
 *   async load() -> {
 *     competition: { key, label, season, scopeNote },
 *     asOf:        "YYYY-MM-DD",
 *     omitted:     [{ metric, reason }],          // metrics deliberately not shipped, and why
 *     sources:     { <id>: { name, detail, url, published?, retrieved } },
 *     metrics:     [{ key, label, short, higherIsBetter, derived?, decimals?, blurb }],
 *     players:     [{ id, name, sortName, club, position, nationality, head, headAlt, line,
 *                     stats: { <metricKey>: { value, sources: [<id>], leagueRank?, ... } } }],
 *   }
 * Anything a provider cannot supply it simply omits, with a row in `omitted` saying so. A missing
 * metric renders as an absence on the page rather than a zero, because a zero is a claim.
 *
 * WHY THE SHIPPED DEFAULT IS STATIC. The API-Football free plan only serves seasons 2022 to 2024;
 * a 2025/26 request comes back "Free plans do not have access to this season". So the current
 * season is hand-checked against two named sources apiece and committed as JSON. See the header
 * comment in scripts/data/football/roster-2025-26.json for what was dropped and why.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import staticProvider from "./providers/static-roster.mjs";
import apiFootballProvider from "./providers/api-football.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const PROVIDERS = {
  static: staticProvider,
  "api-football": apiFootballProvider,
};

const PROVIDER_NAME = process.env.ARCHV_FOOTBALL_PROVIDER || "static";
const provider = PROVIDERS[PROVIDER_NAME];
if (!provider) {
  throw new Error(
    `[football-data] unknown provider "${PROVIDER_NAME}". Known: ${Object.keys(PROVIDERS).join(", ")}`,
  );
}

let cached = null;

/** The whole dataset, normalised and validated. Loaded once per process. */
export async function loadDataset() {
  if (cached) return cached;
  const raw = await provider.load({ root: ROOT, readFileSync });
  cached = normalise(raw);
  return cached;
}

/* ---------- normalisation: derived metrics, ranks, and the guards ---------- */

function normalise(data) {
  const metrics = data.metrics || [];
  const players = (data.players || []).map((p) => ({ ...p, stats: { ...p.stats } }));

  // Derived metrics are computed here, once, so every consumer sees the same arithmetic and no
  // page reimplements it. `derived` is a tiny expression over the other metric keys, deliberately
  // limited to the two shapes the data actually uses rather than a general evaluator.
  for (const metric of metrics) {
    if (!metric.derived) continue;
    for (const player of players) {
      if (player.stats[metric.key]) continue; // an explicit value always wins
      const computed = computeDerived(metric, player.stats);
      if (computed !== null) player.stats[metric.key] = computed;
    }
  }

  // Rank within the seeded pool, per metric. Honest by construction: the pool is exactly the
  // players in this dataset and the label says so, rather than implying a league-wide percentile
  // the static layer cannot see. When a live provider supplies a real pool, it sets `leagueRank`
  // and `poolSize` on the stat and the page prefers those.
  for (const metric of metrics) {
    const rated = players
      .filter((p) => p.stats[metric.key] && typeof p.stats[metric.key].value === "number")
      .sort((a, b) =>
        metric.higherIsBetter
          ? b.stats[metric.key].value - a.stats[metric.key].value
          : a.stats[metric.key].value - b.stats[metric.key].value,
      );
    // Competition ranking: equal values share a rank, and the next rank skips accordingly.
    let lastValue = null;
    let lastRank = 0;
    rated.forEach((player, index) => {
      const value = player.stats[metric.key].value;
      const rank = value === lastValue ? lastRank : index + 1;
      lastValue = value;
      lastRank = rank;
      player.stats[metric.key].rosterRank = rank;
      player.stats[metric.key].rosterSize = rated.length;
    });
  }

  assertHeadKitsMatchClubs(players);

  const byId = new Map(players.map((p) => [p.id, p]));
  return { ...data, metrics, players, byId };
}

/* ---------- the kit guard (founder ruling 2026-08-04) ---------- */

// The headshot bank was built for the World Cup lane, so most banked faces wear a NATIONAL kit.
// Correct there, wrong the moment one sits on a duel card under a CLUB name: Erling Haaland in
// Norway red beside "Manchester City", Raul Jimenez in Mexico green beside "Fulham". No crest, no
// mark, no photograph, so nothing in the art doctrine objects. The cost is credibility — a
// Manchester City card showing red invites the reader to doubt the numbers printed beside it,
// which is the opposite of what the two-source rule is bought with.
//
// The test is colour compatibility, not ownership. Bruno Fernandes stays as banked because
// Portugal red really is Manchester United red; he clears on the merits rather than as an
// exception.
//
// A head with no registry row FAILS. Every one of the defects above was, at the moment it
// rendered, a head nobody had checked.
//
// THE REGISTRY LIVES IN THIS REPO, at scripts/data/football/head-kits.json, and it must stay here.
// It first shipped at match-covers/carousel/head-kits.json, one directory up and outside the repo,
// which resolved on a laptop where the workspace and the checkout sit side by side and failed the
// moment CI ran: Actions checks out thearchv-site alone, so the build died on ENOENT after Vite had
// already succeeded. The carousel reads this same file through a symlink, so all three surfaces
// still share one copy and cannot disagree. Same lesson as canon D-2026-08-04d: a path that only
// resolves on one machine is a broken path that has not been caught yet.
let kitRegistry = null;

function loadKitRegistry() {
  if (kitRegistry) return kitRegistry;
  const p = join(ROOT, "scripts", "data", "football", "head-kits.json");
  kitRegistry = JSON.parse(readFileSync(p, "utf8"));
  return kitRegistry;
}

function normLabel(s) {
  return String(s || "").toUpperCase().replace(/&/g, " AND ")
    .replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

function assertHeadKitsMatchClubs(players) {
  const reg = loadKitRegistry();
  const aliases = Object.fromEntries(
    Object.entries(reg.colour_aliases || {}).map(([k, v]) => [k.toLowerCase(), String(v).toLowerCase()]),
  );
  const colour = (c) => {
    const v = normLabel(c).toLowerCase();
    return aliases[v] || v;
  };

  // Registry keys run through the SAME normaliser as the incoming club name. They are written as
  // a human writes them ("PARIS SAINT-GERMAIN") and the normaliser drops the hyphen, so a raw
  // lookup misses on exactly the fixture this guard was written for.
  const clubsNorm = Object.fromEntries(
    Object.entries(reg.clubs || {}).map(([k, v]) => [normLabel(k), v]),
  );

  const problems = [];
  for (const p of players) {
    if (!p.head || !p.club) continue;
    const key = String(p.head).split("/").pop().replace(/\.[a-z0-9]+$/i, "");
    const head = (reg.heads || {})[key];
    const club = clubsNorm[normLabel(p.club)];

    if (!head) {
      problems.push(
        `${p.name}: head "${p.head}" has no row in head-kits.json, so its kit colour is unknown ` +
        `and it cannot be cleared against "${p.club}". Open it as an image, read the shirt, and ` +
        `add a "${key}" row.`,
      );
      continue;
    }
    if (!club) {
      problems.push(
        `${p.name}: club "${p.club}" has no row in head-kits.json, so ${head.kit} cannot be ` +
        `cleared against it. Add a "${normLabel(p.club)}" row listing BODY colours only, never trim.`,
      );
      continue;
    }
    const allowed = (club.colours || []).map(colour);
    const hc = colour(head.kit);
    // A compound kit ("red and blue") clears a club playing in either.
    const ok = [...hc.split(" and "), hc].some((c) => allowed.includes(c.trim()));
    if (!ok) {
      problems.push(
        `${p.name}: head "${p.head}" is banked in ${String(head.kit).toUpperCase()} ` +
        `(${head.kit_hex}), the kit of ${head.kit_of || "no club or nation on record"}, but the ` +
        `card labels him ${p.club}, which plays in ${allowed.join(", ").toUpperCase()}. ` +
        `Use a head in the club's own colours, or change the label.`,
      );
    }
  }

  if (problems.length) {
    throw new Error(
      "[football-data] KIT GUARD FAILED — a headshot contradicts the club label beside it " +
      "(founder ruling 2026-08-04):\n  - " + problems.join("\n  - "),
    );
  }
}

function computeDerived(metric, stats) {
  const parts = String(metric.derived).split("+").map((s) => s.trim());
  if (parts.length > 1 && parts.every((k) => stats[k] && typeof stats[k].value === "number")) {
    return {
      value: parts.reduce((sum, k) => sum + stats[k].value, 0),
      sources: [...new Set(parts.flatMap((k) => stats[k].sources || []))],
      calculated: true,
    };
  }
  const ratio = String(metric.derived).match(/^\(?([a-zA-Z]+)\s*\+\s*([a-zA-Z]+)\)?\s*\/\s*([a-zA-Z]+)$/);
  if (ratio) {
    const [, a, b, d] = ratio;
    if (stats[a] && stats[b] && stats[d] && stats[d].value) {
      return {
        value: (stats[a].value + stats[b].value) / stats[d].value,
        sources: [...new Set([...(stats[a].sources || []), ...(stats[b].sources || []), ...(stats[d].sources || [])])],
        calculated: true,
      };
    }
  }
  return null;
}

/* ---------- the read API every consumer uses ---------- */

export async function listPlayers() {
  return (await loadDataset()).players;
}

export async function getPlayer(id) {
  return (await loadDataset()).byId.get(id) || null;
}

export async function getMetrics() {
  return (await loadDataset()).metrics;
}

export async function getSources() {
  return (await loadDataset()).sources;
}

/** A stable, order-independent slug for a pair: ids sorted, joined with "-v-". */
export function pairSlug(idA, idB) {
  return [idA, idB].sort().join("-v-");
}

/** Every unordered pair in the roster, as { a, b, slug, href }. Drives the pages and the sitemap. */
export async function listPairs() {
  const players = await listPlayers();
  const pairs = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const [a, b] = [players[i], players[j]].sort((x, y) => (x.id < y.id ? -1 : 1));
      const slug = pairSlug(a.id, b.id);
      pairs.push({ a, b, slug, href: `/duel/${slug}/` });
    }
  }
  return pairs.sort((x, y) => (x.slug < y.slug ? -1 : 1));
}

/** Which of two players wins a metric, or "tie". Never guesses: an absent value means no verdict. */
export function compareStat(metric, statA, statB) {
  if (!statA || !statB || typeof statA.value !== "number" || typeof statB.value !== "number") return null;
  if (statA.value === statB.value) return "tie";
  const aWins = metric.higherIsBetter ? statA.value > statB.value : statA.value < statB.value;
  return aWins ? "a" : "b";
}

/** Format a stat value for display, honouring the metric's decimal preference. */
export function formatValue(metric, value) {
  if (typeof value !== "number") return "—";
  const decimals = metric.decimals ?? 0;
  return value.toFixed(decimals);
}

export const providerName = PROVIDER_NAME;
