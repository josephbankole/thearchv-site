import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sanitiseWire } from "../lib/schema.mjs";
import { renderHomeWire } from "../lib/home.mjs";
import { wireLinkProblems, wireCssProblems } from "../../check-wire-links.mjs";

/* The front-page Wire block (spec B1.8, 2026-10-28). */
const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const SOURCES = load("./fixtures/sources.json");
const raw = load("./fixtures/daily/wire.json");
// The fixture edition plus a club-tagged extra at rank 2, which must not show here.
raw.editions[0].items.push({ ...raw.editions[0].items[0], id: "espn-soccer:extra000002", rank: 2,
  headline: "Arsenal beat Chelsea in the London derby", url: "https://www.espn.com/soccer/story/_/id/93000002/derby", note: null });
const wire = sanitiseWire(raw, { quiet: true, sources: SOURCES });

test("no current edition renders nothing at all", () => {
  assert.equal(renderHomeWire(sanitiseWire({ editions: [] }), "2026-09-27"), "");
  assert.equal(renderHomeWire(wire, "2026-10-05"), "", "an edition past seven days is not shown");
});

test("the block: one section, the app's subline, rank-1 items in sport order, the footer and the Wire page link", () => {
  const html = renderHomeWire(wire, "2026-09-27");
  assert.match(html, /^<section class="wire wire--home" aria-labelledby="home-wire-title">/);
  assert.match(html, /<h2 id="home-wire-title" class="wire__title">The Wire<\/h2>/);
  assert.match(html, /<p class="wire__subline">Headlines from other newsrooms, picked once a day\.<\/p>/);
  assert.match(html, /<p class="wire__edition">Edition of <time datetime="2026-09-27">Sunday 27 September<\/time>\.<\/p>/);
  assert.match(html, /provided by ESPN/);
  assert.match(html, /<p class="wire__more"><a href="\/wire\/">The Wire page<\/a><\/p>/);
  const sports = [...html.matchAll(/data-wire-sport="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(sports, ["football", "nfl", "f1", "golf", "basketball", "basketball"]);
  assert.deepEqual([...html.matchAll(/data-wire-pos="(\d+)"/g)].map((m) => Number(m[1])), [1, 2, 3, 4, 5, 6]);
  assert.ok(!/Arsenal beat Chelsea/.test(html), "a rank-2 extra is not on the front page");
  assert.match(html, /<span class="wire-item__note-label">Our note<\/span>/);
  assert.ok(!/<img/i.test(html));
  assert.ok(!/<script/i.test(html), "nothing in the homepage render may emit a script tag");
});

test("every link passes the Wire link check", () => {
  const html = renderHomeWire(wire, "2026-09-27");
  const tags = [...html.matchAll(/<a\b[^>]*data-wire-source[^>]*>/g)].map((m) => m[0]);
  assert.equal(tags.length, 6);
  for (const t of tags) assert.deepEqual(wireLinkProblems(t, SOURCES), [], t);
});

test("an old edition is labelled stale", () => {
  assert.match(renderHomeWire(wire, "2026-09-29"), /<span class="wire__stale">No new edition since then\.<\/span>/);
});

test("the CSS region check covers a second file and only requires it when asked", () => {
  assert.deepEqual(wireCssProblems("body {}", "src/style.css", false), []);
  assert.deepEqual(wireCssProblems("body {}", "src/style.css", true), ["src/style.css: wire CSS region markers missing"]);
  assert.deepEqual(wireCssProblems("/* wire:start */ .wire--home { color: var(--ink); } /* wire:end */", "src/style.css"), []);
  assert.deepEqual(wireCssProblems("/* wire:start */ .wire--home { animation: x 1s; } /* wire:end */", "src/style.css"), ['src/style.css wire CSS region contains "animation"']);
});
