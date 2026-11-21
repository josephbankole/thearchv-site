/* margin-art.test.mjs — the side-margin drawing's contract ("Field lines", founder's pick, 2026-11-21).
 *
 * Runs in `npm run test:home`, which sits in `npm run build` after `vite build` and BEFORE the
 * sport pages are written. So the front page is checked in dist, and a sport hub is checked both
 * through masthead() (always) and in dist/nfl/ when a build has left one there.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { marginArt, MARGIN_ART_SPORTS, MARGIN_ART_DEFAULT } from "../shared/margin-art.mjs";
import { SPORTS, NO_SPORT, masthead, pageStyles } from "../shared/page-shell.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...p) => readFileSync(join(ROOT, ...p), "utf8");
const KEYS = SPORTS.map((s) => s.key);
const layers = (html) => [...html.matchAll(/<div class="margin-art margin-art--([lr])"([^>]*)>/g)];
const scripts = (html) => (html.match(/<script\b/g) || []).length;

function assertLayers(html, key, where) {
  const found = layers(html);
  assert.deepEqual(found.map((m) => m[1]), ["l", "r"], `${where}: one left and one right layer`);
  for (const [, , attrs] of found) {
    assert.match(attrs, /\saria-hidden="true"/, `${where}: a layer is not aria-hidden`);
    assert.match(attrs, /\shidden(\s|$)/, `${where}: a layer lost the hidden attribute, its fail-closed state`);
    assert.ok(attrs.includes(`data-margin-art="${key}"`), `${where}: expected the ${key} drawing`);
  }
}

test("every sport key has a drawing, and nothing extra", () => {
  assert.deepEqual([...MARGIN_ART_SPORTS].sort(), [...KEYS].sort());
  for (const key of KEYS) {
    const html = marginArt(key);
    assertLayers(html, key, key);
    assert.ok((html.match(/<path /g) || []).length >= 16, `${key}: too few paths to be a drawing`);
  }
});

test("a page with no sport, or an unknown one, gets the pitch", () => {
  assert.equal(MARGIN_ART_DEFAULT, "football");
  for (const key of [NO_SPORT, undefined, "curling"]) assert.equal(marginArt(key), marginArt("football"));
});

test("a drawing is inert paths: no script, image, text, link, class .rail or transform", () => {
  for (const key of KEYS) {
    const html = marginArt(key);
    assert.equal(scripts(html), 0, `${key}: a <script> here breaks the front page's CSP count`);
    assert.ok(!/<image|<text|<a\b|href=|<foreignObject|on[a-z]+=/.test(html), `${key}: paths only`);
    assert.ok(!/class="[^"]*\brail\b/.test(html), `${key}: .rail is the removed poster rail's name`);
    assert.ok(!/transform/.test(html), `${key}: nothing in a layer is transformed (trap 3)`);
    assert.ok(!/#[0-9a-f]{6}\b/i.test(html), `${key}: colour comes from tokens in the stylesheet`);
    // the accent is a fill on one or two small marks, never a line
    const accents = (html.match(/class="dot dot-a"/g) || []).length / 2;
    assert.ok(accents >= 1 && accents <= 2, `${key}: ${accents} accent marks`);
    // every inked mark starts and ends inside the scroll
    for (const [, a, w] of html.matchAll(/--a:([\d.]+);--w:([\d.]+)/g)) {
      assert.ok(+a >= 0 && +w > 0 && +a + +w <= 0.99, `${key}: --a ${a} + --w ${w} runs past the end`);
    }
  }
});

test("masthead() carries the page's own sport, outside <header>, and adds no script", () => {
  for (const key of KEYS) {
    const html = masthead(key);
    assertLayers(html, key, `masthead(${key})`);
    assert.ok(html.indexOf("margin-art") < html.indexOf('<header class="masthead">'), "the layers must sit outside the masthead's stacking context");
    assert.equal(scripts(html), 1, "the masthead has exactly its one toggle script");
  }
  assertLayers(masthead(NO_SPORT), "football", "masthead(NO_SPORT)");
  assertLayers(masthead(), "football", "masthead()");
});

test("the two stylesheets agree on the ink rules, and neither needs JavaScript", () => {
  const cut = (css) => {
    const m = css.match(/\/\* margin-art:ink[\s\S]*?\/\* margin-art:end \*\//);
    assert.ok(m, "the margin-art:ink block is missing");
    return m[0].replace(/\s+/g, " ");
  };
  const home = read("src", "style.css");
  const shell = pageStyles();
  assert.equal(cut(home), cut(shell), "src/style.css and pageStyles() have drifted");
  for (const [name, css] of [["src/style.css", home], ["pageStyles()", shell]]) {
    const block = css.slice(css.indexOf("@property --margin-ink"), css.indexOf("/* margin-art:end */"));
    assert.match(block, /@property --margin-ink \{[^}]*initial-value: 1/, `${name}: the resting value must be the finished drawing`);
    assert.match(block, /\.margin-art \{\s*display: none;/, `${name}: hidden until a width rule says otherwise`);
    assert.match(block, /@supports \(animation-timeline: scroll\(\)\)/, `${name}: the scroll timeline must sit inside @supports`);
    assert.match(block, /@media \(prefers-reduced-motion: reduce\) \{ \.margin-art \{ animation: none; \} \}/);
    assert.match(block, /\.reduced-motion \.margin-art \{ animation: none; \}/);
    assert.match(block, /pointer-events: none/);
    assert.ok(!/overflow|transform|translate/.test(block.replace(/\/\*[\s\S]*?\*\//g, "")), `${name}: no overflow and no transform on a layer (trap 3)`);
    assert.ok(!/url\(/.test(block), `${name}: no image is fetched`);
  }
  // thresholds: the empty margin has to be about 140px before a layer shows
  assert.doesNotMatch(home, /\.margin-art--l \{ display: block; \}/); // founder-side call 21 Nov 2026: never one half alone
  assert.match(home, /@media \(min-width: 1560px\) \{ \.margin-art \{ display: block; width: calc\(\(100vw - var\(--maxw\)\) \/ 2 - 1\.75rem\); \} \}/);
  assert.match(shell, /@media \(min-width: 77\.5em\) \{ \.margin-art \{ display: block; \} \}/);
  assert.match(shell, /@media \(min-width: 63\.5em\) \{ body:not\(:has\(\.wrap--wide\)\) \.margin-art \{ display: block; --margin-col: 46rem; \} \}/);
});

test("dist/index.html has the two layers and still exactly its own scripts", { skip: !existsSync(join(ROOT, "dist", "index.html")) }, () => {
  const html = read("dist", "index.html");
  assertLayers(html, "football", "dist/index.html");
  assert.ok(!html.includes("<!--archv:margin-art-->"), "the marker was not filled");
  const src = read("index.html");
  assert.equal(scripts(html), scripts(src), "the margin art added a <script> to the front page");
});

test("a built sport hub has its own sport's layers", { skip: !existsSync(join(ROOT, "dist", "nfl", "index.html")) }, () => {
  const html = read("dist", "nfl", "index.html");
  assertLayers(html, "nfl", "dist/nfl/index.html");
  assert.ok(html.includes("@property --margin-ink"), "the sport hub lost the margin-art styles");
});
