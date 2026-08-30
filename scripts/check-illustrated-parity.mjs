/* check-illustrated-parity.mjs — proves the two illustrated-registry readers still agree.

   There are two implementations of the same lookup, and both files say MIRRORED in capitals at
   the top of the matcher:

     scripts/shared/illustrated.mjs   plain Node, read by page-shell.mjs and every generator
     src/render/illustrated.ts        typed, read by src/render/home.ts for the front page

   They share ONE registry, scripts/data/illustrated.json, but not one line of matching logic:
   norm(), the longest-name-wins inText() matcher and the entryArt() resolution chain are written
   out twice. A matcher fixed in one file leaves the other wrong, and the symptom is not a crash.
   It is the same story illustrated on the front page and bare on its article page, or worse, a
   face appearing on one surface for a name the other refused to match.

   Deleting the duplicate is the obvious fix and it is blocked. scripts/shared/page-shell.mjs
   imports entryArt at the top level, synchronously, and nearly every generator imports
   page-shell. Serving that import from an async esbuild bundle would force page-shell to become
   async or to take the art as a parameter, which is a restructure of the whole generator family,
   not a deletion. So the duplication stays and this file guards it: run both implementations
   over one fixture set and refuse the build if any answer differs.

   Runs early in the build chain (see package.json "build"), right after check-csp-hash.mjs and
   before the slow half, because the failure it catches is cheap to find and expensive to ship.
   Also available on its own as `npm run check-parity`.

   Two asymmetries are known and deliberately NOT fixtured, because they are outside the shared
   contract rather than drift inside it:
     - the .mjs entryArt() opens with `if (!entry) return null`, a defensive guard for generators
       walking sparse day data. The .ts one is called only with a real entry and would throw.
     - the .mjs file additionally exports playerArt()/clubArt(), a slug-or-name lookup the front
       page has no use for and the .ts file does not implement.
   Anything else the two both expose is fair game and is compared below. */
import { build } from "esbuild";
import { rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as mjs from "./shared/illustrated.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");

/* ---------- load the typed side through a bundled temp module ----------
   Same pattern as scripts/build-lane-pages.mjs: a .mjs script cannot import a .ts module, so
   esbuild bundles one re-export entry to a temp file, it gets imported once, and the temp file
   is removed in a finally. The JSON registry rides along on esbuild's built-in json loader, so
   the typed side reads the same file it reads in a real build. */
const entrySrc = `export { entryArt, playerInText, clubInText, PLAYERS, CLUBS } from "./render/illustrated.ts";`;
const tmp = join(ROOT, ".parity-bundle.mjs");
let ts;
try {
  await build({
    stdin: { contents: entrySrc, resolveDir: SRC, loader: "ts", sourcefile: "parity-entry.ts" },
    bundle: true, format: "esm", platform: "node", outfile: tmp, logLevel: "silent",
  });
  ts = await import(pathToFileURL(tmp).href + `?t=${process.hrtime.bigint()}`);
} catch (err) {
  console.error(
    "[check-illustrated-parity] FAIL: could not bundle src/render/illustrated.ts.\n" +
    "  The typed half of the registry reader did not compile, so parity cannot be proven.\n" +
    `  ${err && err.message ? err.message : err}`
  );
  process.exit(1);
} finally {
  try { rmSync(tmp); } catch {}
}

/* ---------- fixtures ----------
   Every case below is one the file headers say bit someone, or one the matcher rules promise.
   Accented letters are written as \u escapes on purpose: this file's whole job is to detect a
   difference in how the two normalisers fold diacritics, and an editor, a re-encode or a text
   cleanup step that quietly rewrote a literal "é" would neuter the test without failing it. */
const KONE = "Koné";          // banked as the plain "Manu Kone"
const GLADBACH = "Mönchengladbach";

const ENTRY_FIXTURES = [
  {
    name: "diacritic headline matches the plainly-spelled banked portrait",
    entry: { headline: `Manu ${KONE} leaves Borussia ${GLADBACH}`, dek: "" },
  },
  {
    name: "the same name spelled without the accent matches the same portrait",
    entry: { headline: "Manu Kone leaves Borussia Monchengladbach", dek: "" },
  },
  {
    name: "longest club name wins over a shorter club in the same text",
    entry: { headline: "Leeds United hold Manchester United at Elland Road", dek: "" },
  },
  {
    name: "longest player name wins over a shorter player in the same text",
    entry: { headline: "Lionel Messi and Cristiano Ronaldo, one more time", dek: "" },
  },
  {
    name: "the entry's own filed image beats a player named in the headline",
    entry: {
      headline: "Lionel Messi returns to the Camp Nou",
      dek: "",
      image: "/media/illustrated/head-mahrez.jpg",
      imageAlt: "Illustrated ARCHV portrait of Riyad Mahrez of Algeria",
    },
  },
  {
    name: "a filed image with no imageAlt falls back to the headline the same way",
    entry: { headline: "Leeds United go up", image: "/media/illustrated/badge-leeds-united.png" },
  },
  {
    // This one caught live drift the day the check was written: the .mjs interpolated a missing
    // headline straight into the alt and produced "Illustration: undefined" while the .ts side
    // produced "Illustration: ". No desk entry files an image without a headline, so nothing had
    // shipped, which is exactly why it had sat there unnoticed.
    name: "a filed image with no headline at all still agrees on the alt",
    entry: { image: "/media/illustrated/badge-leeds-united.png" },
  },
  {
    name: "a player named in the headline beats a club named beside him",
    entry: { headline: "Marcus Rashford leaves Manchester United", dek: "" },
  },
  {
    name: "a club in the standfirst is found when the headline names nobody",
    entry: { headline: "The window shuts", dek: "Paris Saint-Germain spent the last hour of it." },
  },
  {
    name: "a player in the standfirst is found when the headline names nobody",
    entry: { headline: "The window shuts", dek: "Riyad Mahrez was the last man out of it." },
  },
  {
    name: "an unbanked name renders nothing rather than borrowing a face",
    entry: { headline: "Bukayo Saka signs a new deal at Arsenal", dek: "Arsenal tie down a winger." },
  },
  {
    name: "case, spacing and punctuation differences still match",
    entry: { headline: "MANCHESTER   UNITED, again", dek: "" },
  },
  {
    name: "a club name typed without its hyphen still matches",
    entry: { headline: "Paris Saint Germain in the semi final", dek: "" },
  },
  {
    name: "an empty entry resolves to nothing",
    entry: { headline: "", dek: "" },
  },
];

/* Text fixtures go through the two matchers directly, so a change to inText() is caught even if
   entryArt() happens to swallow it. */
const TEXT_FIXTURES = [
  { name: "empty text", text: "" },
  { name: "punctuation and spacing only", text: "---  ,,  !!  " },
  { name: "lower case and over-spaced club", text: "manchester    united" },
  { name: "club with the hyphen dropped", text: "Paris Saint Germain in the semi final" },
  { name: "accented player name", text: `Manu ${KONE}` },
  { name: "unaccented spelling of the same player", text: "Manu Kone" },
  { name: "two clubs in one line, longest wins", text: "Leeds United v Manchester United" },
  { name: "two players in one line, longest wins", text: "Lionel Messi and Cristiano Ronaldo" },
  { name: "nothing banked anywhere in the text", text: "Arsenal beat Aston Villa" },
  { name: "a name broken across punctuation", text: "Rashford, Marcus Rashford. Again." },
];

/* ---------- comparison ---------- */
// Key order is not part of the contract; a stable serialisation keeps a reordered object literal
// from reading as a behaviour change.
const stable = (v) =>
  v === null || v === undefined
    ? JSON.stringify(v ?? null)
    : JSON.stringify(v, Object.keys(v).sort());

const failures = [];

function compare(fn, fixtureName, input, a, b) {
  if (stable(a) === stable(b)) return;
  const keys =
    a && b && typeof a === "object" && typeof b === "object"
      ? [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => stable(a[k]) !== stable(b[k]))
      : [];
  failures.push({ fn, fixtureName, input, a, b, keys });
}

// The registry itself: both sides must be reading the same file. If one is ever repointed at a
// different JSON, every fixture below would still "agree" on a miss, so check the source first.
compare("PLAYERS", "the two readers load the same player registry", "scripts/data/illustrated.json", mjs.PLAYERS, ts.PLAYERS);
compare("CLUBS", "the two readers load the same club registry", "scripts/data/illustrated.json", mjs.CLUBS, ts.CLUBS);

for (const f of ENTRY_FIXTURES) {
  compare("entryArt", f.name, f.entry, mjs.entryArt(f.entry), ts.entryArt(f.entry));
}
for (const f of TEXT_FIXTURES) {
  compare("clubInText", f.name, f.text, mjs.clubInText(f.text), ts.clubInText(f.text));
  compare("playerInText", f.name, f.text, mjs.playerInText(f.text), ts.playerInText(f.text));
}

const checks = 2 + ENTRY_FIXTURES.length + TEXT_FIXTURES.length * 2;

if (failures.length) {
  console.error(
    `[check-illustrated-parity] FAIL: ${failures.length} of ${checks} checks disagree.\n` +
    "  scripts/shared/illustrated.mjs and src/render/illustrated.ts have drifted apart. Both say\n" +
    "  MIRRORED at the top of the matcher and they are not. Fix BOTH files, not the one you were\n" +
    "  editing, then run `npm run check-parity` again.\n"
  );
  for (const f of failures) {
    console.error(`  ${f.fn} / ${f.fixtureName}`);
    console.error(`    input: ${typeof f.input === "string" ? JSON.stringify(f.input) : JSON.stringify(f.input)}`);
    console.error(`    .mjs:  ${JSON.stringify(f.a)}`);
    console.error(`    .ts:   ${JSON.stringify(f.b)}`);
    if (f.keys.length) console.error(`    differs on: ${f.keys.join(", ")}`);
    console.error("");
  }
  process.exit(1);
}

console.log(
  `[check-illustrated-parity] OK: ${checks} checks agree across scripts/shared/illustrated.mjs ` +
  `and src/render/illustrated.ts (${mjs.PLAYERS.length} portraits, ${mjs.CLUBS.length} badges).`
);
