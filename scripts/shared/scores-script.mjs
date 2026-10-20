/* scores-script.mjs: the text of the /scores/ inline client, put together in one place (2026-10-19).

   The client is scripts/shared/scores-client.js. The pure helpers behind the lineups graphic live in
   scripts/shared/scores-pitch.js so node tests can run them (scripts/scores/test/). This splices the
   helpers into the client where its include line stands, inside the client's own function, so the
   page still carries one inline script and adds no global. build-scores-page.mjs hashes exactly the
   text returned here, and the tests read the same text, so what is tested is what ships.

   TEAM COLOURS (2026-10-20). The client's `var TEAM_COLOURS = null; // @team-colours` line is replaced
   with the shirt-colour fallback table, read from the committed scripts/data/team-colours.json (made
   by hand with `npm run team-colours`; never fetched here, trap 0) and cut down to what the page
   draws: { i: { "<team id>": "pp,pn,pb,gp,gn,gb" }, n: { "<name>": <team id> } }, six bare hex
   colours per team (outfield primary, number, border, then the goalkeeper's), "" where there is none.
   Every colour is checked as six hex digits on the way in and a bad one fails the build, naming the
   team. Because the table is part of the returned text, the CSP hash covers it.

   Two rules the text must keep, both checked here so a break fails the build rather than the page:
   - no "</script" anywhere, or the inline element would end early;
   - no "<!--", because verify-csp-pages.mjs strips HTML comments before hashing and would then hash
     something other than what the browser runs, and report a false mismatch.
   The table is written with every "<" escaped as <, so no team name can bring either in. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const PITCH_INCLUDE = "  // @include scores-pitch.js\n";
export const TEAM_COLOURS_LINE = "  var TEAM_COLOURS = null; // @team-colours\n";
export const TEAM_COLOURS_FILE = join("scripts", "data", "team-colours.json");

// The same check as hexColour() in supabase/functions/scores-poll/map.ts and pitchHex() in
// scores-pitch.js: six hex digits, with or without "#". Returned bare and lowercase, for the table.
function bareHex(v) {
  return typeof v === "string" && /^#?[0-9a-f]{6}$/i.test(v) ? v.replace(/^#/, "").toLowerCase() : null;
}

// The compact table the client carries, from the committed JSON. Throws on anything malformed.
export function teamColoursEmbed(root) {
  const file = join(root, TEAM_COLOURS_FILE);
  let doc;
  try {
    doc = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`[scores-script] cannot read ${TEAM_COLOURS_FILE} (run npm run team-colours and commit it): ${e.message}`);
  }
  const bad = (what) => { throw new Error(`[scores-script] ${TEAM_COLOURS_FILE}: ${what}`); };
  if (!doc || doc.schema !== "archv-team-colours/1") bad("schema is not archv-team-colours/1");
  if (!doc.byId || typeof doc.byId !== "object" || !doc.byName || typeof doc.byName !== "object") bad("byId and byName must be objects");

  // One shirt as three parts. A shirt must have a primary; number and border may be null, never junk.
  const parts = (kit, who, optional) => {
    if (kit == null && optional) return ["", "", ""];
    if (!kit || typeof kit !== "object") bad(`${who} is not a shirt`);
    const p = bareHex(kit.primary);
    if (!p) bad(`${who}.primary is not six hex digits`);
    return [p, ...["number", "border"].map((k) => {
      if (kit[k] == null) return "";
      return bareHex(kit[k]) || bad(`${who}.${k} is not six hex digits`);
    })];
  };
  const i = {};
  for (const id of Object.keys(doc.byId)) {
    if (!/^[1-9]\d*$/.test(id)) bad(`byId key ${JSON.stringify(id)} is not a team id`);
    const e = doc.byId[id];
    i[id] = [...parts(e && e.player, `byId.${id}.player`, false), ...parts(e && e.goalkeeper, `byId.${id}.goalkeeper`, true)].join(",");
  }
  const n = {};
  for (const name of Object.keys(doc.byName)) {
    if (!name || name === "__proto__" || name !== name.trim()) bad(`byName key ${JSON.stringify(name)} is not a usable name`);
    const e = doc.byName[name];
    const id = e && Number.isInteger(e.id) ? String(e.id) : null;
    if (!id || !Object.prototype.hasOwnProperty.call(i, id)) bad(`byName.${name} points at no byId entry`);
    // The name map carries the same colours as the id it names; a mismatch means a hand edit went wrong.
    const same = [...parts(e.player, `byName.${name}.player`, false), ...parts(e.goalkeeper, `byName.${name}.goalkeeper`, true)].join(",");
    if (same !== i[id]) bad(`byName.${name} disagrees with byId.${id}`);
    n[name] = Number(id);
  }
  return { i, n };
}

export function scoresClientSource(root) {
  const client = readFileSync(join(root, "scripts", "shared", "scores-client.js"), "utf8");
  const pitch = readFileSync(join(root, "scripts", "shared", "scores-pitch.js"), "utf8");
  const lines = client.split(TEAM_COLOURS_LINE);
  if (lines.length !== 2) {
    throw new Error(`[scores-script] scores-client.js must hold the line ${JSON.stringify(TEAM_COLOURS_LINE)} exactly once (found ${lines.length - 1}).`);
  }
  // One line of JSON (stringify escapes every newline), so it cannot hold the include line below.
  const json = JSON.stringify(teamColoursEmbed(root)).replace(/</g, "\\u003c");
  const parts = lines.join(`  var TEAM_COLOURS = ${json};\n`).split(PITCH_INCLUDE);
  if (parts.length !== 2) {
    throw new Error(`[scores-script] scores-client.js must hold the line ${JSON.stringify(PITCH_INCLUDE)} exactly once (found ${parts.length - 1}).`);
  }
  const source = parts[0] + pitch + parts[1];
  if (/<\/script/i.test(source)) {
    throw new Error("[scores-script] the scores client contains a closing script tag; it would end the inline element early.");
  }
  if (source.includes("<!--")) {
    throw new Error("[scores-script] the scores client contains '<!--'; verify-csp-pages.mjs strips comments before hashing and would mis-hash it.");
  }
  return source;
}
