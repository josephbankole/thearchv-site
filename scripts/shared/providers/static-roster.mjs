/* static-roster.mjs — the shipped provider. Reads the hand-checked JSON in
   scripts/data/football/ and hands it to the adapter untouched. No network, no cache, no clock:
   a build in six months produces exactly the same pages as a build today, which is what an
   archive publication wants from its own data.

   Point ARCHV_FOOTBALL_ROSTER at a different file to swap seasons without touching code. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_ROSTER = "scripts/data/football/roster-2025-26.json";

export default {
  name: "static",
  async load({ root }) {
    const rel = process.env.ARCHV_FOOTBALL_ROSTER || DEFAULT_ROSTER;
    const path = join(root, rel);
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(path, "utf8"));
    } catch (err) {
      throw new Error(`[static-roster] could not read ${rel}: ${err && err.message ? err.message : err}`);
    }
    assertShape(parsed, rel);
    return parsed;
  },
};

// Fail loud on a malformed roster rather than emitting half a page. A duel card with a missing
// source line is worse than a build that stops, because the card ships and nobody notices.
function assertShape(data, rel) {
  const problems = [];
  if (!data.competition?.label || !data.competition?.season) problems.push("competition.label and competition.season are required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.asOf || "")) problems.push("asOf must be an ISO date");
  if (!Array.isArray(data.metrics) || !data.metrics.length) problems.push("metrics must be a non-empty array");
  if (!Array.isArray(data.players) || data.players.length < 2) problems.push("players must hold at least two entries");

  const sourceIds = new Set(Object.keys(data.sources || {}));
  for (const [id, source] of Object.entries(data.sources || {})) {
    if (!source.name) problems.push(`source ${id} has no name`);
    if (!source.retrieved) problems.push(`source ${id} has no retrieved date`);
  }

  const seenIds = new Set();
  for (const player of data.players || []) {
    if (!player.id) problems.push("a player has no id");
    if (seenIds.has(player.id)) problems.push(`duplicate player id ${player.id}`);
    seenIds.add(player.id);
    if (!player.name) problems.push(`player ${player.id} has no name`);
    if (!player.headAlt) problems.push(`player ${player.id} has no headAlt; every image on this site carries alt text`);
    for (const [metricKey, stat] of Object.entries(player.stats || {})) {
      if (typeof stat.value !== "number") problems.push(`${player.id}.${metricKey} has no numeric value`);
      // The two-source rule, enforced in code rather than trusted to a reviewer.
      if (!Array.isArray(stat.sources) || stat.sources.length < 2) {
        problems.push(`${player.id}.${metricKey} needs at least two named sources`);
      }
      for (const sourceId of stat.sources || []) {
        if (!sourceIds.has(sourceId)) problems.push(`${player.id}.${metricKey} cites unknown source "${sourceId}"`);
      }
    }
  }

  if (problems.length) {
    throw new Error(`[static-roster] ${rel} failed validation:\n  - ${problems.join("\n  - ")}`);
  }
}
