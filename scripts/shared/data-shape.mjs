/* data-shape.mjs: the shape guard on the data files the desk engine writes into this repo.
   Enforced twice: by scripts/check-data-shape.mjs at the head of "build", "dev" and "preview" in
   package.json, before anything can execute a data module, and by day-data.mjs immediately before
   it bundles one (see the blocks in both).

   WHY THIS EXISTS. src/data/*.ts is NOT written by anyone working in this repo. The daily desk
   engine (../scripts/archv-site-commit.mjs) commits those files straight to main through the
   GitHub Contents API, and the build then bundles them and imports the result, twice over:
   vite.config.ts imports src/render/home.ts, which imports the data modules, and every generator
   that calls loadDayData() esbuild-bundles them and `import()`s the bundle. Either import EXECUTES
   the module. In GitHub Actions the build job holds pages:write and id-token:write
   (.github/workflows/deploy.yml), so a compromised or simply buggy engine that wrote one line of
   top-level side effect, `import "node:child_process"` and an exec call, would be running it with
   those permissions. Nothing else in the chain would notice: esbuild bundles side effects as
   happily as arrays, tsc --noEmit type-checks them, and the pages still render.

   The exposure is bounded rather than hypothetical-only. The engine already holds a PAT that can
   push to main, so it already decides what the site publishes. What this closes is the step from
   "controls the published content" to "runs arbitrary code inside the deploy job".

   WHAT PASSES: an allow-list, not a deny-list. A deny-list of `child_process`, `eval` and friends
   is theatre: it only catches the attacker who spells it the way you guessed. Here the file either
   has the shape of a data file or the build stops. Its top level may hold only these four
   statement kinds, plus stray semicolons:

     import type ... from "...";          type-only, erased before anything runs
     export interface Name { ... }        ditto
     export type Name = <type>;           ditto
     export const NAME[: <type>] = <literal>[, NAME2 = <literal>];

   where <literal> is, recursively: an array of literals; an object literal whose every member is a
   plain `key: <literal>` with an identifier, string or number key; a string; a backtick string
   with NO ${} in it; a finite number, optionally with a leading minus; true, false, null or
   undefined; or any of those wrapped in `as <type>` or `satisfies <type>`, which are erased too.
   That leaves nowhere to spell a call, a tagged template, a `new`, an assignment, an arrow, a
   class, a getter, a spread, a computed key, a reference to another binding, a runtime import or
   a template substitution: the dangerous constructs are excluded by what the grammar cannot
   express, rather than by a list of names somebody has to keep current. `__proto__` is refused as
   a key as well, because as a literal key it rewires the object's prototype rather than naming a
   field.

   <type> has a grammar of its own, because a type is harmless only for as long as every parser
   agrees where it ends (see WHY TWO READINGS below). It is: string, number, boolean, undefined or
   null; a string, number, true, false or null literal type; a plain or dotted type name whose type
   arguments are themselves <type>, which is how `DayEntry`, `Record<string, T>` and `as const` are
   spelled; T[]; a union or an intersection; a parenthesised type; a tuple; or an inline object
   type. An interface or an inline object type holds only `name: <type>` properties, optionally
   `?` and `readonly`, with no initialiser; neither an interface nor a type alias takes type
   parameters, and an interface may extend a plain name. Everything else a type can be is refused:
   `unique`, `keyof`, `typeof`, an import(...) type, a template literal type, conditional, mapped
   and indexed types, function types, type predicates and the JSDoc-only forms such as `?string`.
   No data file uses any of them. What the files use today, read off every one on 2026-09-25, is
   interfaces of string, number and optional properties, a union of two string literal types, and
   `Name[]` annotations.

   WHY A REAL PARSER (code review 2026-09-25). Until this date the guard was a hand-written scanner
   over the source with comments and string bodies blanked out, and it read the `import type` and
   `export type` forms as "everything up to the next semicolon at bracket depth 0", refusing only a
   `(` inside. TypeScript does not end those statements at the semicolon: it ends them at the
   newline, by automatic semicolon insertion, so whatever sat on the NEXT line was a separate
   statement the scanner never looked at. `import type { DayEntry } from './x'` with a
   tagged-template call on the line below returned zero problems and would have run on import, and
   so would a bare `globalThis.x = 1` or a `new Foo` with no parentheses; the same held for
   `export type`. A scanner that finds statement boundaries by hand is re-implementing ASI and will
   keep getting corner cases wrong, so the statement boundaries now come from real parsers.

   WHY TWO READINGS (code review 2026-09-25, second round). The first parser-based version of this
   guard asked only the TypeScript parser where statements end, on the reasoning that esbuild, the
   thing that actually bundles and runs these files, follows the same rules. It does not, in every
   corner. TypeScript reads a `unique` at the end of a line as the operator in `unique <type>` and
   takes whatever type sits on the NEXT line as its operand; an operand other than `symbol` is a
   checker error, not a parse error, so the parse came back clean. esbuild reads a `unique` that is
   not followed by `symbol` as a bare type name and ends the type there, so by ASI the next line is
   a statement of its own. With `import("data:...")` on that line, which is at once a valid import
   type and a valid dynamic import, the guard saw a type and esbuild would have run a module, and
   the same held behind `as` and `satisfies`, whose types the guard did not look inside at all. The
   type grammar above shuts that door. But it is the second hand-found disagreement between the two
   parsers, nobody has a list of the rest, and a guard whose safety rests on two parsers agreeing
   is only as good as the corners somebody thought to probe. So the verdict now rests on BOTH
   readings, and the second is esbuild's own:

   - READING ONE, the TypeScript parser (the `typescript` devDependency the build already runs as
     tsc --noEmit): statements, values and types against the grammar above, with messages that
     name the construct and its line. A file it refuses goes no further.
   - READING TWO, esbuild: the file goes through esbuild.transformSync, and what comes out is
     exactly the code esbuild would execute, so that is checked too. It must be nothing but `const`
     declarations of literals, one `export { ... }` naming them, and stray semicolons, and it must
     export the same names the first reading found. Whatever TypeScript took for a type, if
     esbuild keeps it as code it is in that output, and it is refused there. The output is plain
     JavaScript that esbuild printed with every statement ended explicitly, so reading it back
     leaves no boundary for two parsers to argue about. The transform runs with
     verbatimModuleSyntax on, which keeps every import not written `import type`, so an import the
     real build might keep can never be missing from the text being checked, and it neither
     minifies nor tree-shakes, so it holds everything a bundle of the file could run.
     It runs once per esbuild INSTALL that executes these files: the one day-data.mjs bundles
     with, and the one Vite loads vite.config.ts with. Today npm dedupes those into one (0.28.1,
     checked 2026-09-25), but Vite 7.3.6 asks for `^0.27.0 || ^0.28.0`, so the day the root
     esbuild moves outside that range npm will quietly nest a second copy under vite/, and the guard
     then reads each file with both. A problem found only here is traced back to its line in the
     source through esbuild's source map.

   TWO RULES THAT KEEP THE READINGS HONEST.
   - A syntax error in EITHER reading refuses the file outright. The TypeScript parser recovers from
     errors and hands back a best-guess tree, and a guess about where a statement ends is exactly
     the thing this file must not rely on. An esbuild syntax error would stop the bundle anyway;
     refusing here says why.
   - The TypeScript syntax errors are read off the parsed file's `parseDiagnostics`, which the
     compiler does not list in its public typings. If a TypeScript upgrade ever moves it, every
     file is refused with a message saying so, rather than every file being waved through unread,
     and the self-tests at the bottom of this module fail at the same moment.

   WHAT IT IS NOT. It says nothing about whether the CONTENT is true: sourcing is the desks'
   two-source rule and EDITOR_STANDARDS.md, not this file's job. It also does not decide WHICH
   files are data; day-data.mjs's registry and the allowlist in check-data-shape.mjs do that.

   SCOPE. Data files only. src/data/readSlug.ts, src/data/sports.ts and the src/lib/ modules are
   real code that rides on the same bundles; they are repo-owned, change only through a reviewed
   branch, and are never checked here, because validating a function against a data-literal
   grammar would fail the build instantly. Because every checked file is refused a runtime import,
   nothing unchecked can be pulled into a bundle THROUGH a checked file; the only modules reachable
   without review are the ones reachable from that code, and they are repo-owned too. */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const requireHere = createRequire(import.meta.url);

/* Both parsers are loaded through require because both ship as CommonJS. A missing one stops the
   build with a message that says why, rather than letting a bare module-not-found look like an
   unrelated install problem. The guard never degrades to "unchecked" for want of a parser. */
function refuseWithout(what, err) {
  return new Error(
    `[data-shape] REFUSING TO BUILD: ${what} could not be loaded, and the pure-data guard on\n` +
    "  src/data/*.ts reads those files with it. Run `npm ci` (devDependencies included; the build\n" +
    "  needs them for tsc and vite anyway) and try again.\n" +
    `  ${err && err.message ? err.message : err}`,
  );
}

let ts;
try {
  ts = requireHere("typescript");
} catch (err) {
  throw refuseWithout("the `typescript` devDependency", err);
}
const K = ts.SyntaxKind;

/* Every esbuild install that executes these files, one entry per install on disk: the one
   day-data.mjs bundles with (resolved from here, exactly as day-data.mjs resolves it) and the one
   Vite loads vite.config.ts with (resolved from Vite's own entry point, as Vite resolves it). One
   entry today; two the day npm nests a copy under vite/ (see WHY TWO READINGS). If `vite` does not
   resolve from here it does not resolve from the repo root either, and vite.config.ts opens with
   `import ... from 'vite'`: an ES module resolves every import before any of its code runs, so
   that config would fail before reaching the data, and there is no Vite reading to check. */
const ESBUILDS = (() => {
  const installs = new Map();
  try {
    installs.set(requireHere.resolve("esbuild"), requireHere("esbuild"));
  } catch (err) {
    throw refuseWithout("the `esbuild` dependency", err);
  }
  let viteEntry = null;
  try { viteEntry = fileURLToPath(import.meta.resolve("vite")); } catch { /* no Vite installed */ }
  if (viteEntry) {
    try {
      const viteRequire = createRequire(viteEntry);
      const path = viteRequire.resolve("esbuild");
      if (!installs.has(path)) installs.set(path, viteRequire("esbuild"));
    } catch (err) {
      throw refuseWithout("the esbuild that Vite loads its config with", err);
    }
  }
  return [...installs.values()].map((esbuild) => ({ esbuild, version: esbuild.version }));
})();

/* The only bare words a value may contain. Everything else an identifier can be in value position
   is a reference to some other binding, which is exactly what a data file has no need of. */
const LITERAL_WORDS = new Set(["undefined"]);

/* ── describing what was found ────────────────────────────────────────────────────────────────
   Every refusal names the construct in words, because the person reading the build log at 6am
   is deciding between "the engine changed shape" and "the engine is compromised", and a syntax
   kind number helps with neither. */
function describe(node) {
  switch (node.kind) {
    case K.CallExpression:
      return node.expression.kind === K.ImportKeyword
        ? "a dynamic import(), which loads and runs another module"
        : "a function call";
    case K.TaggedTemplateExpression:
      return "a tagged template, which is a function call written without parentheses";
    case K.NewExpression: return "a `new` expression, which runs a constructor";
    case K.TemplateExpression: return "a template literal with a ${...} substitution";
    case K.Identifier:
      return `the bare identifier "${node.text}", which is neither a literal (true/false/null/undefined) nor an object key`;
    case K.PropertyAccessExpression:
    case K.ElementAccessExpression:
      return "a property access, which can run a getter";
    case K.BinaryExpression:
      return node.operatorToken.kind >= K.FirstAssignment && node.operatorToken.kind <= K.LastAssignment
        ? "an assignment"
        : "an operator expression";
    case K.ArrowFunction:
    case K.FunctionExpression:
    case K.FunctionDeclaration:
      return "a function";
    case K.ClassExpression:
    case K.ClassDeclaration:
      return "a class";
    case K.SpreadElement:
    case K.SpreadAssignment:
      return "a spread (...), which reads another value at run time";
    case K.ShorthandPropertyAssignment: return "a shorthand property, which is a reference to another binding";
    case K.MethodDeclaration: return "a method";
    case K.GetAccessor:
    case K.SetAccessor:
      return "a getter or setter, which is code that runs when the property is read or written";
    case K.ComputedPropertyName: return "a computed [key], which is an expression";
    case K.PrivateIdentifier: return "a #private name";
    case K.ParenthesizedExpression: return "a parenthesised expression";
    case K.OmittedExpression: return "an empty slot in an array";
    case K.ConditionalExpression: return "a conditional (?:) expression";
    case K.PrefixUnaryExpression:
    case K.PostfixUnaryExpression:
      return "a unary operator other than a minus sign on a number";
    case K.AwaitExpression: return "an await, which runs code at import";
    case K.YieldExpression: return "a yield";
    case K.RegularExpressionLiteral: return "a regular expression literal";
    case K.BigIntLiteral: return "a bigint literal";
    case K.TypeOfExpression:
    case K.VoidExpression:
    case K.DeleteExpression:
      return "a typeof/void/delete expression";
    case K.NonNullExpression:
    case K.TypeAssertionExpression:
      return "a type assertion form other than `as` or `satisfies`";
    default:
      return `a ${K[node.kind] ?? "construct"} where only literal data is allowed`;
  }
}

function describeType(node) {
  switch (node.kind) {
    case K.TypeOperator:
      return node.operator === K.UniqueKeyword
        ? "a `unique` type operator, where the TypeScript parser and esbuild disagree about where the type ends"
        : `a \`${ts.tokenToString(node.operator)}\` type operator`;
    case K.ImportType: return "an import(...) type, which names another module in a spelling that is also a dynamic import";
    case K.TypeQuery: return "a `typeof` type query, which names a value";
    case K.TemplateLiteralType: return "a template literal type";
    case K.TypePredicate: return "a type predicate";
    case K.FunctionType:
    case K.ConstructorType:
      return "a function or constructor type";
    case K.ConditionalType:
    case K.InferType:
    case K.MappedType:
    case K.IndexedAccessType:
      return "a computed type (conditional, infer, mapped or indexed)";
    case K.JSDocNullableType:
    case K.JSDocNonNullableType:
    case K.JSDocAllType:
    case K.JSDocUnknownType:
    case K.JSDocOptionalType:
    case K.JSDocFunctionType:
    case K.JSDocVariadicType:
      return "a JSDoc-only type form, which TypeScript parses in a .ts file and esbuild does not";
    case K.LiteralType: return "a literal type other than a string, a number, true, false or null";
    case K.TypeReference: return "a type name that is neither plain nor dotted";
    default:
      return `a ${K[node.kind] ?? "type"} type, which the data grammar does not use`;
  }
}

/* ── the value grammar ──────────────────────────────────────────────────────────────────────── */

function isPlainKey(name) {
  return name.kind === K.Identifier || name.kind === K.StringLiteral || name.kind === K.NumericLiteral;
}

/* `ctx.output` is set while reading esbuild's output rather than the source (reading two). Two
   forms differ there, and only in the direction of esbuild's own printing: `undefined` comes out
   as `void 0`, which is accepted, and the erased `as` and `satisfies` cannot appear, so they are
   refused. */
function checkLiteral(node, ctx) {
  switch (node.kind) {
    case K.StringLiteral:
    case K.NoSubstitutionTemplateLiteral:
    case K.TrueKeyword:
    case K.FalseKeyword:
    case K.NullKeyword:
      return;

    // A literal too large for a double would come out of esbuild as the identifier `Infinity`.
    case K.NumericLiteral:
      if (Number.isFinite(Number(node.text))) return;
      ctx.report(node, "a number too large to represent, which esbuild would print as Infinity");
      return;

    case K.Identifier:
      if (LITERAL_WORDS.has(node.text)) return;
      ctx.report(node, describe(node));
      return;

    case K.VoidExpression:
      if (ctx.output && node.expression.kind === K.NumericLiteral && node.expression.text === "0") return;
      ctx.report(node, describe(node));
      return;

    // Negative numbers are a minus sign applied to a numeric literal; nothing else unary is data.
    case K.PrefixUnaryExpression:
      if (node.operator === K.MinusToken && node.operand.kind === K.NumericLiteral) {
        checkLiteral(node.operand, ctx);
        return;
      }
      ctx.report(node, describe(node));
      return;

    case K.ArrayLiteralExpression:
      for (const el of node.elements) {
        if (el.kind === K.OmittedExpression) ctx.report(node, describe(el));
        else checkLiteral(el, ctx);
      }
      return;

    case K.ObjectLiteralExpression:
      for (const prop of node.properties) {
        if (prop.kind !== K.PropertyAssignment) { ctx.report(prop, describe(prop)); continue; }
        if (!isPlainKey(prop.name)) { ctx.report(prop.name, describe(prop.name)); continue; }
        if (prop.name.text === "__proto__") {
          ctx.report(prop.name, "a __proto__ key, which replaces the object's prototype rather than naming a field");
          continue;
        }
        if (prop.questionToken || prop.exclamationToken || prop.modifiers?.length) {
          ctx.report(prop, "a property carrying a modifier or a ?/! marker");
          continue;
        }
        checkLiteral(prop.initializer, ctx);
      }
      return;

    // `x as const`, `x as T` and `x satisfies T` are erased; the value inside is what runs, and the
    // type is held to the type grammar because a type is only erased where esbuild agrees it ends.
    case K.AsExpression:
    case K.SatisfiesExpression:
      if (ctx.output) { ctx.report(node, "an `as` or `satisfies` left in esbuild's output"); return; }
      checkLiteral(node.expression, ctx);
      checkType(node.type, ctx);
      return;

    default:
      ctx.report(node, describe(node));
  }
}

/* ── the type grammar ───────────────────────────────────────────────────────────────────────── */

const TYPE_KEYWORDS = new Set([K.StringKeyword, K.NumberKeyword, K.BooleanKeyword, K.UndefinedKeyword, K.NullKeyword]);

function isPlainTypeName(name) {
  return name.kind === K.Identifier || (name.kind === K.QualifiedName && isPlainTypeName(name.left));
}

function checkType(node, ctx) {
  if (TYPE_KEYWORDS.has(node.kind)) return;
  switch (node.kind) {
    case K.LiteralType: {
      const lit = node.literal;
      if (lit.kind === K.StringLiteral || lit.kind === K.NumericLiteral || lit.kind === K.TrueKeyword ||
          lit.kind === K.FalseKeyword || lit.kind === K.NullKeyword) return;
      if (lit.kind === K.PrefixUnaryExpression && lit.operator === K.MinusToken && lit.operand.kind === K.NumericLiteral) return;
      ctx.report(node, describeType(node));
      return;
    }
    // `as const` is a TypeReference to the name `const`, so it passes here with no special case.
    case K.TypeReference:
      if (!isPlainTypeName(node.typeName)) { ctx.report(node, describeType(node)); return; }
      for (const arg of node.typeArguments ?? []) checkType(arg, ctx);
      return;
    case K.ArrayType:
      checkType(node.elementType, ctx);
      return;
    case K.UnionType:
    case K.IntersectionType:
      for (const t of node.types) checkType(t, ctx);
      return;
    case K.ParenthesizedType:
      checkType(node.type, ctx);
      return;
    case K.TupleType:
      for (const el of node.elements) checkType(el, ctx);
      return;
    case K.TypeLiteral:
      checkMembers(node.members, ctx);
      return;
    default:
      ctx.report(node, describeType(node));
  }
}

/* The body of an interface or an inline object type. The TypeScript parser accepts an initialiser
   on a property signature (`a: string = foo()`) without a parse error, leaving it to the checker,
   so it is refused here by name rather than trusted to be caught later. */
function checkMembers(members, ctx) {
  for (const m of members) {
    if (m.kind !== K.PropertySignature) {
      ctx.report(m, "a member that is not a plain `name: type` property (a method, call, construct or index signature)");
      continue;
    }
    if (!isPlainKey(m.name)) { ctx.report(m.name, describe(m.name)); continue; }
    if (m.modifiers?.some((mod) => mod.kind !== K.ReadonlyKeyword)) {
      ctx.report(m, "a property signature carrying a modifier other than readonly");
      continue;
    }
    if (m.initializer) { ctx.report(m.initializer, "a property signature with an initialiser, which is an expression inside a type"); continue; }
    if (m.type) checkType(m.type, ctx);
  }
}

/* ── reading one: the TypeScript parser over the source ─────────────────────────────────────── */

/* Exactly one modifier, and it is `export`. Rules out `declare`, `default`, `const enum`-style
   combinations and any decorator, none of which a data file needs. */
function isExportOnly(st) {
  const mods = st.modifiers;
  return !!mods && mods.length === 1 && mods[0].kind === K.ExportKeyword;
}

/* `import type { X } from "..."`. TypeScript 5.9 records the `type` keyword as the clause's
   phaseModifier (the same slot that holds `defer`, which is a RUNTIME import); earlier releases
   only had the isTypeOnly flag. Either way the answer must be "type", positively. Note that
   `import type from "./x"` is a default import of a binding called `type`, not a type import,
   and has no phaseModifier, so it is refused here as the runtime import it is. */
function isTypeOnlyImport(st) {
  const clause = st.importClause;
  if (!clause) return false; // `import "./x"`: a bare side-effect import
  if ("phaseModifier" in clause) return clause.phaseModifier === K.TypeKeyword;
  return clause.isTypeOnly === true;
}

function firstLine(st, ctx) {
  return ctx.source.slice(st.getStart(ctx.sf), st.end).split("\n")[0].trim().slice(0, 60);
}

function checkStatement(st, ctx) {
  switch (st.kind) {
    case K.EmptyStatement:
      return; // a stray semicolon is noise, not code

    case K.ImportDeclaration:
      if (isTypeOnlyImport(st)) return;
      // A runtime import is the whole point of the exercise, so name it rather than letting it
      // fall through to the generic "not an allowed statement" message.
      ctx.report(st, "a RUNTIME import (only `import type` is erased before execution)");
      return;

    case K.ImportEqualsDeclaration:
      ctx.report(st, "a RUNTIME import (`import x = require(...)`; only `import type` is erased before execution)");
      return;

    case K.InterfaceDeclaration:
      if (!isExportOnly(st)) { ctx.report(st, "an interface declared with something other than a single `export`"); return; }
      if (st.typeParameters?.length) { ctx.report(st.typeParameters[0], "an interface with type parameters"); return; }
      for (const clause of st.heritageClauses ?? []) {
        for (const t of clause.types) {
          if (t.expression.kind !== K.Identifier) ctx.report(t, "an interface extending something other than a plain name");
          for (const arg of t.typeArguments ?? []) checkType(arg, ctx);
        }
      }
      checkMembers(st.members, ctx);
      return;

    case K.TypeAliasDeclaration:
      if (!isExportOnly(st)) { ctx.report(st, "a type alias declared with something other than a single `export`"); return; }
      if (st.typeParameters?.length) { ctx.report(st.typeParameters[0], "a type alias with type parameters"); return; }
      checkType(st.type, ctx);
      return;

    case K.VariableStatement: {
      const flags = st.declarationList.flags & ts.NodeFlags.BlockScoped;
      if (!isExportOnly(st) || flags !== ts.NodeFlags.Const) {
        ctx.report(st, `a variable statement that is not a plain \`export const\`: "${firstLine(st, ctx)}"`);
        return;
      }
      for (const decl of st.declarationList.declarations) {
        if (decl.name.kind !== K.Identifier) {
          ctx.report(decl.name, "an `export const` with a destructuring pattern rather than a plain identifier name");
          continue;
        }
        if (decl.exclamationToken) {
          ctx.report(decl, `the export "${decl.name.text}" with a definite-assignment (!) marker`);
          continue;
        }
        if (!decl.initializer) {
          ctx.report(decl, `the export "${decl.name.text}" with no value`);
          continue;
        }
        ctx.exports.push(decl.name.text);
        if (decl.type) checkType(decl.type, ctx);
        checkLiteral(decl.initializer, ctx);
      }
      return;
    }

    case K.ExpressionStatement:
      ctx.report(st, `a top-level expression, which runs on import (${describe(st.expression)}): "${firstLine(st, ctx)}"`);
      return;

    default:
      ctx.report(st, `a top-level statement that is not one of the four allowed forms: "${firstLine(st, ctx)}"`);
  }
}

/* The source against the whole grammar. Returns the problems and the names the source exports
   as values, which reading two must agree with. A file that does not parse cleanly returns its
   syntax errors and nothing else, because a recovered tree is a guess. */
function readWithTypeScript(source) {
  const sf = ts.createSourceFile("data-module.ts", source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);

  const diagnostics = sf.parseDiagnostics;
  if (!Array.isArray(diagnostics)) {
    throw new Error(
      `[data-shape] REFUSING TO BUILD: this TypeScript (${ts.version}) no longer exposes parseDiagnostics on a\n` +
      "  parsed file, so the guard cannot tell a clean parse from a recovered one. Read the syntax errors\n" +
      "  some other way in scripts/shared/data-shape.mjs before trusting it again.",
    );
  }
  if (diagnostics.length) {
    return {
      exports: [],
      problems: diagnostics.map((d) => ({
        index: d.start ?? 0,
        what: `a syntax error: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`,
      })),
    };
  }

  const problems = [];
  const ctx = {
    output: false,
    source,
    sf,
    exports: [],
    report(node, what) { problems.push({ index: node.getStart(sf), what }); },
  };
  for (const st of sf.statements) checkStatement(st, ctx);
  return { problems, exports: ctx.exports };
}

/* ── reading two: what esbuild would actually run ───────────────────────────────────────────── */

const TRANSFORM_OPTIONS = {
  loader: "ts",
  format: "esm",
  sourcemap: "external",
  sourcefile: "data-module.ts",
  logLevel: "silent",
  // Keeps every import that is not written `import type`, whatever the repo tsconfig says, so the
  // text checked is never missing an import the real bundle keeps.
  tsconfigRaw: { compilerOptions: { verbatimModuleSyntax: true } },
};

/* Character offset of a 0-based line and column in `source`, or 0 if the line is not there. */
function indexAt(source, line, column) {
  let start = 0;
  for (let l = 0; l < line; l++) {
    const nl = source.indexOf("\n", start);
    if (nl === -1) return 0;
    start = nl + 1;
  }
  return Math.min(start + column, source.length);
}

/* esbuild's error locations are a 1-based line and a column counted in UTF-8 bytes; everything
   else in this file counts UTF-16 units from 0, so the column is converted through the line text
   esbuild hands back with it. */
function esbuildErrorIndex(source, loc) {
  if (!loc) return 0;
  const column = Buffer.from(loc.lineText ?? "", "utf8").subarray(0, loc.column).toString("utf8").length;
  return indexAt(source, loc.line - 1, column);
}

/* Source maps, version 3: `mappings` is one group per generated line, separated by ";", each a
   comma-separated list of base64 VLQ segments. A segment of four or more fields is [generated
   column, source index, source line, source column], each a delta on the previous segment's value;
   the generated column restarts on every line and the rest run on across lines. There is only one
   source here, so the source index is ignored. */
const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function decodeVlq(segment) {
  const out = [];
  let value = 0;
  let shift = 0;
  for (const ch of segment) {
    const digit = BASE64.indexOf(ch);
    if (digit === -1) throw new Error(`not base64 VLQ: ${segment}`);
    value += (digit & 31) * 2 ** shift;
    if (digit & 32) { shift += 5; continue; }
    out.push(value % 2 ? -(value - 1) / 2 : value / 2);
    value = 0;
    shift = 0;
  }
  return out;
}

/* The source offset of a 0-based generated line and column: the last mapping on that line at or
   before the column. 0 if nothing maps, so a map that cannot be read costs the line number and
   never the refusal. */
function originalIndex(map, source, genLine, genColumn) {
  const lines = map.mappings.split(";");
  let srcLine = 0;
  let srcColumn = 0;
  let found = null;
  for (let l = 0; l <= genLine && l < lines.length; l++) {
    let column = 0;
    for (const segment of lines[l].split(",")) {
      if (!segment) continue;
      const f = decodeVlq(segment);
      column += f[0];
      if (f.length < 4) continue;
      srcLine += f[2];
      srcColumn += f[3];
      if (l === genLine && column <= genColumn) found = [srcLine, srcColumn];
    }
  }
  return found ? indexAt(source, found[0], found[1]) : 0;
}

function sortedList(names) {
  return `[${[...names].sort().join(", ")}]`;
}

function readWithEsbuild({ esbuild, version }, source, sourceExports) {
  const who = ESBUILDS.length > 1 ? `esbuild ${version}` : "esbuild";

  let result;
  try {
    result = esbuild.transformSync(source, TRANSFORM_OPTIONS);
  } catch (err) {
    const first = Array.isArray(err?.errors) ? err.errors[0] : null;
    if (!first) throw err; // not a verdict on the file: an esbuild that will not run stops the build as it is
    return [{
      index: esbuildErrorIndex(source, first.location),
      what: `a syntax error as ${who} reads it, and esbuild is what bundles and runs this file: ${first.text}`,
    }];
  }

  const code = result.code;
  const out = ts.createSourceFile("esbuild-output.js", code, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
  if (!Array.isArray(out.parseDiagnostics) || out.parseDiagnostics.length) {
    return [{ index: 0, what: `output from ${who} that does not read back cleanly, so what it would run cannot be checked` }];
  }

  let map = null;
  const toSource = (node) => {
    try {
      map ??= JSON.parse(result.map);
      const { line, character } = out.getLineAndCharacterOfPosition(node.getStart(out));
      return originalIndex(map, source, line, character);
    } catch {
      return 0;
    }
  };

  const problems = [];
  const ctx = {
    output: true,
    source: code,
    sf: out,
    statement: null,
    report(node, what) {
      problems.push({
        index: toSource(node),
        what: `${what}, in the code ${who} would actually run, which the TypeScript reading of this file does not see: ` +
          `"${firstLine(ctx.statement ?? node, ctx)}"`,
      });
    },
  };

  const declared = [];
  const exported = [];
  for (const st of out.statements) {
    ctx.statement = st;
    switch (st.kind) {
      case K.EmptyStatement:
        break;
      case K.VariableStatement:
        if (st.modifiers?.length || (st.declarationList.flags & ts.NodeFlags.BlockScoped) !== ts.NodeFlags.Const) {
          ctx.report(st, "a variable statement that is not a plain `const`");
          break;
        }
        for (const decl of st.declarationList.declarations) {
          if (decl.name.kind !== K.Identifier || !decl.initializer) {
            ctx.report(decl, "a declaration that is not `name = <literal>`");
            continue;
          }
          declared.push(decl.name.text);
          checkLiteral(decl.initializer, ctx);
        }
        break;
      // esbuild turns every `export const` into a `const` plus one `export { ... }` at the end.
      case K.ExportDeclaration:
        if (st.moduleSpecifier || st.isTypeOnly || st.exportClause?.kind !== K.NamedExports) {
          ctx.report(st, "an export that is not a plain `export { ... }` of this file's own constants");
          break;
        }
        for (const el of st.exportClause.elements) {
          if (el.isTypeOnly || el.name.kind !== K.Identifier || (el.propertyName && el.propertyName.text !== el.name.text)) {
            ctx.report(el, "a renamed or type-only export");
            continue;
          }
          exported.push(el.name.text);
        }
        break;
      case K.ImportDeclaration:
      case K.ImportEqualsDeclaration:
        ctx.report(st, "a RUNTIME import");
        break;
      case K.ExpressionStatement:
        ctx.report(st, `a top-level expression, which runs on import (${describe(st.expression)})`);
        break;
      default:
        ctx.report(st, "a top-level statement that is not a `const` of literal data");
    }
  }

  // Same names three ways, or the two readings are not describing the same file.
  if (!problems.length) {
    const fromSource = sortedList(sourceExports);
    const fromConsts = sortedList(declared);
    const fromExport = sortedList(exported);
    if (fromSource !== fromConsts || fromConsts !== fromExport) {
      problems.push({
        index: 0,
        what: `a disagreement about what this file exports: the TypeScript reading finds ${fromSource}, ` +
          `${who} declares ${fromConsts} and exports ${fromExport}`,
      });
    }
  }
  return problems;
}

function findEsbuildProblems(source, sourceExports) {
  for (const install of ESBUILDS) {
    const problems = readWithEsbuild(install, source, sourceExports);
    if (problems.length) return problems;
  }
  return [];
}

/* ── the API ────────────────────────────────────────────────────────────────────────────────── */

/** Every way the file departs from the data grammar. Reading one's problems come in source order;
 *  reading two runs only on a file reading one accepts. Each problem is `{ index, what }`, index
 *  being a character offset into `source`. */
export function findDataShapeProblems(source) {
  const { problems, exports } = readWithTypeScript(source);
  if (problems.length) return problems;
  return findEsbuildProblems(source, exports);
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
      "  main through the GitHub Contents API, and the build bundles and imports it, which EXECUTES it:",
      "  in GitHub Actions, in a job holding pages:write and id-token:write. The build stops here rather",
      "  than run something new.",
      "",
      "  WHAT TO DO NEXT: read the line above. If the desk engine has legitimately changed shape (a new",
      "  export, a literal or type form the grammar does not cover yet), widen the grammar in",
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

/* ── self-tests ───────────────────────────────────────────────────────────────────────────────
   tests-by-assertion, the convention build-article-pages.mjs and source-links.mjs use: a
   regression fails the build at import time, in whichever script loaded this module first. Every
   probe below is a STRING handed to a parser or to esbuild's transform, which prints code and
   never runs it. None of it is executed, and none of it touches the network or the disk. */
(function selfTestDataShape() {
  const lineOfProblem = (src, problems = findDataShapeProblems(src)) =>
    problems.length ? lineOf(src, problems[0].index).line : 0;
  /* Each reading on its own. The full guard stops at reading one's problems when it has any, so a
     reading-one check that had quietly stopped working would be covered for by reading two, and
     the other way about; a test of the whole guard alone would never notice either. Where a probe
     is meant to be caught by both, both are asked separately. */
  const readingOne = (src) => readWithTypeScript(src).problems;
  const readingTwo = (src) => findEsbuildProblems(src, readWithTypeScript(src).exports);

  // The first review's bypasses: a statement on the line after an `import type` or `export type`
  // that needs no parentheses, which the hand scanner never read. Caught by each reading, and
  // caught on line 2, the line that would have run.
  const nextLineBypasses = {
    "import type, then a tagged template": "import type { DayEntry } from './x'\nfoo`bar`\nexport const a: DayEntry[] = [];\n",
    "export type, then a tagged template": "export type A = string\nfoo`bar`\nexport const a = [];\n",
    "import type, then an assignment": "import type { A } from './x'\nglobalThis.x = 1\nexport const a = [];\n",
    "export type, then an assignment": "export type A = string\nglobalThis.x = 1\nexport const a = [];\n",
    "import type, then new without parentheses": "import type { A } from './x'\nnew Foo\nexport const a = [];\n",
    "export type, then new without parentheses": "export type A = string\nnew Foo\nexport const a = [];\n",
  };
  for (const [name, src] of Object.entries(nextLineBypasses)) {
    for (const [reading, problems] of [["reading one", readingOne(src)], ["reading two", readingTwo(src)]]) {
      const line = lineOfProblem(src, problems);
      if (line !== 2) throw new Error(`data-shape self-test: ${reading} must refuse "${name}" on line 2, got ${line ? `line ${line}` : "no problem at all"}`);
    }
  }

  // The second review's bypasses: a `unique` at the end of a line, which the TypeScript parser
  // reads as an operator over the next line's type and esbuild reads as a finished type, leaving
  // the next line to run. Probe text only: the data: URL is never loaded, because nothing here is
  // executed. Each must be refused by reading one for its `unique`, AND by reading two on its own,
  // with the line that would run traced back through the source map. The second half is what
  // proves the esbuild reading is a backstop in its own right, one that would have caught this
  // before anybody knew `unique` was the word to look for.
  const PAYLOAD = "data:text/javascript,void 0";
  const uniqueBypasses = {
    "export type, unique, then an import() on the next line": `import type { DayEntry } from './x';\nexport type A = unique\nimport("${PAYLOAD}")\nexport const a: DayEntry[] = [];\n`,
    "export type, unique, then a template holding an import()": `export type A = unique\n\`\${import("${PAYLOAD}")}\`\nexport const a = [];\n`,
    "as unique, then an import() on the next line": `export const a = [] as unique\nimport("${PAYLOAD}")\n`,
    "satisfies unique, then an import() on the next line": `export const a = [] satisfies unique\nimport("${PAYLOAD}")\n`,
    "export type, unique, then typeof on the next line": "export type A = unique\ntypeof B\nexport const a = [];\n",
  };
  for (const [name, src] of Object.entries(uniqueBypasses)) {
    const problems = readingOne(src);
    if (!problems.some((p) => p.what.includes("unique"))) {
      throw new Error(`data-shape self-test: reading one must refuse "${name}" for its \`unique\`, got "${problems[0]?.what ?? "nothing"}"`);
    }
    const runtimeLine = src.split("\n").findIndex((l) => /^(import\(|`|typeof)/.test(l)) + 1;
    const line = lineOfProblem(src, readingTwo(src));
    if (line !== runtimeLine) {
      throw new Error(`data-shape self-test: reading two alone must refuse "${name}" on line ${runtimeLine}, got ${line ? `line ${line}` : "no problem at all"}`);
    }
  }

  // Code, in every spelling the grammar exists to exclude. Each reading must refuse each one on
  // its own: these are the things that would RUN.
  const refusedByBoth = {
    "a runtime named import": "import { x } from './x';\nexport const a = [];\n",
    "a runtime import of a type-marked name": "import { type X } from './x';\nexport const a = [];\n",
    "a bare side-effect import": "import './x';\nexport const a = [];\n",
    "a default import of a binding called type": "import type from './x';\nexport const a = [];\n",
    "a deferred import, which still runs the module": "import defer * as ns from './x';\nexport const a = [];\n",
    "import-equals require": "import x = require('./x');\nexport const a = [];\n",
    "a top-level call": "export const a = [];\nfoo();\n",
    "a call inside a literal": "export const a = [{ n: foo() }];\n",
    "a dynamic import inside a literal": "export const a = [import('./x')];\n",
    "a tagged template inside a literal": "export const a = { b: foo`x` };\n",
    "a template substitution": "export const a = `x${b}`;\n",
    "a getter": "export const a = { get b() { return 1; } };\n",
    "a method": "export const a = { b() { return 1; } };\n",
    "a computed key": "export const a = { [b]: 1 };\n",
    "a spread": "export const a = [...b];\n",
    "a shorthand property": "export const a = { b };\n",
    "a __proto__ key": "export const a = { __proto__: { x: 1 } };\n",
    "a quoted __proto__ key": "export const a = { \"__proto__\": { x: 1 } };\n",
    "a reference to another binding": "export const a = b;\n",
    "an arrow function": "export const f = () => 1;\n",
    "a let export": "export let a = [];\n",
    "a non-exported const": "const a = [];\n",
    "a second declarator that calls": "export const a = 1, b = foo();\n",
    "a destructured export": "export const { a } = { a: 1 };\n",
    "an enum, which emits runtime code": "export enum E { A }\n",
    "a namespace, which emits runtime code": "export namespace N { export const a = 1; }\n",
    "a default export": "export default [];\n",
    "a re-export": "export { a } from './x';\n",
    "an unterminated string": "export const a = \"never closed;\n",
    "a syntax error the parser would recover from": "export const a = [1, 2;\n",
    "a string on one line and a call on the next": "export const a = \"s\"\nfoo`x`\n",
    "a number that overflows to Infinity": "export const a = 1e400;\n",
  };
  for (const [name, src] of Object.entries(refusedByBoth)) {
    if (!readingOne(src).length) throw new Error(`data-shape self-test: reading one must refuse ${name}, and accepted it`);
    if (!readingTwo(src).length) throw new Error(`data-shape self-test: reading two must refuse ${name}, and accepted it`);
  }

  // Types outside the type grammar. Each parses cleanly in TypeScript, and esbuild erases most of
  // them, which is why only reading one is asked: a type esbuild erases runs nothing, and the
  // grammar refuses it anyway because the next `unique` is the one nobody has found yet.
  const refusedByTypeGrammar = {
    "an import() type": "export type A = import('./x').B;\n",
    "a typeof type": "export type A = typeof b;\n",
    "a keyof type": "export type A = keyof B;\n",
    "a readonly array operator": "export const a: readonly string[] = [];\n",
    "a unique symbol": "export type A = unique symbol;\n",
    "a template literal type": "export type A = `a${string}`;\n",
    "a conditional type": "export type A = B extends C ? D : E;\n",
    "a function type": "export type F = () => void;\n",
    "a JSDoc-only nullable type": "export const a: ?string = 'x';\n",
    "a generic type alias": "export type A<T> = T[];\n",
    "a generic interface": "export interface A<T> { a: T }\n",
    "an interface method": "export interface A { a(): void }\n",
    "an interface index signature": "export interface A { [k: string]: number }\n",
    "an initialiser inside an interface, which TypeScript parses without complaint":
      "export interface A { a: string = foo() }\nexport const a = [];\n",
    "a type inside `as` that names a value": "export const a = [] as typeof b;\n",
    "a type inside `satisfies` that imports": "export const a = [] satisfies import('./x').B;\n",
  };
  for (const [name, src] of Object.entries(refusedByTypeGrammar)) {
    if (!readingOne(src).length) throw new Error(`data-shape self-test: reading one must refuse ${name}, and accepted it`);
  }

  // Named, not merely refused: the words a person reading the build log needs, from reading one,
  // which is the reading that can name a construct in the source as it was written.
  const mustName = {
    "RUNTIME import": "import { x } from './x';\n",
    "tagged template": "export type A = string\nfoo`bar`\n",
    "initialiser": "export interface A { a: string = foo() }\n",
    "JSDoc": "export const a: ?string = 'x';\n",
    "import(...) type": "export type A = import('./x').B;\n",
    "too large to represent": "export const a = 1e400;\n",
  };
  for (const [words, src] of Object.entries(mustName)) {
    const message = readingOne(src)[0]?.what ?? "";
    if (!message.includes(words)) throw new Error(`data-shape self-test: the refusal of ${JSON.stringify(src)} must name "${words}", got "${message}"`);
  }

  // Reading two refuses a disagreement about exports even when every statement it sees is data.
  const disagree = findEsbuildProblems("export const a = 1;\n", ["a", "b"]);
  if (!disagree.length || !disagree[0].what.includes("disagreement")) {
    throw new Error(`data-shape self-test: an export-list disagreement between the readings must be refused, got "${disagree[0]?.what ?? "nothing"}"`);
  }

  // Shaped like the real files: the header comment, the type import every day lane carries, the
  // interfaces giantKillers/legends/longReads/posters declare, a type alias as sports.ts spells
  // one, the multi-line string const in giantKillers.ts, the one-line constants in posters.ts,
  // and every literal form a DayEntry uses. Plus the erased wrappers and the type forms the
  // grammar allows, and a string esbuild prints as a backtick string with a `${` inside it.
  const realShape = [
    "// Transfer Desk: daily wrap-up. The daily engine prepends new days.",
    "/* a block comment with a ; and a ( and a `backtick` in it */",
    "import type { DayEntry } from './worldCupDays';",
    "import type * as Lanes from './lanes';",
    "export interface Upset {",
    "  n: string;",
    "  years?: string; // optional",
    "  readonly count: number;",
    "  status: 'verified' | 'pending';",
    "  flags: (true | false | null | -1)[];",
    "  pair: [string, number];",
    "  inline: { a: string; b?: boolean };",
    "  tally: Record<string, number>;",
    "  lane: Lanes.Key | undefined;",
    "}",
    "export interface Extended extends Upset { extra: string & {} }",
    "export type Status = 'verified' | 'pending';",
    "export const giantKillersIntro =",
    "  'Every tournament sells you the favourites. This is the other history.';",
    "export const bundleUrl = 'https://thearchv.gumroad.com/l/sixty-moments';",
    "export const transferDays: DayEntry[] = [",
    "  {",
    "    date: \"2026-09-16\",",
    "    day: \"Wednesday\",",
    "    headline: \"Manchester United's line: \\\"rectifiable\\\", per ESPN; foo() and ${not} are just text\",",
    "    body: \"First paragraph.\\n\\nSecond paragraph, with ${this} and a unique\\nword in it.\",",
    "    status: 'verified',",
    "    image: \"/heads/haaland.webp\",",
    "  },",
    "  { date: '2026-09-15', n: 3, delta: -2, ratio: 0.5, big: 1e3, hex: 0x10, ok: true, no: false, gone: null, missing: undefined, tpl: `plain backtick`, tags: ['a', 'b'], nested: { \"quoted key\": 1, 2: 'numeric key' } },",
    "];",
    "export const frozen = { a: 1 } as const;",
    "export const checked = [1, 2] satisfies number[];",
    "export const one = 1, two = 'two';",
    ";",
    "",
  ].join("\n");
  const realProblems = findDataShapeProblems(realShape);
  if (realProblems.length) {
    throw new Error(`data-shape self-test: a file shaped like the real data must pass, got: ${realProblems.map((p) => p.what).join("; ")}`);
  }
  // No semicolons at all is still a data file: statement ends are the parsers' call, not ours.
  if (findDataShapeProblems("import type { A } from './x'\nexport const a: A[] = [\n  { b: 1 },\n]\n").length) {
    throw new Error("data-shape self-test: a semicolon-free data file must pass");
  }
  // A file of types alone runs nothing, and both readings must agree that it exports no values.
  if (findDataShapeProblems("export interface A { a: string }\nexport type B = A[];\n").length) {
    throw new Error("data-shape self-test: a file of types alone must pass");
  }

  // The throwing wrapper: quiet on data, loud on code, and the message names the file and line.
  assertPureDataModule(realShape, "self-test/real-shape.ts");
  let thrown = "";
  try { assertPureDataModule("export type A = string\nfoo`bar`\n", "self-test/probe.ts"); } catch (err) { thrown = err.message; }
  if (!thrown.includes("self-test/probe.ts:2:1")) throw new Error(`data-shape self-test: the refusal must name file:line:column, got "${thrown.split("\n")[0]}"`);
})();
