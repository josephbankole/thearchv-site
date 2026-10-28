import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CLUBS, tagClubs, fold } from "../lib/clubs.mjs";

/* The club table rules (spec A2.8). The Deno clubs_test.ts in scores-poll checks the same file the
   same way; this copy runs in `npm run build`, so a bad edit to clubs.json fails the site build. */

// FavouriteClub.all in the app since 1.4: a stored favourite must keep resolving (A2.8a).
const LEGACY = ["manchester-united", "arsenal", "liverpool", "manchester-city", "chelsea", "tottenham", "newcastle",
  "aston-villa", "real-madrid", "barcelona", "atletico-madrid", "bayern-munich", "borussia-dortmund",
  "paris-saint-germain", "juventus", "ac-milan", "inter-milan", "napoli", "ajax", "celtic", "rangers"];
const BARE = ["United", "City", "Inter", "Milan", "Real", "Athletic", "Sporting", "Rovers", "Wanderers", "Albion", "Villa", "Town", "County"];
const FIXTURES = fileURLToPath(new URL("../../../supabase/functions/scores-poll/fixtures/", import.meta.url));

// Every home and away team id in an API-Football reply.
function teamIds(x, out = new Set()) {
  if (Array.isArray(x)) for (const v of x) teamIds(v, out);
  else if (x && typeof x === "object") {
    for (const side of ["home", "away"]) if (Number.isInteger(x.teams?.[side]?.id)) out.add(x.teams[side].id);
    for (const v of Object.values(x)) teamIds(v, out);
  }
  return out;
}

test("the club table is archv-clubs/1 and keeps every legacy app key", () => {
  assert.equal(CLUBS.schema, "archv-clubs/1");
  const keys = CLUBS.clubs.map((c) => c.key);
  for (const k of LEGACY) assert.ok(keys.includes(k), k);
  assert.equal(new Set(keys).size, keys.length, "keys are unique");
  for (const k of keys) assert.match(k, /^[a-z0-9-]{1,40}$/);
});

test("no team id under two keys, and every team in the recorded fixtures maps to a key", () => {
  const owner = new Map();
  for (const c of CLUBS.clubs) for (const id of c.teamIds || []) {
    assert.ok(!owner.has(id), `team ${id} under ${owner.get(id)} and ${c.key}`);
    owner.set(id, c.key);
  }
  const files = readdirSync(FIXTURES).filter((f) => /^(schedule|detail)-.*\.json$/.test(f));
  assert.equal(files.filter((f) => f.startsWith("schedule-")).length, 3);
  assert.equal(files.filter((f) => f.startsWith("detail-")).length, 5);
  for (const f of files) {
    for (const id of teamIds(JSON.parse(readFileSync(FIXTURES + f, "utf8")))) assert.ok(owner.has(id), `${f}: team ${id} has no club key`);
  }
});

test("aliases are never a bare common word and are unique across clubs; formerKeys never name another club", () => {
  const bare = new Set(BARE.map(fold));
  const owner = new Map();
  const keys = new Set(CLUBS.clubs.map((c) => c.key));
  for (const c of CLUBS.clubs) {
    for (const a of [c.name, ...(c.aliases || [])]) {
      const f = fold(a);
      assert.ok(!bare.has(f), `${c.key}: "${a}" is a bare common word`);
      assert.ok(!owner.has(f) || owner.get(f) === c.key, `"${a}" under ${owner.get(f)} and ${c.key}`);
      owner.set(f, c.key);
    }
    for (const k of c.formerKeys || []) assert.ok(!keys.has(k), `${c.key}: formerKey ${k} is another club's key`);
  }
});

test("headline vectors: whole words, folded, and the namesakes cancelled", () => {
  const tags = (h) => tagClubs(h);
  assert.deepEqual(tags("Man Utd sack manager"), ["manchester-united"]);
  assert.ok(!tags("Leeds United win").includes("manchester-united"));
  assert.deepEqual(tags("Inter Miami draw again"), []);
  assert.deepEqual(tags("Barça held at home"), ["barcelona"]);
  assert.deepEqual(tags("Barca held at home"), ["barcelona"]);
  assert.deepEqual(tags("Ajaxian midfield in focus"), []);
  assert.deepEqual(tags("Queens Park Rangers promoted"), []);
  assert.deepEqual(tags("Newcastle Jets sign striker"), []);
  assert.deepEqual(tags("Liverpool Montevideo stay top"), []);
  assert.deepEqual(tags("Barcelona SC win the derby"), []);
  assert.deepEqual(tags("Arsenal de Sarandí appoint coach"), []);
  // A namesake does not cancel the real club in the same headline, and the result is sorted.
  assert.deepEqual(tags("Arsenal scout Arsenal de Sarandí forward"), ["arsenal"]);
  assert.deepEqual(tags("Liverpool and Man City meet at Anfield"), ["liverpool", "manchester-city"]);
  // A possessive and a curly apostrophe still count; case does not matter.
  assert.deepEqual(tags("MAN UTD’S keeper out"), ["manchester-united"]);
  assert.deepEqual(tags("Bodo/Glimt stun Manchester City"), ["bodo-glimt", "manchester-city"]);
  assert.deepEqual(tags(""), []);
});
