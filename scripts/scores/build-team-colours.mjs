/* build-team-colours.mjs: the shirt-colour fallback table behind the lineups pitch on /scores/ (2026-10-20).

   MANUAL. Run `npm run team-colours`, look at the diff, commit scripts/data/team-colours.json. It is
   NOT in the build chain and must never be: it reads the network, and trap 0 forbids build-time reads
   from outside the repo. The build only reads the committed JSON (scripts/shared/scores-script.mjs).

   Why it exists. The pitch fills each shirt with the team's API-Football colours from the match file
   (lineups.<side>.colors). The API never sends colours for the WSL, and not for some clubs at all
   (FC Porto), so those sides drew neutral shirts. This table holds, per team id, the colours that team
   wore most often as the HOME side across every match file in the public bucket (any appearance when it
   never had colours at home), plus a byName map built only from Premier League and Champions League
   teams. The site strips the API's " W", so a WSL club is named like its men's club ("Chelsea") and
   picks up those colours by name. The values are API-Football's own, copied, never ours.

   Reads only the public files: live/days/index.json, each days/<date>.json, and each match file a
   match names in `detail`. Public reads, no API key, no API-Football quota. Node's fetch (Python 3.14
   on this machine has a broken CA bundle). Any read that fails after retries stops the run with
   nothing written, so a network blip can never shrink the committed table. */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const OUT = join(ROOT, "scripts", "data", "team-colours.json");
export const BASE = "https://fpsfnhjxczzyqurzbqpt.supabase.co/storage/v1/object/public/live/";
// Only these competitions feed byName. Their clubs are the men's sides a WSL club is named after.
const NAMED = new Set(["premier-league", "champions-league"]);
// Names the WSL spells differently from the men's side in the same feed. The colours still come from
// that Premier League team's own entry; this only says which entry. Applied only when the alias has
// no entry of its own and the target name has one.
export const ALIASES = { "Tottenham Hotspur": "Tottenham" };

export const NOTE =
  "Shirt colours as API-Football sends them in team.colors, copied from the public live/ match files. " +
  "These are API-Football's own colours, not ours. byId: per team id, the colours that team wore most " +
  "often as the home side (any appearance when it never had colours at home). byName: Premier League and " +
  "Champions League teams only, so a WSL side named like its men's club takes those colours. /scores/ uses " +
  "this only when a match file has no colours of its own. Refresh: npm run team-colours, then commit.";

// One colour: six hex digits, with or without "#", as lowercase "#rrggbb", else null. The same check as
// hexColour() in supabase/functions/scores-poll/map.ts and pitchHex() in scripts/shared/scores-pitch.js.
export function hexColour(v) {
  return typeof v === "string" && /^#?[0-9a-f]{6}$/i.test(v) ? `#${v.replace(/^#/, "").toLowerCase()}` : null;
}

// One shirt, or null when it has no usable primary colour (the mapper's kitOf()).
export function kitOf(v) {
  const o = v && typeof v === "object" ? v : null;
  const primary = hexColour(o?.primary);
  return primary ? { primary, number: hexColour(o?.number), border: hexColour(o?.border) } : null;
}

// A lineup's colours as the table keeps them, or null when there is no outfield shirt (the fallback is
// for the outfield first; a goalkeeper-only set cannot fill it).
export function coloursOf(c) {
  const o = c && typeof c === "object" ? c : null;
  const player = kitOf(o?.player);
  return player ? { player, goalkeeper: kitOf(o?.goalkeeper) } : null;
}

// The table from the day files' matches and the match files they point at.
// matches: MATCH objects (archv-day/1), files: { [detail]: archv-match/1 file }.
export function buildTable(matches, files) {
  const teams = new Map(); // id -> { name, comps:Set, home:Map(key->tally), any:Map(key->tally) }
  const seenMatch = new Set();
  const tally = (map, key, colours, kickoff) => {
    const t = map.get(key) || { n: 0, last: "", colours };
    t.n++;
    if (kickoff > t.last) t.last = kickoff;
    map.set(key, t);
  };
  let withColours = 0;
  for (const m of matches) {
    if (!m || seenMatch.has(m.id)) continue;
    seenMatch.add(m.id);
    for (const side of ["home", "away"]) {
      const team = m[side];
      if (!team || !(team.id > 0) || typeof team.name !== "string") continue;
      const rec = teams.get(team.id) || { name: team.name, comps: new Set(), home: new Map(), any: new Map() };
      rec.comps.add(m.competition?.key);
      teams.set(team.id, rec);
      const f = m.detail ? files[m.detail] : null;
      const colours = coloursOf(f?.lineups?.[side]?.colors);
      if (!colours) continue;
      withColours++;
      const key = JSON.stringify(colours);
      const kickoff = typeof m.kickoff === "string" ? m.kickoff : "";
      tally(rec.any, key, colours, kickoff);
      if (side === "home") tally(rec.home, key, colours, kickoff);
    }
  }
  // Most often wins; a tie goes to the more recent match, then to the key, so a rerun is stable.
  const pick = (map) => [...map.entries()].sort(([ka, a], [kb, b]) => b.n - a.n || (b.last > a.last ? 1 : b.last < a.last ? -1 : 0) || (ka < kb ? -1 : ka > kb ? 1 : 0))[0][1];

  const byId = {};
  const neutral = [];
  for (const id of [...teams.keys()].sort((a, b) => a - b)) {
    const rec = teams.get(id);
    const comps = [...rec.comps].filter(Boolean).sort();
    if (!rec.any.size) { neutral.push({ id, name: rec.name, competitions: comps }); continue; }
    const from = rec.home.size ? "home" : "any";
    const t = pick(rec.home.size ? rec.home : rec.any);
    byId[id] = { name: rec.name, competitions: comps, from, seen: t.n, player: t.colours.player, goalkeeper: t.colours.goalkeeper };
  }

  // byName: Premier League and Champions League teams only. A name two coloured teams share is left out.
  const named = new Map();
  const clash = new Set();
  for (const [id, e] of Object.entries(byId)) {
    if (!e.competitions.some((c) => NAMED.has(c))) continue;
    if (e.name === "__proto__") continue;
    if (named.has(e.name) && named.get(e.name) !== Number(id)) clash.add(e.name);
    else named.set(e.name, Number(id));
  }
  for (const n of clash) named.delete(n);
  for (const [alias, target] of Object.entries(ALIASES)) {
    if (!named.has(alias) && named.has(target)) named.set(alias, named.get(target));
  }
  const byName = {};
  for (const n of [...named.keys()].sort()) {
    const id = named.get(n);
    byName[n] = { id, player: byId[id].player, goalkeeper: byId[id].goalkeeper };
  }
  return { byId, byName, neutral, clashes: [...clash].sort(), matches: seenMatch.size, withColours };
}

async function getJson(path, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${BASE}${path}?cb=${Date.now()}`);
      if (r.status === 200) return await r.json();
      last = new Error(`HTTP ${r.status}`);
    } catch (e) {
      last = e;
    }
    await new Promise((res) => setTimeout(res, 500 * (i + 1)));
  }
  throw new Error(`[team-colours] could not read ${path}: ${last && last.message}`);
}

// Runs fn over items, n at a time.
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let at = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (at < items.length) { const i = at++; out[i] = await fn(items[i]); }
  }));
  return out;
}

async function main() {
  const index = await getJson("days/index.json");
  const days = (Array.isArray(index?.days) ? index.days : []).map((d) => d && d.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d || ""));
  if (!days.length) throw new Error("[team-colours] days/index.json lists no days");
  const dayFiles = await pool(days, 6, (d) => getJson(`days/${d}.json`));
  const matches = dayFiles.flatMap((f) => (Array.isArray(f?.matches) ? f.matches : []));
  const details = [...new Set(matches.map((m) => m && m.detail).filter((p) => /^match\/\d+\.json$/.test(p || "")))];
  const read = await pool(details, 8, (p) => getJson(p));
  const files = Object.fromEntries(details.map((p, i) => [p, read[i]]));
  const t = buildTable(matches, files);

  const doc = {
    schema: "archv-team-colours/1",
    note: NOTE,
    source: {
      bucket: BASE,
      days: days.length,
      matches: t.matches,
      matchFiles: details.length,
      sidesWithColours: t.withColours,
      aliases: ALIASES,
    },
    generatedAt: new Date().toISOString(),
    byId: t.byId,
    byName: t.byName,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(doc, null, 2) + "\n");
  console.log(`[team-colours] ${days.length} days, ${t.matches} matches, ${details.length} match files, ${t.withColours} sides with colours`);
  console.log(`[team-colours] byId ${Object.keys(t.byId).length} teams, byName ${Object.keys(t.byName).length} names -> ${OUT}`);
  if (t.clashes.length) console.log(`[team-colours] left out of byName (two teams, one name): ${t.clashes.join(", ")}`);
  console.log(`[team-colours] never coloured by the API (${t.neutral.length}): ${t.neutral.map((n) => `${n.name} [${n.id}, ${n.competitions.join("/")}]`).join(", ")}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message || e); process.exit(1); });
}
