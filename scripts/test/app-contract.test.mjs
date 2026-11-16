/* app-contract.test.mjs: the archv-feed/3 files against the iOS app's decoders (audit gap1-1,
   2026-11-15). TheARCHV decodes today, every lane and sport feed, posters, archive and storefront
   with strict Swift Codable structs (TheARCHV/Models.swift): one element with a required key
   missing, or any key of the wrong type, throws away the whole file on every installed build and
   in the widget. Nothing else checks those shapes before deploy, so this does, per element.

   Reads the BUILT dist, like home-feeds.test.mjs, so it runs in `npm run build` (test:home) straight
   after build-feed.mjs. DIST points it at another build.

   The rules mirror Swift's synthesised Decodable: a non-optional String must be present and a
   string (empty is allowed by the decoder, but the feeds never ship one, so it is flagged); an
   optional String may be absent or null but must be a string when present; a URL must be a string
   URL() can parse. Keep the KEY lists in step with Models.swift when the app adds a required field. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SPORTS } from "../shared/page-shell.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const DIST = process.env.DIST || join(ROOT, "dist");
const readFeed = (name) => JSON.parse(readFileSync(join(DIST, "feed", `${name}.json`), "utf8"));

// Models.swift, struct by struct: required String keys, then optional String keys.
const SHAPES = {
  DayEntry: {
    required: ["date", "day", "headline", "dek", "body", "status"],
    optional: ["image", "imageAlt", "section", "url", "infogram", "infogramAlt"],
  },
  Poster: { required: ["slug", "year", "title", "moment", "stamp"], optional: ["host", "city", "etsyUrl", "image"] },
  Legend: { required: ["no", "name", "nation", "headshot", "bio"], optional: ["years"] },
  Upset: { required: ["n", "match", "meta", "body"], optional: [] },
  LongRead: { required: ["kicker", "title", "meta", "date", "body"], optional: ["url", "bodyMarkdown", "sport"] },
  StorefrontItem: { required: ["id", "name", "price"], optional: [], urls: ["image", "url"] },
};

const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const isUrl = (v) => {
  if (typeof v !== "string" || v.trim() === "") return false;
  try { new URL(v); return true; } catch { return false; }
};

/** Every problem with one element, as "<where>: <what>" lines. Empty means it decodes. */
export function problems(shape, value, where) {
  const s = SHAPES[shape];
  if (!isObj(value)) return [`${where}: not an object`];
  const out = [];
  for (const k of s.required) {
    if (typeof value[k] !== "string") out.push(`${where}.${k}: required string, got ${value[k] === undefined ? "nothing" : typeof value[k]}`);
    else if (value[k].trim() === "") out.push(`${where}.${k}: empty`);
  }
  for (const k of s.optional) {
    if (value[k] != null && typeof value[k] !== "string") out.push(`${where}.${k}: optional string, got ${typeof value[k]}`);
  }
  for (const k of s.urls ?? []) {
    if (!isUrl(value[k])) out.push(`${where}.${k}: required URL, got ${JSON.stringify(value[k])}`);
  }
  return out;
}

function arrayOf(shape, arr, where) {
  if (!Array.isArray(arr)) return [`${where}: required array, got ${arr === null ? "null" : typeof arr}`];
  return arr.flatMap((v, i) => problems(shape, v, `${where}[${i}]`));
}

const assertClean = (list) => assert.deepEqual(list, [], `\n${list.slice(0, 20).join("\n")}`);

// The day-entry lane files are every feed in the manifest except the three with their own
// envelopes, so a new sport feed is covered the day build-feed.mjs starts writing it.
const OWN_ENVELOPE = new Set(["today", "posters", "archive"]);
const laneFeeds = () => readFeed("index").feeds.map((f) => f.name).filter((n) => !OWN_ENVELOPE.has(n));

test("today.json decodes as TodayFeed: lead a DayEntry or null, wrap an array of DayEntry", () => {
  const f = readFeed("today");
  assert.ok("lead" in f, "lead key missing (TodayFeed needs it present, null allowed)");
  const list = f.lead === null ? [] : problems("DayEntry", f.lead, "today.lead");
  assertClean([...list, ...arrayOf("DayEntry", f.wrap, "today.wrap")]);
});

test("every lane and sport feed decodes as DaysFeed", () => {
  const names = laneFeeds();
  for (const lane of ["transfer", "worldcup", "leagues"]) assert.ok(names.includes(lane), `${lane} missing from index.json`);
  assertClean(names.flatMap((n) => arrayOf("DayEntry", readFeed(n).days, `${n}.days`)));
});

// site-build-12: the envelope and the routing fields. The app finds every file through index.json,
// polls lastUpdated, routes a push by `section` to <section>.json and opens `url`. A football lane's
// section is its feed name (worldcup, not world-cup); a sport's is the sport key, never its lane key
// (build-feed.mjs CONTRACT). The URL shapes are written out here rather than taken from
// page-shell.mjs, so a change there that moves the article URLs fails this test instead of passing it.
const SITE = "https://thearchv.ca";
const FOOTBALL_URL_LANE = { transfer: "transfer", worldcup: "world-cup", leagues: "leagues" };
const SPORT_BY_KEY = new Map(SPORTS.filter((s) => s.key !== "football").map((s) => [s.key, s]));
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function expectedUrl(feed, date) {
  if (FOOTBALL_URL_LANE[feed]) return `${SITE}/desk/${FOOTBALL_URL_LANE[feed]}/${date}/`;
  const sport = SPORT_BY_KEY.get(feed);
  return sport ? `${SITE}/${sport.urlBase}/${sport.lanes[0]}/${date}/` : null;
}

test("every file index.json lists exists at its path and carries the manifest's schema", () => {
  const manifest = readFeed("index");
  const list = [];
  for (const f of manifest.feeds) {
    if (f.path !== `/feed/${f.name}.json`) { list.push(`index.feeds ${f.name}: path ${f.path}`); continue; }
    const file = join(DIST, "feed", `${f.name}.json`);
    if (!existsSync(file)) { list.push(`index.feeds ${f.name}: ${f.path} was not built`); continue; }
    const feed = readFeed(f.name);
    if (feed.schema !== manifest.schema) list.push(`${f.name}.schema: ${JSON.stringify(feed.schema)}, index says ${manifest.schema}`);
  }
  assertClean(list);
});

test("every lane and sport feed has a lastUpdated and routes each entry to its own file and page", () => {
  const list = [];
  for (const name of laneFeeds()) {
    const feed = readFeed(name);
    const newest = Array.isArray(feed.days) && feed.days.length ? feed.days[0].date : null;
    if (newest === null ? feed.lastUpdated !== null : !(typeof feed.lastUpdated === "string" && ISO_DAY.test(feed.lastUpdated)))
      list.push(`${name}.lastUpdated: ${JSON.stringify(feed.lastUpdated)}`);
    if (expectedUrl(name, "x") === null) { list.push(`${name}: not a football lane or a SPORTS key`); continue; }
    (feed.days || []).forEach((d, i) => {
      if (d.section !== name) list.push(`${name}.days[${i}].section: ${JSON.stringify(d.section)}, want "${name}"`);
      if (d.url !== expectedUrl(name, d.date)) list.push(`${name}.days[${i}].url: ${JSON.stringify(d.url)}, want ${expectedUrl(name, d.date)}`);
    });
  }
  assertClean(list);
});

test("posters.json decodes as PostersFeed", () => {
  assertClean(arrayOf("Poster", readFeed("posters").posters, "posters"));
});

test("archive.json decodes as ArchiveFeed", () => {
  const f = readFeed("archive");
  const gk = f.giantKillers;
  const list = [
    ...arrayOf("Legend", f.legends, "archive.legends"),
    ...arrayOf("LongRead", f.longReads, "archive.longReads"),
  ];
  if (!isObj(gk)) list.push("archive.giantKillers: required object");
  else {
    for (const k of ["intro", "outro"]) if (typeof gk[k] !== "string") list.push(`archive.giantKillers.${k}: required string`);
    list.push(...arrayOf("Upset", gk.upsets, "archive.giantKillers.upsets"));
  }
  assertClean(list);
});

test("storefront.json decodes as StorefrontFeed", () => {
  const f = readFeed("storefront");
  const list = isUrl(f.shopUrl) ? [] : ["storefront.shopUrl: required URL"];
  assertClean([...list, ...arrayOf("StorefrontItem", f.items, "storefront.items")]);
});

test("the checker itself catches the drift it exists for", () => {
  const good = { date: "2026-11-15", day: "Sunday", headline: "h", dek: "d", body: "b", status: "confirmed" };
  assert.deepEqual(problems("DayEntry", good, "x"), []);
  const { day, ...noDay } = good;
  assert.equal(problems("DayEntry", noDay, "x").length, 1, "a dropped `day` must fail");
  assert.equal(problems("DayEntry", { ...good, image: 3 }, "x").length, 1, "a non-string optional must fail");
  assert.deepEqual(problems("DayEntry", { ...good, image: null }, "x"), [], "null optional decodes");
  assert.equal(arrayOf("DayEntry", null, "wrap").length, 1, "a null wrap must fail");
  assert.equal(problems("StorefrontItem", { id: "1", name: "n", price: "p", image: "", url: "https://a.b" }, "s").length, 1);
});
