// Third-party logos (founder ruling, 21 Nov 2026): the switch, the one helper, the table title and
// the dist gate. Fixtures are written to a temp dir; nothing here reads the network or dist.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { plLogo, PL_LOGO, PL_NOTICE, THIRD_PARTY_LOGOS } from "../shared/logos.mjs";
import { renderTableBlock } from "../wire/lib/render.mjs";
import { checkDist, checkFiles } from "../check-logos.mjs";
import { LEGAL_LINE } from "../shared/page-shell.mjs";

const LOGO = PL_LOGO.src;

test("plLogo: one unaltered img with real alt and explicit size, or nothing with the switch off", () => {
  const on = plLogo({ enabled: true });
  assert.match(on, /^<img class="comp-logo" src="\/logos\/premier-league\/PL_LOGO_COMPACT_DARK_RGB\.png" alt="Premier League logo" width="20" height="24" loading="lazy"/);
  assert.ok(!/style=/.test(on), "no inline style (CSP) and no filter or recolour");
  assert.ok(!plLogo({ enabled: true, lazy: false }).includes("loading="));
  assert.equal(plLogo({ enabled: false }), "");
});

test("the footer legal line carries the trade-mark sentence, and the notice while the switch is on", () => {
  assert.match(LEGAL_LINE, /Team and league names and logos are trade marks of their owners, shown for identification in news reporting/);
  assert.match(LEGAL_LINE, /not affiliated with or endorsed by any club, league or governing body/);
  assert.equal(LEGAL_LINE.includes(PL_NOTICE), THIRD_PARTY_LOGOS);
  assert.ok(!/—/.test(LEGAL_LINE), "no em dash");
});

const block = (over) => ({ id: "pl-table", kind: "standings", league: "premier-league", title: "Premier League table", asOf: "2026-11-20", columns: [], rows: [], emptyText: "No table yet.", source: { attribution: "Test source" }, ...over });

test("the Premier League table title, and only it, takes the logo", () => {
  const pl = renderTableBlock(block());
  assert.equal(pl.includes(LOGO), THIRD_PARTY_LOGOS);
  if (THIRD_PARTY_LOGOS) assert.match(pl, /<h3 class="tblock__title" id="tblock-title-pl-table"><img class="comp-logo" [^>]+>Premier League table<\/h3>/);
  for (const other of [block({ id: "ucl", league: "champions-league", title: "Champions League: league phase" }), block({ id: "nfl", league: "nfl", title: "NFL standings" }), block({ id: "mu", kind: "fixtures", league: undefined, title: "Premier League fixtures" })]) {
    assert.ok(!renderTableBlock(other).includes("/logos/"), other.id);
  }
});

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), "logos-"));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  return dir;
}

test("check-logos: allowed on /scores/ and /tables/ with the switch on", () => {
  const dir = fixture({ "tables/index.html": `<h3 class="tblock__title">${plLogo({ enabled: true })}Premier League table</h3>`, "scores/index.html": `<div id="scores" data-pl-logo="${LOGO}"></div>` });
  assert.deepEqual(checkDist(dir, { enabled: true }).errors, []);
});

test("check-logos: fails on posters, shop, feeds, share cards, and anywhere with the switch off", () => {
  const img = plLogo({ enabled: true });
  const dir = fixture({
    "posters/index.html": img,
    "shop/index.html": img,
    "feed/storefront.json": JSON.stringify({ image: LOGO }),
    "feed.xml": `<image>${LOGO}</image>`,
    "desk/leagues/x/index.html": `<meta property="og:image" content="https://thearchv.ca${LOGO}" />`,
  });
  const { errors } = checkDist(dir, { enabled: true });
  assert.equal(errors.length, 5, errors.join("\n"));
  const off = fixture({ "tables/index.html": img });
  assert.equal(checkDist(off, { enabled: false }).errors.length, 1);
});

test("check-logos: with the switch off, a dist with no logo markup passes", () => {
  const dir = fixture({ "tables/index.html": `<h3 class="tblock__title">${plLogo({ enabled: false })}Premier League table</h3>`, "index.html": "<p>Premier League</p>" });
  assert.deepEqual(checkDist(dir, { enabled: false }).errors, []);
});

test("the shipped logo file is byte for byte the download", () => {
  assert.deepEqual(checkFiles(), []);
});

// ---- Club crests (D-2026-11-21b): one switch, one normaliser, mirrored in the homepage bundle.
import { readFileSync } from "node:fs";
import { normTeam, crestImg, loadCrests } from "../shared/crests.mjs";
import { scoresClientSource } from "../shared/scores-script.mjs";

const ROOTDIR = join(import.meta.dirname, "..", "..");

test("crests: the homepage mirror carries the same switch and the same normaliser", () => {
  const ts = readFileSync(join(ROOTDIR, "src", "lib", "crests.ts"), "utf8");
  assert.match(ts, new RegExp(`export const THIRD_PARTY_LOGOS = ${THIRD_PARTY_LOGOS};`));
  const client = readFileSync(join(ROOTDIR, "scripts", "shared", "scores-client.js"), "utf8");
  // The three normalisers must give the same answer on awkward names.
  const body = ts.match(/export const normTeam = \(s: unknown\): string =>\s*([\s\S]*?);\n/)[1];
  const tsNorm = new Function("s", `return ${body};`);
  const cBody = client.match(/function crestKey\(s\) \{\s*return ([\s\S]*?);\n\s*\}/)[1];
  const cNorm = new Function("s", `return ${cBody};`);
  for (const n of ["Brighton & Hove Albion FC", "FC Bayern München", "Fenerbahçe SK", "FK Bodø/Glimt", "ŠK Slovan Bratislava", "  Real Betis Balompié "]) {
    assert.equal(tsNorm(n), normTeam(n), n);
    assert.equal(cNorm(n), normTeam(n), n);
  }
});

test("crests: every registry row is a Commons file with licence and names, and crestImg is decorative", () => {
  const { reg } = loadCrests();
  for (const c of reg.crests) {
    assert.match(c.filePage, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/, c.slug);
    assert.ok(c.names.length, c.slug);
    const img = crestImg(c.names[0], { enabled: true });
    assert.match(img, /^<img class="team-crest" src="\/logos\/crests\/[a-z0-9-]+\.(svg|png)" alt="" /);
    assert.equal(crestImg(c.names[0], { enabled: false }), "");
  }
  assert.equal(crestImg("No Such Club FC", { enabled: true }), "");
});

test("crests: the /scores/ client carries the crest table (or null) inside the hashed text", () => {
  const src = scoresClientSource(ROOTDIR);
  assert.ok(!src.includes("// @crests"));
  assert.match(src, /var CRESTS = (null|\{[^\n]*\});\n/);
});
