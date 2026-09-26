/* check-data-shape.mjs: the pure-data guard over every engine-writable module in src/data/, run
   BEFORE anything in the build is able to execute one (code review 2026-09-25).

   WHY IT HAS TO BE FIRST. src/data/*.ts is committed straight to main by the desk engine through
   the GitHub Contents API, and scripts/shared/data-shape.mjs is the guard that refuses a data file
   which has grown runtime code (its header carries the full reasoning). Until this date that guard
   ran only inside loadDayData() in scripts/shared/day-data.mjs, immediately before a generator
   bundled the data. That was too late. vite.config.ts statically imports src/render/home.ts, and
   home.ts imports the day lanes, legends, longReads and readSlug from src/data; Vite bundles the
   config with esbuild and imports the result in Node, so `vite build` (the sixth step of "build"
   before this script went in), `vite` (npm run dev) and `vite preview` all EXECUTE engine-written
   data while loading their config, before any generator has run and so before the guard ever
   looked. This script closes that. It sits at the head of "build", "dev" and "preview" in
   package.json, and runs on its own as `npm run check-data`.

   Nothing that ran ahead of vite in the chain executed src/data either, which was checked rather
   than assumed: check-csp-hash.mjs and check-tokens.mjs only read files, tsc --noEmit type-checks
   without running anything, build-crest.mjs reads SVGs, and check-illustrated-parity.mjs bundles
   and imports src/render/illustrated.ts, whose only import is scripts/data/illustrated.json. The
   guard in day-data.mjs stays where it is as well: generators run on their own through their
   package.json aliases (`npm run feed`, `npm run articles`) never pass through this script.

   WHERE THE LIST COMES FROM. day-data.mjs's own registry, REGISTERED_MODULES, derived there from
   the same DAY_LANES and EXTRAS tables loadDayData() bundles from. There is no second copy here to
   fall out of step: a module registered there as "data" is checked here by the same edit.

   THE CATCH-ALL. Every FILE anywhere under src/data/, whatever its name, must be one of three
   things: a "data" entry in that registry, which is checked; an entry on REPO_AUTHORED_CODE below,
   which is not, and which says why; or a name on IGNORED_BY_NAME, of which there is one. Anything
   else fails the build, and so does any entry that is neither a regular file nor a directory (a
   symbolic link, say). That is what stops a new engine-written file (a ninth sport lane, wired
   into home.ts on a branch but never added to DAY_LANES) from being executed by Vite without ever
   having been read by the guard. A registered module that is missing from disk, an allowlisted
   file that no longer exists, and a file claimed as both data and code all fail too, because each
   one means the lists no longer describe the directory.

   WHY EVERY FILE AND NOT ONLY SOURCES (code review 2026-09-25, second round). The first version
   of this check counted only names ending in a JavaScript or TypeScript extension, on the claim
   that nothing else could be executed by an import. That was false, and a reviewer proved it.
   src/render/home.ts writes every one of its data imports without an extension
   ('../data/transferDays'), and esbuild resolves such an import to a file of EXACTLY that name
   before it tries appending .tsx or .ts, then loads a file with no extension as JavaScript. Vite's
   config bundler sets no resolveExtensions of its own, so a file called src/data/transferDays
   sitting beside the clean transferDays.ts is what `vite build` runs while loading its config,
   and the old check, which never looked at it, passed. tsc stays green throughout, because
   TypeScript still resolves the same import to transferDays.ts. Measured against esbuild 0.28.1:
   of every sibling tried beside x.ts, only `x` and `x.tsx` win an import of './x', and the old
   filter already counted .tsx. The extensionless name is not the only way in, either. A
   tsconfig.json or package.json dropped into the directory changes how the compiler and the
   resolver treat the files beside it (a tsconfig.json there with verbatimModuleSyntax was
   measured pulling an extra module into the bundle), so a rule written about extensions would
   only ever be as good as the last trick someone thought of. Classifying every file does not
   depend on knowing the trick.

   IGNORED_BY_NAME holds .DS_Store alone, matched on the whole file name and only as a regular
   file. Finder writes one into any folder the founder opens, .gitignore keeps it out of every
   commit, so it never reaches Actions, and no import in the repo names it, so no resolver can
   land on it.

   Dependency-light on purpose, in the register of check-csp-hash.mjs and check-tokens.mjs: node's
   own fs and path, the registry, and the guard, which brings the two parsers it reads each file
   with: the `typescript` devDependency the build already runs as tsc, and the esbuild that
   day-data.mjs and Vite bundle with. Neither executes a data file; esbuild's transform only
   prints what it would run, and the guard reads that. */
import { readdirSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { REGISTERED_MODULES } from "./shared/day-data.mjs";
import { assertPureDataFile } from "./shared/data-shape.mjs";

const TAG = "[check-data-shape]";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const DATA_DIR = join(SRC, "data");

/* Code that lives in src/data/ and is NOT written by the desk engine. Paths are relative to src/,
   the same form REGISTERED_MODULES uses. Each entry is a reviewed decision to skip the guard for a
   file, so each carries its reason, and a file belongs here only if the engine's write list (the
   FEEDS table in ../scripts/archv-site-commit.mjs) will never contain it. If the engine ever gains
   one of these, it moves to the data registry in day-data.mjs, and the code in it moves out.
   Confirmed by reading both files on 2026-09-25. */
const REPO_AUTHORED_CODE = new Map([
  ["data/readSlug.ts",
    "the long-read slug helper: two exported functions built on String.prototype.replace with regular " +
    "expressions. It sits outside the engine-written longReads.ts on purpose (see its header), and " +
    "day-data.mjs already marks it kind \"code\"."],
  ["data/sports.ts",
    "the sport registry, kept in step by hand with SPORTS in scripts/shared/page-shell.mjs. Its " +
    "`sportOf` export is an arrow function, so the data grammar would refuse it; nothing in the " +
    "build imports it today, and the engine does not write it."],
]);

/* Files the catch-all leaves alone, by whole file name, with the reason. The header says why this
   is the only one. A name here must never be one an import in the repo could resolve to. */
const IGNORED_BY_NAME = new Map([
  [".DS_Store",
    "macOS Finder metadata. Gitignored, so it never reaches Actions, and no import names it."],
]);

/* Every entry under `dir`, recursively, paths relative to src/ in the form REGISTERED_MODULES
   uses. Regular files go in `files`, whatever they are called; directories are walked; anything
   else (a symbolic link, a FIFO, a socket) goes in `other` with what it is, because a registered
   name that is really a link reaches whatever it points at, and nothing the engine writes through
   the Contents API is ever one. withFileTypes reports a link as a link rather than following it. */
function listEntries(dir, out = { files: [], other: [] }) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    const rel = relative(SRC, abs).split(sep).join("/");
    if (entry.isDirectory()) listEntries(abs, out);
    else if (entry.isFile()) out.files.push(rel);
    else out.other.push({ rel, what: entry.isSymbolicLink() ? "a symbolic link" : "not a regular file or a directory" });
  }
  return out;
}

const failures = [];

const dataModules = new Set(
  REGISTERED_MODULES.filter((m) => m.kind === "data").map((m) => m.module),
);
const registeredCode = REGISTERED_MODULES.filter((m) => m.kind === "code").map((m) => m.module);

for (const m of REGISTERED_MODULES) {
  if (m.kind !== "data" && m.kind !== "code") {
    failures.push(`day-data.mjs registers src/${m.module} with kind "${m.kind}"; the only kinds are "data" and "code".`);
  }
}

/* A code module registered in day-data.mjs that sits inside src/data/ must ALSO be on the
   allowlist above. Marking an engine-written file kind "code" there would otherwise be enough on
   its own to take it out of the guard; this makes that a second, deliberate edit in this file. */
for (const module of registeredCode) {
  if (module.startsWith("data/") && !REPO_AUTHORED_CODE.has(module)) {
    failures.push(
      `day-data.mjs registers src/${module} as kind "code", but it lives in src/data/ and is not on\n` +
      "  REPO_AUTHORED_CODE in scripts/check-data-shape.mjs. Add it there with the reason the desk engine\n" +
      "  never writes it, or register it as data.",
    );
  }
}

for (const module of REPO_AUTHORED_CODE.keys()) {
  if (dataModules.has(module)) {
    failures.push(`src/${module} is registered as data in day-data.mjs AND allowlisted as code here. It is one or the other.`);
  }
}

const { files, other } = listEntries(DATA_DIR);
const onDisk = new Set(files);
const notRegular = new Set(other.map((o) => o.rel));

for (const { rel, what } of other.sort((a, b) => (a.rel < b.rel ? -1 : 1))) {
  failures.push(
    `src/${rel} is ${what}. Everything in src/data/ must be a plain file or a directory: the desk\n` +
    "  engine only ever writes plain files, and the guard can only vouch for what it reads in place.",
  );
}

for (const module of dataModules) {
  if (module.startsWith("data/") && !onDisk.has(module) && !notRegular.has(module)) {
    failures.push(`day-data.mjs registers src/${module} as data, but there is no such file.`);
  }
}
for (const module of REPO_AUTHORED_CODE.keys()) {
  if (!onDisk.has(module) && !notRegular.has(module)) {
    failures.push(`src/${module} is on REPO_AUTHORED_CODE in scripts/check-data-shape.mjs, but there is no such file. Take it off.`);
  }
}

/* Every file, not only the ones with a source extension: see WHY EVERY FILE in the header. When
   an unclassified file carries no extension at all and a registered module sits beside it under
   the same name plus .ts, the message says so outright, because that pairing is not a stray file
   but the exact shape of a file built to be run in place of a checked one. */
const baseName = (rel) => rel.slice(rel.lastIndexOf("/") + 1);
const registeredAll = new Set([...dataModules, ...REPO_AUTHORED_CODE.keys()]);
for (const module of [...onDisk].sort()) {
  if (dataModules.has(module) || REPO_AUTHORED_CODE.has(module)) continue;
  if (IGNORED_BY_NAME.has(baseName(module))) continue;
  const noExtension = !baseName(module).slice(1).includes(".");
  const shadows = noExtension && registeredAll.has(`${module}.ts`);
  failures.push(
    `src/${module} is neither registered as data in scripts/shared/day-data.mjs (DAY_LANES or EXTRAS)\n` +
    "  nor allowlisted as repo-authored code in scripts/check-data-shape.mjs, so nothing has checked it,\n" +
    "  and Vite or a generator may be about to execute it. If the desk engine writes it, register it as\n" +
    "  data. If it was written on a reviewed branch, add it to REPO_AUTHORED_CODE here with the reason." +
    (shadows
      ? `\n  It also SHADOWS src/${module}.ts: an import written without an extension, as src/render/home.ts\n` +
        `  writes them, resolves to this file before it tries .ts, and esbuild runs a file with no extension\n` +
        "  as JavaScript. That pairing is how a file gets run in place of a checked one: find out where it\n" +
        "  came from before deleting it."
      : noExtension
        ? "\n  It has no extension. esbuild loads a file with no extension as JavaScript whenever an import names it."
        : ""),
  );
}

/* The checks themselves, every registered data module, in a stable order. All of them run even
   after one fails, so a single build log names every file that needs looking at. data-shape.mjs's
   own error text carries the file, the line, the construct and what to do next. */
const checked = [];
for (const module of [...dataModules].sort()) {
  if (!onDisk.has(module)) continue; // already reported above
  try {
    assertPureDataFile(join(SRC, module), `src/${module}`);
    checked.push(module);
  } catch (err) {
    failures.push(err && err.message ? err.message.trimEnd() : String(err));
  }
}

if (failures.length) {
  console.error(`${TAG} FAIL: ${failures.length} problem${failures.length === 1 ? "" : "s"} with the data modules in src/data/.\n`);
  for (const f of failures) console.error(`${f}\n`);
  process.exit(1);
}

console.log(
  `${TAG} OK: ${checked.length} registered data modules in src/data read as pure data by TypeScript and esbuild ` +
  `(${checked.map((m) => m.replace(/^data\//, "")).join(", ")}).`,
);
console.log(`${TAG}   not checked, repo-authored code: ${[...REPO_AUTHORED_CODE.keys()].map((m) => m.replace(/^data\//, "")).join(", ")}.`);
const ignored = files.filter((f) => IGNORED_BY_NAME.has(baseName(f))).length;
console.log(
  `${TAG}   every one of the ${files.length} files under src/data is classified` +
  (ignored ? ` (${ignored} ignored by name: ${[...IGNORED_BY_NAME.keys()].join(", ")}).` : "."),
);
