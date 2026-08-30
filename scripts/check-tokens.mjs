/* check-tokens.mjs — verifies the white-system brand tokens hold the SAME hex value in every
   file that declares them. Runs second in the build chain, right behind check-csp-hash.mjs
   (see package.json "build").

   WHY THIS EXISTS. The palette is declared four times, in four files that do not import each
   other and cannot: two are CSS, one is CSS inside a JS template literal, one is a JS object
   handed to satori. CLAUDE.md has said for months "Change one, change all four. There is no
   build step that will catch you." This is that build step. Before it, changing --ink in
   src/style.css and forgetting scripts/shared/card-brand.mjs shipped green, and the only symptom
   was that a shared link previewed in a slightly different ink from the page it opened — the
   exact failure phase 2B was fixed to end.

   THE FOUR PRIMARY DECLARATIONS (all nine core tokens, all four files, no exceptions):
     1. src/style.css                    :root block
     2. scripts/shared/page-shell.mjs    the :root block inside pageStyles()
     3. public/content.css               :root block
     4. scripts/shared/card-brand.mjs    the CARD object (JS strings, camelCase keys)

   ONE NAME IS NOT SHARED, AND THAT IS DELIBERATE HERE RATHER THAN FIXED. The bright orange fill
   is spelled --accent in src/style.css and --accent-fill in page-shell.mjs and content.css.
   Both resolve to #F54F1B; only the spelling drifted. This script maps between them (see
   SPELLINGS below) rather than renaming anything, because renaming a token is a change to a
   generator and to ~10 rules that reference it, and this file is a guard, not a refactor. If a
   later pass unifies the name, delete the alias row here.

   THE HAND-BUILT PAGES ARE CHECKED TOO, at a second tier. /app, /start and /quiz each declare a
   small :root of their own under the LEGACY navy alias names (--navy, --cream, --gold and so
   on), which CLAUDE.md notes "carry the same values". They do, and this script proves it via
   LEGACY_ALIASES. Two limits, stated rather than hidden:

     - Value-only, not presence. Those roots are deliberate subsets, so a token simply being
       absent from one is not an error; a token being present with the WRONG hex is.
     - --cream-dim IS EXCLUDED, and it is excluded because it genuinely disagrees today. In all
       three shared files --cream-dim aliases --ink-soft (#4A4F73). All three hand-built pages set
       --cream-dim: #5F6485, which is --ink-muted's value. Both are white-system colours, so this
       is naming drift and not a brand break, but it is a real inconsistency and not this
       script's to resolve: correcting it means changing a colour on three live pages, which is a
       founder call. The exclusion is printed on every successful run so it cannot rot into
       folklore. Resolve it, then delete the row from EXCLUDED_LEGACY.

   Dependency-free on purpose, matching check-csp-hash.mjs and the other scripts/ generators. */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TAG = "[check-tokens]";

/* The system as CLAUDE.md states it. Canonical names are the CSS spelling without the leading
   dashes; every source maps its own spelling onto these. */
const CORE_TOKENS = [
  "bg",
  "bg-sunken",
  "ink",
  "ink-soft",
  "ink-muted",
  "accent-fill",
  "accent-ink",
  "rule",
  "rule-soft",
];

/* Per-file spelling. Anything not listed is spelled `--<canonical>` in that file. */
const SPELLINGS = {
  "src/style.css": { "accent-fill": "--accent" },
};

/* The legacy navy alias names, as the three hand-built public/ pages still use them. */
const LEGACY_ALIASES = {
  "--navy": "bg",
  "--navy-deep": "bg-sunken",
  "--cream": "ink",
  "--gold": "accent-ink",
  "--rule": "rule",
};

const EXCLUDED_LEGACY = {
  "--cream-dim":
    "aliases --ink-soft (#4A4F73) in the three shared files but is set to --ink-muted's #5F6485 " +
    "on all three hand-built pages. Naming drift between two system colours, not an off-palette " +
    "hex. Fixing it changes a colour on live pages, so it needs a founder call, not a guard.",
};

function fail(lines) {
  console.error(`${TAG} FAIL: ${lines.join("\n")}`);
  process.exit(1);
}

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Normalise a hex literal so #fff, #FFF and #FFFFFF compare equal. Returns null for anything
    that is not a bare hex — a var() alias, a colour function, a keyword. */
function normHex(value) {
  const m = HEX.exec(String(value).trim());
  if (!m) return null;
  const h = m[1];
  const six = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
  return `#${six.toUpperCase()}`;
}

function stripCssComments(source) {
  // /* ... */ is the comment form in all three inputs: CSS, and JS block comments in the .mjs
  // files, which share the syntax exactly.
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Take the first `:root { ... }` block out of `source`. A :root block carries no nested braces
    once comments are stripped, so the first `}` closes it. */
function firstRootBlock(source, label) {
  const stripped = stripCssComments(source);
  const open = /:root\s*\{/.exec(stripped);
  if (!open) fail([`${label} has no :root { ... } block. Was the token block moved or renamed?`]);
  const start = open.index + open[0].length;
  const end = stripped.indexOf("}", start);
  if (end === -1) fail([`${label}: the :root block is never closed. Unbalanced braces?`]);
  return stripped.slice(start, end);
}

/** Every `--name: value` in a declaration block, as a Map. */
function parseCustomProperties(block) {
  const out = new Map();
  // Append a terminator so a final declaration with no trailing semicolon is still matched.
  for (const m of `${block};`.matchAll(/(--[A-Za-z0-9-]+)\s*:\s*([^;]+);/g)) {
    out.set(m[1], m[2].trim());
  }
  return out;
}

/** The CARD object out of scripts/shared/card-brand.mjs, as a Map of camelCase key -> string. */
function parseCardObject(source, label) {
  const stripped = stripCssComments(source);
  const m = /export\s+const\s+CARD\s*=\s*\{([\s\S]*?)\}/.exec(stripped);
  if (!m) fail([`${label} has no \`export const CARD = { ... }\`. Was the card palette moved?`]);
  const out = new Map();
  for (const entry of m[1].matchAll(/([A-Za-z][A-Za-z0-9]*)\s*:\s*["']([^"']+)["']/g)) {
    out.set(entry[1], entry[2].trim());
  }
  return out;
}

/** canonical "bg-sunken" -> the camelCase key card-brand.mjs uses ("bgSunken"). */
function camelKey(canonical) {
  return canonical.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/* ---------- read the four primary declarations ---------- */

const primary = [];

function addCssSource(relPath, sliceFrom) {
  let source = readFileSync(join(ROOT, relPath), "utf8");
  if (sliceFrom) {
    // page-shell.mjs is a module with several `:root` occurrences; anchor on pageStyles() so we
    // read the token block and not, say, the `:root[data-theme=...]` colour-scheme rules below it.
    const at = source.indexOf(sliceFrom);
    if (at === -1) fail([`${relPath} no longer contains \`${sliceFrom}\`. Was pageStyles() renamed?`]);
    source = source.slice(at);
  }
  const decls = parseCustomProperties(firstRootBlock(source, relPath));
  const spelling = SPELLINGS[relPath] || {};
  const values = new Map();
  const names = new Map();
  for (const canonical of CORE_TOKENS) {
    const name = spelling[canonical] || `--${canonical}`;
    names.set(canonical, name);
    if (decls.has(name)) values.set(canonical, decls.get(name));
  }
  primary.push({ label: relPath, values, names });
}

addCssSource("src/style.css");
addCssSource("scripts/shared/page-shell.mjs", "export function pageStyles()");
addCssSource("public/content.css");

{
  const relPath = "scripts/shared/card-brand.mjs";
  const card = parseCardObject(readFileSync(join(ROOT, relPath), "utf8"), relPath);
  const values = new Map();
  const names = new Map();
  for (const canonical of CORE_TOKENS) {
    const key = camelKey(canonical);
    names.set(canonical, key);
    if (card.has(key)) values.set(canonical, card.get(key));
  }
  primary.push({ label: relPath, values, names });
}

/* ---------- read the hand-built public/ pages ---------- */

const HAND_BUILT = ["public/app/index.html", "public/start/index.html", "public/quiz/index.html"];

const secondary = HAND_BUILT.map((relPath) => {
  const decls = parseCustomProperties(firstRootBlock(readFileSync(join(ROOT, relPath), "utf8"), relPath));
  const values = new Map();
  const names = new Map();
  for (const [alias, canonical] of Object.entries(LEGACY_ALIASES)) {
    if (!decls.has(alias)) continue; // subsets by design: absence is not an error here
    values.set(canonical, decls.get(alias));
    names.set(canonical, alias);
  }
  return { label: relPath, values, names };
});

/* ---------- compare ---------- */

const problems = [];

for (const canonical of CORE_TOKENS) {
  // 1. Every primary source must declare the token, as a literal hex. A token that has gone
  //    missing, or been repointed at a var(), is a regression in its own right: the guard can no
  //    longer prove the four agree.
  const missing = primary.filter((s) => !s.values.has(canonical));
  if (missing.length > 0) {
    problems.push(
      `--${canonical} is not declared in ${missing.map((s) => `${s.label} (looked for \`${s.names.get(canonical)}\`)`).join(" or ")}.\n` +
      `    All ${primary.length} primary declarations must carry all ${CORE_TOKENS.length} core tokens. If the token was\n` +
      `    renamed, add the new spelling to SPELLINGS in this script; if it was retired, remove it\n` +
      `    from CORE_TOKENS and from all four files together.`
    );
    continue;
  }

  const rows = [];
  let unreadable = false;
  for (const source of [...primary, ...secondary]) {
    if (!source.values.has(canonical)) continue;
    const raw = source.values.get(canonical);
    const hex = normHex(raw);
    if (hex === null && primary.includes(source)) unreadable = true;
    rows.push({ label: source.label, name: source.names.get(canonical), raw, hex });
  }

  if (unreadable) {
    const bad = rows.filter((r) => r.hex === null);
    problems.push(
      `--${canonical} is not a literal hex in ${bad.map((r) => `${r.label} (\`${r.name}: ${r.raw}\`)`).join(", ")}.\n` +
      `    The core tokens are the roots of the system and must be hex literals in all four\n` +
      `    primary files. Pointing one at a var() breaks the only cross-file check there is.`
    );
    continue;
  }

  const comparable = rows.filter((r) => r.hex !== null);
  const distinct = new Set(comparable.map((r) => r.hex));
  if (distinct.size <= 1) continue;

  // Majority wins the "expected" label, purely so the report points at the odd file out.
  const tally = new Map();
  for (const r of comparable) tally.set(r.hex, (tally.get(r.hex) || 0) + 1);
  const expected = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];

  const width = Math.max(...comparable.map((r) => r.label.length));
  const nameWidth = Math.max(...comparable.map((r) => r.name.length));
  const table = comparable
    .map((r) => {
      const flag = r.hex === expected ? "" : "   <-- differs";
      return `      ${r.label.padEnd(width)}  ${r.name.padEnd(nameWidth)}  ${r.hex}${flag}`;
    })
    .join("\n");

  problems.push(`--${canonical} has ${distinct.size} different values:\n${table}`);
}

if (problems.length > 0) {
  fail([
    `${problems.length} brand token${problems.length === 1 ? " disagrees" : "s disagree"} across the files that declare the white system.\n`,
    ...problems.map((p, i) => `  ${i + 1}. ${p}\n`),
    `  The palette is declared in four files that do not import each other, plus three hand-built\n` +
    `  pages under public/. Changing one means changing all of them. See the token block in\n` +
    `  src/style.css for the authority, and CLAUDE.md ("What this site is") for the roles: two\n` +
    `  tokens are never text, --accent-fill and --ink-faint, and adding a sixth hue is a brand\n` +
    `  break rather than a refactor.`,
  ]);
}

const sourceCount = primary.length + secondary.length;
console.log(
  `${TAG} OK: ${CORE_TOKENS.length} core brand tokens agree across ${sourceCount} declarations ` +
  `(${primary.length} primary, ${secondary.length} hand-built public/ pages).`
);
for (const [alias, reason] of Object.entries(EXCLUDED_LEGACY)) {
  console.log(`${TAG}   not checked: ${alias} on the hand-built pages — ${reason.split(".")[0]}.`);
}
