// The club table's rules (../_shared/clubs.json, archv-clubs/1). The same rules run in node for the
// Wire tagger (scripts/wire/test/clubs.test.mjs), against the same file. Run: `deno test` from this
// dir. No network, no permissions.
import { CLUBS } from "./season.ts";
import clubsTable from "../_shared/clubs.json" with { type: "json" };
import { assert, assertEquals, DETAIL_FIXTURES, SCHEDULES } from "./testkit.ts";

// The favourite-club ids the app has shipped (FavouriteClub.all). A stored favourite must keep working.
const LEGACY_KEYS = [
  "manchester-united", "arsenal", "liverpool", "manchester-city", "chelsea", "tottenham", "newcastle",
  "aston-villa", "real-madrid", "barcelona", "atletico-madrid", "bayern-munich", "borussia-dortmund",
  "paris-saint-germain", "juventus", "ac-milan", "inter-milan", "napoli", "ajax", "celtic", "rangers",
];
const BARE_WORDS = ["United", "City", "Inter", "Milan", "Real", "Athletic", "Sporting", "Rovers", "Wanderers", "Albion", "Villa", "Town", "County"];
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

Deno.test("clubs: the table is archv-clubs/1 and every key is the stable shape", () => {
  assertEquals((clubsTable as { schema: string }).schema, "archv-clubs/1");
  assert(CLUBS.length >= LEGACY_KEYS.length, "has clubs");
  const keys = new Set<string>();
  for (const c of CLUBS) {
    assert(/^[a-z0-9-]{1,40}$/.test(c.key), `key ${c.key}`);
    assert(!keys.has(c.key), `key ${c.key} is unique`);
    keys.add(c.key);
    assert(typeof c.name === "string" && c.name.length > 0, `${c.key} has a name`);
    for (const f of ["aliases", "notWith", "formerKeys", "teamIds"] as const) assert(Array.isArray(c[f]), `${c.key}.${f}`);
  }
});

Deno.test("clubs: all 21 favourite-club keys the app has shipped are present, unchanged", () => {
  const keys = new Set(CLUBS.map((c) => c.key));
  for (const k of LEGACY_KEYS) assert(keys.has(k), `legacy key ${k}`);
});

Deno.test("clubs: no team id under two keys, and every team in the recorded replies has a club", () => {
  const owner = new Map<number, string>();
  for (const c of CLUBS) for (const id of c.teamIds) {
    assert(Number.isInteger(id) && id > 0, `${c.key}: team id ${id}`);
    assert(!owner.has(id), `team ${id} is under ${owner.get(id)} and ${c.key}`);
    owner.set(id, c.key);
  }
  const recorded = [...Object.values(SCHEDULES).flatMap((e) => e.response), ...DETAIL_FIXTURES];
  for (const fx of recorded) {
    for (const t of [fx.teams.home, fx.teams.away]) assert(owner.has(t.id), `${t.name} (${t.id}) has a club`);
  }
});

Deno.test("clubs: no alias is a bare common word, and aliases are unique across clubs", () => {
  const banned = new Set(BARE_WORDS.map(fold));
  const seen = new Map<string, string>();
  for (const c of CLUBS) {
    for (const a of [c.name, ...c.aliases]) {
      assert(!banned.has(fold(a)), `${c.key}: "${a}" is a bare common word`);
      const f = fold(a);
      const other = seen.get(f);
      assert(other === undefined || other === c.key, `"${a}" is claimed by ${other} and ${c.key}`);
      seen.set(f, c.key);
    }
  }
});

Deno.test("clubs: no key is another club's former key", () => {
  const keys = new Set(CLUBS.map((c) => c.key));
  for (const c of CLUBS) {
    for (const f of c.formerKeys) {
      assert(/^[a-z0-9-]{1,40}$/.test(f), `${c.key}: former key ${f}`);
      assert(!keys.has(f), `${c.key}: former key ${f} is a live key`);
    }
  }
});
