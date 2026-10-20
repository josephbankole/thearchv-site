// Tests for the /scores/ lineups helpers (scripts/shared/scores-pitch.js) and the spliced client text
// (scripts/shared/scores-script.mjs). node:test, no network. Run: npm run test:scores (part of build).
//
// Fixtures: fixtures/match-1607701.json is the live archv-match/1 file for Chelsea 6-2 Tottenham
// Hotspur (WSL, 18 Oct 2026) as published before grid, ids and colours were stored, read from the
// public bucket on 19 Oct 2026. The raw API-Football replies under supabase/functions/scores-poll/
// fixtures/ carry the API's grid, which checks the formation fallback against the real positions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { scoresClientSource, PITCH_INCLUDE } from "../../shared/scores-script.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const PITCH_SRC = readFileSync(join(ROOT, "scripts", "shared", "scores-pitch.js"), "utf8");
const CLIENT_SRC = readFileSync(join(ROOT, "scripts", "shared", "scores-client.js"), "utf8");
const LIVE = JSON.parse(readFileSync(join(ROOT, "scripts", "scores", "test", "fixtures", "match-1607701.json"), "utf8"));
const RAW_DIR = join(ROOT, "supabase", "functions", "scores-poll", "fixtures");
const RAW = ["premier-league-finished", "champions-league-live", "champions-league-finished", "wsl-finished", "champions-league-final-pens"]
  .map((n) => JSON.parse(readFileSync(join(RAW_DIR, `detail-${n}.json`), "utf8")).response[0]);

// The helpers, loaded the way the page runs them: plain function declarations in one scope.
const ctx = vm.createContext({});
vm.runInContext(PITCH_SRC, ctx);
const { pitchHex, pitchContrast, pitchKit, pitchFormation, pitchRows, pitchRating, pitchOneDp, pitchShare } = ctx;
// vm results come from another realm, so compare through JSON.
const plain = (v) => JSON.parse(JSON.stringify(v));
const names = (rows) => plain(rows.map((r) => r.map((p) => p.name)));

const PAL = { ground: "#f4f1ea", dark: "#1e223d", light: "#ffffff", edge: "#4c5176" };

// A raw API lineup entry in the archv-match/1 shape, with or without the grid.
const asLineup = (e, withGrid) => ({
  formation: e.formation,
  coach: e.coach && e.coach.name,
  startXI: e.startXI.map(({ player: p }) => ({ name: p.name, number: p.number, pos: p.pos, id: p.id || null, grid: withGrid ? p.grid : null })),
  subs: e.substitutes.map(({ player: p }) => ({ name: p.name, number: p.number, pos: p.pos, id: p.id || null, grid: null })),
});

// ---------- the client text ----------

test("client: the include line is replaced by the helpers, and the result parses as one script", () => {
  const src = scoresClientSource(ROOT);
  assert.equal(src.includes(PITCH_INCLUDE), false);
  assert.ok(src.includes("function pitchRows("));
  assert.doesNotThrow(() => new vm.Script(src));
  assert.equal(/<\/script/i.test(src), false);
  assert.equal(src.includes("<!--"), false);
  assert.ok(src.startsWith("(function () {") && src.trimEnd().endsWith("})();"), "still one IIFE, no global");
});

test("client: every helper is named pitch*, and none clashes with a function in the client", () => {
  const decl = (s) => new Set([...s.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]));
  const helpers = decl(PITCH_SRC);
  const client = decl(CLIENT_SRC);
  assert.ok(helpers.size >= 8);
  for (const n of helpers) {
    assert.ok(n.startsWith("pitch"), n);
    assert.equal(client.has(n), false, `${n} is declared in both files`);
  }
});

test("client: no new element carries data-id, which the row toggle and ?match= look up", () => {
  // Only row() sets it; the panels, tabs and pitch use ids and classes.
  const sets = [...CLIENT_SRC.matchAll(/setAttribute\('data-id'/g)];
  assert.equal(sets.length, 1);
  assert.equal(/data-id/.test(PITCH_SRC), false);
});

test("scoresClientSource refuses a missing include line, a closing script tag and a comment opener", () => {
  const dir = mkdtempSync(join(tmpdir(), "scores-script-"));
  try {
    mkdirSync(join(dir, "scripts", "shared"), { recursive: true });
    const put = (client, pitch) => {
      writeFileSync(join(dir, "scripts", "shared", "scores-client.js"), client);
      writeFileSync(join(dir, "scripts", "shared", "scores-pitch.js"), pitch);
    };
    put(CLIENT_SRC, PITCH_SRC);
    assert.equal(scoresClientSource(dir), scoresClientSource(ROOT));
    put(CLIENT_SRC.replace(PITCH_INCLUDE, ""), PITCH_SRC);
    assert.throws(() => scoresClientSource(dir), /exactly once/);
    put(CLIENT_SRC + PITCH_INCLUDE, PITCH_SRC);
    assert.throws(() => scoresClientSource(dir), /exactly once/);
    put(CLIENT_SRC, PITCH_SRC + "\n  var x = '</scr' + 'ipt>'.length; // '</script>'\n");
    assert.throws(() => scoresClientSource(dir), /closing script tag/);
    put(CLIENT_SRC, PITCH_SRC + "\n  var y = '<!--';\n");
    assert.throws(() => scoresClientSource(dir), /<!--/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- layout ----------

test("formation: dash-separated whole numbers only", () => {
  assert.deepEqual(plain(pitchFormation("4-2-3-1")), [4, 2, 3, 1]);
  assert.deepEqual(plain(pitchFormation("3-5-2")), [3, 5, 2]);
  for (const bad of [null, "", "4", "4-x-2", "4-0-2", "4--2", " 4-4-2", "4-4-2 ", 442]) {
    assert.equal(pitchFormation(bad), null, String(bad));
  }
});

test("rows, formation fallback: the live Chelsea v Tottenham file, which has no grid", () => {
  const home = pitchRows(LIVE.lineups.home);
  const away = pitchRows(LIVE.lineups.away);
  assert.equal(home.how, "formation");
  assert.equal(away.how, "formation");
  // 4-1-2-1-2. Each line runs from the team's left: McCabe (left back) first, Carpenter (right back) last.
  assert.deepEqual(names(home.rows), [
    ["H. Hampton"],
    ["K. McCabe", "L. Bronze", "K. Buchanan", "E. Carpenter"],
    ["L. Potter"],
    ["A. Thompson", "W. Kaptein"],
    ["K. Walsh"],
    ["L. James", "M. Malard"],
  ]);
  // 4-2-3-1
  assert.deepEqual(names(away.rows), [
    ["Lize Kop"],
    ["J. Blakstad", "Amanda Nildén", "T. Koga", "Ella morris"],
    ["D. Spence", "S. Gaupset"],
    ["O. Holdt", "V. Pelova", "M. Vinberg"],
    ["C. Tandberg"],
  ]);
  assert.equal(home.rows.flat().length, 11);
});

test("rows, grid: grouped by row and sorted by column, keeper first", () => {
  const liverpool = RAW[0].lineups.find((e) => e.team.id === 40);
  const laid = pitchRows(asLineup(liverpool, true));
  assert.equal(laid.how, "grid");
  assert.deepEqual(names(laid.rows), [
    ["Alisson"],
    ["M. Kerkez", "V. van Dijk", "J. Jacquet", "R. Araujo"],
    ["A. Mac Allister", "R. Gravenberch"],
    ["B. Barcola", "F. Wirtz", "V. Munoz"],
    ["L. Koumas"],
  ]);
});

test("rows: the formation fallback puts every recorded starter where the API's grid does", () => {
  let checked = 0;
  for (const fx of RAW) {
    for (const e of fx.lineups) {
      const byGrid = pitchRows(asLineup(e, true));
      const byFormation = pitchRows(asLineup(e, false));
      assert.equal(byGrid.how, "grid");
      assert.equal(byFormation.how, "formation", `${e.team.name} ${e.formation}`);
      assert.deepEqual(names(byFormation.rows), names(byGrid.rows), `${e.team.name} ${e.formation}`);
      checked++;
    }
  }
  assert.equal(checked, 10);
});

test("rows: a bad or repeated grid falls back to the formation; with neither, no pitch (the page lists names)", () => {
  const liverpool = asLineup(RAW[0].lineups.find((e) => e.team.id === 40), true);
  const dup = structuredClone(liverpool);
  dup.startXI[2].grid = dup.startXI[1].grid;
  assert.equal(pitchRows(dup).how, "formation");
  const junk = structuredClone(liverpool);
  junk.startXI[5].grid = "3:1; color: red";
  assert.equal(pitchRows(junk).how, "formation");

  const off = structuredClone(LIVE.lineups.away);
  off.formation = "4-4-2-1"; // adds up to 11 outfield players, not 10
  assert.equal(pitchRows(off), null);
  const keeperless = structuredClone(LIVE.lineups.away);
  keeperless.startXI[0].pos = "D";
  assert.equal(pitchRows(keeperless), null); // first starter is not a keeper
  // Positions alone would put two midfield lines in one row: Liverpool's 4-2-3-1 with no grid and no
  // formation would stand Munoz (right wing) in the centre and Mac Allister (left of the pair) right of it.
  assert.equal(pitchRows({ ...liverpool, formation: null, startXI: liverpool.startXI.map((p) => ({ ...p, grid: null })) }), null);
  assert.equal(pitchRows({ startXI: [] }), null);
  assert.equal(pitchRows(null), null);
});

// ---------- colours ----------

test("hex: six hex digits, with or without #, lowercased; nothing else", () => {
  assert.equal(pitchHex("E41E2C"), "#e41e2c");
  assert.equal(pitchHex("#1A1A1A"), "#1a1a1a");
  for (const bad of ["red", "#fff", "fff", "url(x)", "javascript:alert(1)", "ff0000; background:url(x)", " ff0000", "#ff00001", "", null, 0xff0000, {}]) {
    assert.equal(pitchHex(bad), null, String(bad));
  }
});

test("contrast: matches the WCAG figures the repo quotes", () => {
  assert.equal(Math.round(pitchContrast("#000000", "#ffffff")), 21);
  assert.equal(pitchContrast("#1e223d", "#f4f1ea").toFixed(2), "13.78");
  assert.equal(pitchContrast("#4c5176", "#f4f1ea").toFixed(2), "6.78");
  assert.equal(pitchContrast("#ffffff", "#b23109").toFixed(2), "6.29");
});

test("kit: no colours means neutral shirts, ink at home and white away; a keeper never borrows the outfield shirt", () => {
  assert.deepEqual(plain(pitchKit(null, false, true, PAL)), { fill: "#1e223d", number: "#f4f1ea", halo: null, stroke: "#1e223d", neutral: true });
  assert.deepEqual(plain(pitchKit(undefined, false, false, PAL)), { fill: "#ffffff", number: "#1e223d", halo: null, stroke: "#4c5176", neutral: true });
  const outfieldOnly = { player: { primary: "#e41e2c", number: "#ffffff", border: "#e41e2c" }, goalkeeper: null };
  assert.equal(pitchKit(outfieldOnly, true, true, PAL).neutral, true);
  assert.deepEqual(plain(pitchKit(outfieldOnly, false, true, PAL)), { fill: "#e41e2c", number: "#ffffff", halo: null, stroke: "#e41e2c", neutral: false });
  assert.equal(pitchKit({ player: { primary: "url(x)" } }, false, true, PAL).neutral, true);
});

test("kit: a number below 4.5:1 on the shirt becomes ink or white, whichever reads better", () => {
  // White on yellow is 1.07:1: ink instead.
  assert.equal(pitchKit({ player: { primary: "#ffff00", number: "#ffffff" } }, false, true, PAL).number, "#1e223d");
  // Navy on dark navy: white instead.
  assert.equal(pitchKit({ player: { primary: "#0a1931", number: "#000080" } }, false, true, PAL).number, "#ffffff");
  // A missing number colour is chosen the same way.
  assert.equal(pitchKit({ player: { primary: "#e41e2c" } }, false, true, PAL).number, "#ffffff");
  // A good pairing is left alone, with no outline.
  const good = pitchKit({ player: { primary: "#0a1931", number: "#f2c200" } }, false, true, PAL);
  assert.deepEqual([good.number, good.halo], ["#f2c200", null]);
  // The number is about 10.5px bold, so 3:1 is not enough: yellow on white (1.07:1) becomes ink.
  assert.equal(pitchKit({ player: { primary: "#ffffff", number: "#ffff00" } }, false, true, PAL).number, "#1e223d");
});

test("kit: on a mid-tone shirt where neither ink nor white reaches 4.5:1, the number gets an outline in the other", () => {
  // White on pure red is 4.00:1 and ink 3.89:1: white stays, outlined in ink.
  const red = pitchKit({ player: { primary: "#ff0000", number: "#ffffff" } }, false, true, PAL);
  assert.deepEqual([red.number, red.halo], ["#ffffff", "#1e223d"]);
  assert.ok(pitchContrast(red.number, red.halo) >= 4.5);
  // 4.49:1 is still under the line.
  assert.equal(pitchKit({ player: { primary: "#ef0107", number: "#ffffff" } }, false, true, PAL).halo, "#1e223d");
  // Mid grey: white 3.95:1, ink 3.93:1.
  const grey = pitchKit({ player: { primary: "#808080" } }, false, true, PAL);
  assert.deepEqual([grey.number, grey.halo], ["#ffffff", "#1e223d"]);
  // An API colour that clears 4.5:1 is kept and needs no outline.
  assert.equal(pitchKit({ player: { primary: "#e41e2c", number: "#ffffff" } }, false, true, PAL).halo, null);
});

test("kit: a shirt that would vanish on the pitch is outlined in the muted ink; otherwise the API's border, else the fill", () => {
  assert.equal(pitchKit({ player: { primary: "#ffffff", number: "#e41e2c", border: "#ffffff" } }, false, false, PAL).stroke, "#4c5176");
  assert.equal(pitchKit({ player: { primary: "#f6eee0" } }, false, false, PAL).stroke, "#4c5176");
  assert.equal(pitchKit({ player: { primary: "#e41e2c", border: "#1a1a1a" } }, false, false, PAL).stroke, "#1a1a1a");
  assert.equal(pitchKit({ player: { primary: "#e41e2c", border: "nope" } }, false, false, PAL).stroke, "#e41e2c");
});

// ---------- ratings ----------

test("ratings, live file: every starter is matched by number or, with no number, by exact name", () => {
  for (const side of ["home", "away"]) {
    for (const p of LIVE.lineups[side].startXI) {
      assert.equal(typeof pitchRating(p, LIVE.ratings[side]), "number", `${side} ${p.name}`);
    }
  }
  const away = (name) => LIVE.lineups.away.startXI.find((p) => p.name === name);
  // These three ratings arrived with number null, so only the name joins them.
  assert.equal(pitchRating(away("Lize Kop"), LIVE.ratings.away), 5.68);
  assert.equal(pitchRating(away("Amanda Nildén"), LIVE.ratings.away), 5.67);
  assert.equal(pitchRating(away("Ella morris"), LIVE.ratings.away), 5.48);
  assert.equal(pitchRating(LIVE.lineups.home.startXI.find((p) => p.number === 10), LIVE.ratings.home), 9.13);
});

test("ratings, live file: substitutes who came on are rated, the unused ones are not", () => {
  const rated = (side) => LIVE.lineups[side].subs.filter((p) => pitchRating(p, LIVE.ratings[side]) !== null).map((p) => p.name);
  assert.deepEqual(plain(rated("home")), ["N. Björn", "A. Beever-Jones", "E. Cuthbert", "M. Hamano", "S. Nüsken"]);
  assert.deepEqual(plain(rated("away")), ["L. Gunning-Williams", "K. Hanson", "S. Martinez", "A. Sombath", "E. Summanen"]);
});

test("ratings: the number joins names the API spells two ways; the id wins over both; a different known id is never taken", () => {
  const fx = RAW[0];
  const lineup = asLineup(fx.lineups.find((e) => e.team.id === 40), true);
  const ratings = fx.players.find((e) => e.team.id === 40).players
    .filter((p) => Number(p.statistics[0].games.rating) > 0)
    .map((p) => ({ name: p.player.name, number: p.statistics[0].games.number, minutes: p.statistics[0].games.minutes, rating: Number(p.statistics[0].games.rating) }));
  const araujo = lineup.startXI.find((p) => p.name === "R. Araujo");
  assert.equal(pitchRating(araujo, ratings), 6.2); // "Ronald Araújo" in the ratings

  const player = { name: "A", number: 9, id: 5 };
  assert.equal(pitchRating(player, [{ name: "B", number: 9, rating: 7, id: 6 }, { name: "Z", number: null, rating: 8, id: 5 }]), 8);
  assert.equal(pitchRating(player, [{ name: "A", number: 9, rating: 7, id: 6 }]), null);
  assert.equal(pitchRating(player, [{ name: "A", number: 9, rating: 7, id: null }]), 7);
  assert.equal(pitchRating({ name: "A", number: null }, [{ name: "A", number: 3, rating: 6.5 }]), 6.5);
  assert.equal(pitchRating({ name: "A", number: 4 }, [{ name: "a", number: null, rating: 6.5 }]), null); // exact names only
  assert.equal(pitchRating({ name: "A", number: 4 }, null), null);
  assert.equal(pitchRating({ name: "A", number: 4 }, [{ name: "A", number: 4, rating: "7" }]), null); // not a number
});

test("ratings, WSL reply: a rating with player id 0 and no number joins by initial and surname, once", () => {
  // API-Football sent "Jade Rose" (id 0, number null) for the lineup's "J. Rose", and five more like her.
  const fx = RAW[3];
  const rated = (teamId) => fx.players.find((e) => e.team.id === teamId).players
    .filter((p) => Number(p.statistics[0].games.rating) > 0)
    .map((p) => ({ name: p.player.name, number: p.statistics[0].games.number ?? null, minutes: p.statistics[0].games.minutes, rating: Number(p.statistics[0].games.rating), id: p.player.id || null }));
  for (const e of fx.lineups) {
    const lineup = asLineup(e, true);
    const R = rated(e.team.id);
    const missing = lineup.startXI.filter((p) => pitchRating(p, R) === null).map((p) => p.name);
    assert.deepEqual(plain(missing), [], e.team.name);
    // Every rating row is taken by exactly one player, starters and substitutes together.
    const taken = [...lineup.startXI, ...lineup.subs].map((p) => pitchRating(p, R.map((r, i) => ({ ...r, rating: i + 1 })))).filter((x) => x !== null);
    assert.equal(new Set(taken).size, taken.length, `${e.team.name}: a rating joined twice`);
    assert.equal(taken.length, R.length, `${e.team.name}: a rating left over`);
  }
  const city = fx.lineups.find((e) => e.team.name === "Manchester City W");
  const cityR = rated(city.team.id);
  const by = (name) => asLineup(city, true).startXI.concat(asLineup(city, true).subs).find((p) => p.name === name);
  assert.equal(pitchRating(by("J. Rose"), cityR), 6.45);
  assert.equal(pitchRating(by("L. Blindkilde"), cityR), 6.1); // "Laura Blindkilde Brown"

  const p = { name: "J. Rose", number: 4, id: 9 };
  assert.equal(pitchRating(p, [{ name: "Jade Rosé", number: null, rating: 6, id: null }]), 6); // accents folded
  assert.equal(pitchRating(p, [{ name: "Jade Rose", number: null, rating: 6, id: null }, { name: "Jo Rose", number: null, rating: 7, id: null }]), null); // two fit
  assert.equal(pitchRating(p, [{ name: "Jade Rose", number: 5, rating: 6, id: null }]), null); // has a number: someone else
  assert.equal(pitchRating(p, [{ name: "Jade Rose", number: null, rating: 6, id: 12 }]), null); // has an id: someone else
  assert.equal(pitchRating(p, [{ name: "Kate Rose", number: null, rating: 6, id: null }]), null); // wrong initial
  assert.equal(pitchRating(p, [{ name: "Jade Roseby", number: null, rating: 6, id: null }]), null); // whole words only
  assert.equal(pitchRating({ name: "Rose", number: 4 }, [{ name: "Jade Rose", number: null, rating: 6, id: null }]), null); // no initial
});

test("one decimal and split bars", () => {
  assert.equal(pitchOneDp(9.13), "9.1");
  assert.equal(pitchOneDp(6.95), "7.0");
  assert.equal(pitchOneDp(7), "7.0");
  assert.deepEqual(plain(pitchShare("55%", "45%")), [55, 45]);
  assert.deepEqual(plain(pitchShare(3, 1)), [75, 25]);
  const xg = pitchShare("2.3", "1.17");
  assert.equal(xg[0].toFixed(1), "66.3");
  assert.equal(pitchShare(0, 0), null);
  assert.equal(pitchShare(null, 4), null);
  assert.equal(pitchShare("n/a", 4), null);
  assert.equal(pitchShare(-1, 4), null);
});
