/* data-shape.mjs — the shape guard on the data files the desk engine writes into this repo.
   Enforced by day-data.mjs immediately before it bundles anything (see the block there).

   WHY THIS EXISTS. src/data/*.ts is NOT written by anyone working in this repo. The daily desk
   engine (../scripts/archv-site-commit.mjs) commits those files straight to main through the
   GitHub Contents API, and `npm run build` then esbuild-bundles them and `import()`s the result.
   That import EXECUTES the module. In GitHub Actions the build job holds pages:write and
   id-token:write (.github/workflows/deploy.yml), so a compromised or simply buggy engine that
   wrote one line of top-level side effect — `import "node:child_process"` and an exec call — would
   be running it with those permissions. Nothing else in the chain would notice: esbuild bundles
   side effects as happily as arrays, tsc --noEmit type-checks them, and the pages still render.

   The exposure is bounded rather than hypothetical-only. The engine already holds a PAT that can
   push to main, so it already decides what the site publishes. What this closes is the step from
   "controls the published content" to "runs arbitrary code inside the deploy job".

   WHAT PASSES: an allow-list, not a deny-list. A deny-list of `child_process`, `eval` and friends
   is theatre — it only catches the attacker who spells it the way you guessed. Here the file
   either has the shape of a data file or the build stops. After comments are stripped and string
   bodies blanked, a file may contain only these four top-level forms:

     import type ... ;                  type-only, erased before anything runs
     export interface Name { ... }      ditto
     export type Name = ... ;           ditto
     export const NAME[: Type] = <literal> ;

   where <literal> is arrays, objects, strings (including backtick strings with NO ${} in them),
   numbers, and true / false / null / undefined. A bare word inside a literal is legal only as an
   object key, i.e. only when the next thing is a colon. That leaves nowhere to spell a call, an
   arrow, a class, a reference to another binding, a runtime import or a template substitution:
   the dangerous constructs are excluded by what the grammar cannot express, rather than by a list
   of names somebody has to keep current.

   ONE KNOWN LIMIT, and it fails in the safe direction. The masker does not know about regular
   expression literals, so a `/.../` containing a quote reads as the start of a string and the file
   is rejected as malformed rather than accepted. No data file has ever contained a regex, and the
   two modules in src/data/ that do contain one (readSlug.ts) are marked `kind: "code"` and never
   reach this scanner. If that ever changes, the build stops loudly rather than passing something
   through unread, which is the correct way round for a guard to be wrong.

   WHAT IT IS NOT. Not a TypeScript parser, and deliberately not: a focused scanner over the
   stripped source is proportionate and is the register the rest of this repo's guards are written
   in (check-csp-hash.mjs, check-tokens.mjs). It also says nothing about whether the CONTENT is
   true — sourcing is the desks' two-source rule and EDITOR_STANDARDS.md, not this file's job.

   SCOPE. Data files only. src/data/readSlug.ts and src/lib/readTime.ts are real code modules that
   ride on the same bundle, and day-data.mjs marks them `kind: "code"` so they are never checked
   here — validating a function against a data-literal grammar would fail the build instantly.
   They are repo-owned and change only through a reviewed branch, which is the whole difference.
   Because every checked file is refused a runtime import, nothing unchecked can be pulled into
   the bundle THROUGH a checked file; the only modules reachable without review are the ones
   reachable from those two, and they are repo-owned too. */

import { readFileSync } from "node:fs";

/* The only bare words a value may contain that are not object keys. */
const LITERAL_WORDS = new Set(["true", "false", "null", "undefined"]);

/* Characters a TS type annotation on an `export const` may use, e.g. `: DayEntry[]`. No parens,
   so a function type cannot appear; it would be erased anyway, but the narrower the better. */
const ANNOTATION_CHARS = /^[\sA-Za-z0-9_$.,|[\]<>:]*$/;

/* ── phase 1: mask ──────────────────────────────────────────────────────────────────────────
   One pass replacing comment bodies and string bodies with spaces, newlines kept so every later
   index still maps to the right line. Everything downstream then works on a skeleton in which a
   quote can no longer hide a brace, a semicolon or a keyword. */
function maskLiterals(src, problems) {
  const n = src.length;
  const out = new Array(n);
  const blank = (from, to) => {
    for (let k = from; k < to && k < n; k++) out[k] = src[k] === "\n" ? "\n" : " ";
  };

  let i = 0;
  while (i < n) {
    const c = src[i];

    if (c === "/" && src[i + 1] === "/") {
      const start = i;
      while (i < n && src[i] !== "\n") i++;
      blank(start, i);
      continue;
    }

    if (c === "/" && src[i + 1] === "*") {
      const start = i;
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      if (i >= n) {
        problems.push({ index: start, what: "an unterminated /* block comment" });
        blank(start, n);
        return out.join("");
      }
      i += 2;
      blank(start, i);
      continue;
    }

    if (c === "'" || c === '"' || c === "`") {
      const quote = c;
      const start = i;
      out[i] = c;
      i++;
      let closed = false;
      while (i < n) {
        const d = src[i];
        if (d === "\\") { blank(i, i + 2); i += 2; continue; }
        if (d === quote) { out[i] = quote; i++; closed = true; break; }
        // A substitution is the one way a string body reaches back out into expression land.
        if (quote === "`" && d === "$" && src[i + 1] === "{") {
          problems.push({ index: i, what: "a template literal with a ${...} substitution" });
        }
        if (quote !== "`" && d === "\n") break; // unterminated: let the outer loop see the newline
        out[i] = d === "\n" ? "\n" : " ";
        i++;
      }
      if (!closed) problems.push({ index: start, what: "an unterminated string literal" });
      continue;
    }

    out[i] = c;
    i++;
  }
  return out.join("");
}

/* ── phase 2: the statement walk ────────────────────────────────────────────────────────────── */

const RE_IMPORT_TYPE = /import\s+type\b/y;
const RE_EXPORT_INTERFACE = /export\s+interface\b/y;
const RE_EXPORT_TYPE = /export\s+type\b/y;
const RE_EXPORT_CONST = /export\s+const\b/y;
const RE_IDENT = /[A-Za-z_$][A-Za-z0-9_$]*/y;

function at(re, s, p) { re.lastIndex = p; return re.exec(s); }
function skipSpace(s, p) { while (p < s.length && /\s/.test(s[p])) p++; return p; }

/* Run to the first `;` that is not nested inside a bracket. Used for the type-only forms, whose
   insides esbuild erases wholesale, so they are checked for balance and parens and no further. */
function endOfPlainStatement(masked, from, problems, label) {
  let depth = 0;
  for (let i = from; i < masked.length; i++) {
    const c = masked[i];
    if (c === "{" || c === "[" || c === "(") depth++;
    else if (c === "}" || c === "]" || c === ")") depth--;
    else if (c === ";" && depth === 0) return i;
  }
  problems.push({ index: from, what: `${label} with no closing semicolon` });
  return -1;
}

function endOfBracedBlock(masked, openBrace, problems) {
  let depth = 0;
  for (let i = openBrace; i < masked.length; i++) {
    if (masked[i] === "{") depth++;
    else if (masked[i] === "}") { depth--; if (depth === 0) return i; }
  }
  problems.push({ index: openBrace, what: "an unclosed { block" });
  return -1;
}

/* The value grammar, walked one character at a time. Returns the index of the `;` that ends the
   statement. Everything it refuses, it refuses by naming the exact construct. */
function scanValue(masked, from, problems) {
  let depth = 0;
  let i = from;
  const n = masked.length;

  while (i < n) {
    const c = masked[i];

    if (/\s/.test(c)) { i++; continue; }

    if (c === "[" || c === "{") { depth++; i++; continue; }
    if (c === "]" || c === "}") {
      depth--;
      if (depth < 0) { problems.push({ index: i, what: `an unbalanced "${c}"` }); return -1; }
      i++;
      continue;
    }
    if (c === "," || c === ":") { i++; continue; }

    if (c === ";") {
      if (depth === 0) return i;
      problems.push({ index: i, what: "a semicolon inside a literal (statement never closed)" });
      return -1;
    }

    // Strings are already blanked, so the closing quote is the next one of its kind.
    if (c === "'" || c === '"' || c === "`") {
      const close = masked.indexOf(c, i + 1);
      if (close === -1) { problems.push({ index: i, what: "an unterminated string literal" }); return -1; }
      i = close + 1;
      continue;
    }

    // Numbers, negatives included. No exponents: none of these files has one, and a narrow
    // grammar that fails loudly beats a wide one nobody has read.
    if (/[0-9]/.test(c) || (c === "-" && /[0-9\s]/.test(masked[i + 1] ?? ""))) {
      i++;
      while (i < n && /[0-9._]/.test(masked[i])) i++;
      continue;
    }

    if (/[A-Za-z_$]/.test(c)) {
      const m = at(RE_IDENT, masked, i);
      const word = m[0];
      const after = skipSpace(masked, i + word.length);
      if (!LITERAL_WORDS.has(word) && masked[after] !== ":") {
        problems.push({
          index: i,
          what: `the bare identifier "${word}", which is neither a literal (true/false/null/undefined) nor an object key`,
        });
        return -1;
      }
      i += word.length;
      continue;
    }

    problems.push({ index: i, what: `the character "${c}", which no data literal needs` });
    return -1;
  }

  problems.push({ index: from, what: "an export whose value never closes with a semicolon" });
  return -1;
}

/** Every way the file departs from the data grammar, cheapest-first, stopping at the first
 *  structural surprise because everything after it is unparseable by these rules anyway. */
export function findDataShapeProblems(source) {
  const problems = [];
  const masked = maskLiterals(source, problems);
  if (problems.length) return problems; // a broken string means the skeleton is not trustworthy

  const n = masked.length;
  let p = 0;

  while (p < n) {
    p = skipSpace(masked, p);
    if (p >= n) break;

    if (masked[p] === ";") { p++; continue; } // a stray semicolon is noise, not code

    if (at(RE_IMPORT_TYPE, masked, p)) {
      const end = endOfPlainStatement(masked, p, problems, "an `import type`");
      if (end === -1) return problems;
      if (masked.slice(p, end).includes("(")) {
        problems.push({ index: p, what: "an `import type` containing parentheses" });
        return problems;
      }
      p = end + 1;
      continue;
    }

    // A runtime import is the whole point of the exercise, so name it rather than letting it fall
    // through to the generic "not an allowed statement" message.
    if (/^import\b/.test(masked.slice(p, p + 7))) {
      problems.push({ index: p, what: "a RUNTIME import (only `import type` is erased before execution)" });
      return problems;
    }

    if (at(RE_EXPORT_INTERFACE, masked, p)) {
      const open = masked.indexOf("{", p);
      if (open === -1) { problems.push({ index: p, what: "an `export interface` with no body" }); return problems; }
      if (masked.slice(p, open).includes("(")) {
        problems.push({ index: p, what: "an `export interface` head containing parentheses" });
        return problems;
      }
      const close = endOfBracedBlock(masked, open, problems);
      if (close === -1) return problems;
      p = close + 1;
      const q = skipSpace(masked, p);
      if (masked[q] === ";") p = q + 1;
      continue;
    }

    if (at(RE_EXPORT_TYPE, masked, p)) {
      const end = endOfPlainStatement(masked, p, problems, "an `export type`");
      if (end === -1) return problems;
      if (masked.slice(p, end).includes("(")) {
        problems.push({ index: p, what: "an `export type` containing parentheses" });
        return problems;
      }
      p = end + 1;
      continue;
    }

    const constHead = at(RE_EXPORT_CONST, masked, p);
    if (constHead) {
      let q = skipSpace(masked, p + constHead[0].length);
      const name = at(RE_IDENT, masked, q);
      if (!name) { problems.push({ index: q, what: "an `export const` with no plain identifier name" }); return problems; }
      q += name[0].length;

      // Optional type annotation, everything up to the `=` that opens the value.
      const eq = masked.indexOf("=", q);
      if (eq === -1) { problems.push({ index: q, what: `the export "${name[0]}" with no value` }); return problems; }
      const annotation = masked.slice(q, eq);
      if (!ANNOTATION_CHARS.test(annotation)) {
        problems.push({ index: q, what: `an unexpected construct between "${name[0]}" and its value` });
        return problems;
      }
      if (masked[eq + 1] === "=" || masked[eq + 1] === ">") {
        problems.push({ index: eq, what: "an expression operator where a plain `=` was expected" });
        return problems;
      }

      const end = scanValue(masked, eq + 1, problems);
      if (end === -1) return problems;
      p = end + 1;
      continue;
    }

    const snippet = source.slice(p, p + 60).split("\n")[0].trim();
    problems.push({ index: p, what: `a top-level statement that is not one of the four allowed forms: "${snippet}"` });
    return problems;
  }

  return problems;
}

function lineOf(source, index) {
  const before = source.slice(0, index);
  const line = before.split("\n").length;
  const column = index - (before.lastIndexOf("\n") + 1) + 1;
  return { line, column, text: source.split("\n")[line - 1] ?? "" };
}

/** Throw a build-stopping error naming the file, the line and the construct, or return quietly. */
export function assertPureDataModule(source, label) {
  const problems = findDataShapeProblems(source);
  if (!problems.length) return;

  const shown = problems.slice(0, 5).map((prob) => {
    const { line, column, text } = lineOf(source, prob.index);
    return `  ${label}:${line}:${column}\n    ${line} | ${text.trim().slice(0, 120)}\n  found: ${prob.what}`;
  });

  throw new Error(
    [
      `[data-shape] REFUSING TO BUILD: ${label} is not a pure data module.`,
      "",
      ...shown,
      problems.length > 5 ? `  ...and ${problems.length - 5} more.` : "",
      "",
      "  This file is written by the daily desk engine (../scripts/archv-site-commit.mjs) straight to",
      "  main through the GitHub Contents API, and the build bundles and imports it, which EXECUTES it —",
      "  in GitHub Actions, in a job holding pages:write and id-token:write. The build stops here rather",
      "  than run something new.",
      "",
      "  WHAT TO DO NEXT: read the line above. If the desk engine has legitimately changed shape (a new",
      "  export, a literal form the grammar does not cover yet), widen the grammar in",
      "  scripts/shared/data-shape.mjs and say so in the commit. If that line is not something a desk",
      "  would ever write, treat it as a compromise of the engine or its PAT: do NOT re-run the build,",
      "  revert the file on main first, and rotate the token.",
      "",
    ].filter(Boolean).join("\n"),
  );
}

/** Read and check one file. `label` is the repo-relative path used in the failure output. */
export function assertPureDataFile(absPath, label) {
  assertPureDataModule(readFileSync(absPath, "utf8"), label);
}
