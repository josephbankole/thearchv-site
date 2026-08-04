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

  const byId = new Map(players.map((p) => [p.id, p]));
  return { ...data, metrics, players, byId };
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
