/* satori-svg-internal.test.mjs: satori's SVG never leaves the build (audit deps-supply-chain-10).

   satori 0.26 sits in an advisory range for SVG escaping. That only matters if its SVG reaches a
   reader: today every card is satori to SVG, then resvg to PNG, and only the PNG is written. These
   checks keep it that way until satori takes its planned major bump. If one fails, a script has
   started importing satori somewhere new or writing an .svg file; route it through card-brand.mjs
   or page-card.mjs and write the PNG instead. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), "..");

// The only modules allowed to call satori. Both hand its SVG straight to resvg.
const SATORI_MODULES = ["shared/card-brand.mjs", "shared/page-card.mjs"];
// The only .svg files the build writes. The favicon is drawn by hand, not by satori.
const SVG_WRITERS = ["build-crest.mjs"];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "fixtures") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.m?js$/.test(name)) out.push(p);
  }
  return out;
}

const files = walk(SCRIPTS).map((p) => ({ rel: relative(SCRIPTS, p), src: readFileSync(p, "utf8") }));

test("satori is imported only by the two card modules", () => {
  const importers = files
    .filter((f) => /from\s+["']satori["']|import\(\s*["']satori["']\s*\)|require\(\s*["']satori["']\s*\)/.test(f.src))
    .map((f) => f.rel)
    .sort();
  assert.deepEqual(importers, [...SATORI_MODULES].sort());
});

test("every satori call feeds resvg and its SVG is never written to disk", () => {
  for (const rel of SATORI_MODULES) {
    const src = files.find((f) => f.rel === rel).src;
    const calls = [...src.matchAll(/const\s+(\w+)\s*=\s*await\s+satori\(/g)];
    assert.ok(calls.length > 0, `${rel}: expected a satori call`);
    assert.equal(calls.length, (src.match(/\bsatori\(/g) || []).length, `${rel}: satori output must be held in a const`);
    for (const [, name] of calls) {
      const uses = [...src.matchAll(new RegExp(`\\b${name}\\b`, "g"))].length;
      const toResvg = [...src.matchAll(new RegExp(`(?:new\\s+Resvg|renderAsync)\\(\\s*${name}\\b`, "g"))].length;
      // One use is the declaration; every other use must be the hand-off to resvg.
      assert.equal(uses - 1, toResvg, `${rel}: the satori SVG "${name}" is used somewhere other than resvg`);
    }
  }
});

test("no script writes an .svg file except the hand-drawn favicon", () => {
  const writers = files
    .filter((f) => /write(?:File)?(?:Sync)?\([^)]*\.svg["'`]/.test(f.src))
    .map((f) => f.rel)
    .sort();
  assert.deepEqual(writers, [...SVG_WRITERS].sort());
});
