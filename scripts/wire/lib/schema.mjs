/* schema.mjs: validate and sanitise the two content files, and build the two public feeds.
   Pure, no dependencies. The build is FAIL-SOFT on content: a bad item or block is dropped with a
   log line and the rest ships. Only unparseable JSON fails the build (design-final C).
   The public schemas are NEW files, versioned on their own (archv-wire/1, archv-tables/1), and
   never touch index.json or any existing feed, because shipped iOS builds decode those. */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { linkAllowed } from "./canon.mjs";

export const WIRE_SCHEMA = "archv-wire/1";
export const TABLES_SCHEMA = "archv-tables/1";
export const SPORT_KEYS = ["football", "nfl", "f1", "tennis", "golf", "basketball"];
export const TABLE_KINDS = ["standings", "ranking", "fixtures", "results", "event"];
export const EDITION_MAX_AGE_DAYS = 7;
export const BLOCK_MAX_AGE_DAYS = 14;

const HERE = dirname(fileURLToPath(import.meta.url));
export const SOURCES = JSON.parse(readFileSync(join(HERE, "..", "sources.json"), "utf8"));
// Every host any registered source may link to. A disabled source's host is still a legal link
// in an old edition; an unregistered host never is.
const LINK_HOSTS = [...new Set(SOURCES.sources.flatMap((s) => s.linkHosts || []))];
const ATTRIBUTION_HOSTS = ["football-data.org", "github.com", "githubusercontent.com", "creativecommons.org", "wikipedia.org", "balldontlie.io", "jolpi.ca"];

const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
const isIso = (s) => typeof s === "string" && !Number.isNaN(Date.parse(s)) && /^\d{4}-\d{2}-\d{2}T/.test(s);
const str = (s, max = 400) => typeof s === "string" && s.trim() !== "" && s.length <= max;
const log = (quiet, msg) => { if (!quiet) console.warn(`[wire-schema] ${msg}`); };

export function daysBetween(a, b) {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}

export function sanitiseItem(it, { quiet = false } = {}) {
  const why = [];
  if (!it || typeof it !== "object") return log(quiet, "item is not an object, dropped"), null;
  if (!str(it.id, 120)) why.push("id");
  if (!SPORT_KEYS.includes(it.sport)) why.push("sport");
  if (!(it.league == null || /^[a-z0-9-]{1,20}$/.test(it.league))) why.push("league");
  if (!str(it.sourceId, 60)) why.push("sourceId");
  if (!str(it.source, 60)) why.push("source");
  if (!str(it.headline, 300)) why.push("headline");
  if (!linkAllowed(it.url, LINK_HOSTS)) why.push("url");
  if (!(it.publishedAt == null || isIso(it.publishedAt))) why.push("publishedAt");
  if (!(it.publishedDate == null || isDate(it.publishedDate))) why.push("publishedDate");
  if (why.length) return log(quiet, `item ${it.id ?? "?"} dropped (${why.join(", ")})`), null;
  const note = typeof it.note === "string" && it.note.trim() && it.note.length <= 200 ? it.note.trim() : null;
  return {
    id: it.id, sport: it.sport, league: it.league ?? null, sourceId: it.sourceId, source: it.source,
    headline: it.headline, url: it.url, publishedAt: it.publishedAt ?? null, publishedDate: it.publishedDate ?? null,
    timePrecision: it.timePrecision === "exact" ? "exact" : "date",
    firstSeenAt: isIso(it.firstSeenAt) ? it.firstSeenAt : null,
    guidKey: it.guidKey ?? null, urlKey: it.urlKey ?? null, titleKey: it.titleKey ?? null,
    note,
  };
}

export function sanitiseWire(raw, opts = {}) {
  const out = { version: 1, updatedAt: isIso(raw?.updatedAt) ? raw.updatedAt : null, editions: [] };
  const eds = Array.isArray(raw?.editions) ? raw.editions : [];
  const seenDates = new Set();
  for (const ed of eds) {
    if (!ed || !isDate(ed.date)) { log(opts.quiet, "edition without a valid date dropped"); continue; }
    if (seenDates.has(ed.date)) { log(opts.quiet, `duplicate edition ${ed.date} dropped`); continue; }
    seenDates.add(ed.date);
    const items = (Array.isArray(ed.items) ? ed.items : []).map((i) => sanitiseItem(i, opts)).filter(Boolean);
    const missing = (Array.isArray(ed.missing) ? ed.missing : []).filter((m) => m && str(m.sourceId, 60)).map((m) => ({ sourceId: m.sourceId, reason: String(m.reason || "unknown") }));
    out.editions.push({ date: ed.date, status: ed.status === "complete" ? "complete" : "partial", items, missing });
  }
  out.editions.sort((a, b) => (a.date < b.date ? 1 : -1));
  return out;
}

function sanitiseSource(s) {
  if (!s || !str(s.name, 80) || !str(s.attribution, 300)) return null;
  const okUrl = (u) => u == null || linkAllowed(u, ATTRIBUTION_HOSTS);
  if (!okUrl(s.url) || !okUrl(s.licenceUrl)) return null;
  return { name: s.name, attribution: s.attribution, url: s.url ?? null, licence: s.licence ?? null, licenceUrl: s.licenceUrl ?? null, adapted: !!s.adapted };
}

const CELL_OK = (v) => v === null || typeof v === "string" || (typeof v === "number" && Number.isFinite(v));

export function sanitiseBlock(b, { quiet = false } = {}) {
  const why = [];
  if (!b || typeof b !== "object") return null;
  if (!/^[a-z0-9-]{1,40}$/.test(b.id || "")) why.push("id");
  if (!TABLE_KINDS.includes(b.kind)) why.push("kind");
  if (!str(b.title, 120)) why.push("title");
  if (!isDate(b.asOf)) why.push("asOf");
  if (!Array.isArray(b.rows)) why.push("rows");
  const source = sanitiseSource(b.source);
  if (!source) why.push("source");
  const columns = Array.isArray(b.columns) ? b.columns.filter((c) => c && /^[a-z0-9_]{1,20}$/.test(c.key) && str(c.label, 20)) : [];
  if ((b.kind === "standings" || b.kind === "ranking") && !columns.length) why.push("columns");
  if (why.length) return log(quiet, `block ${b?.id ?? "?"} dropped (${why.join(", ")})`), null;
  const rows = b.rows.filter((r) => r && typeof r === "object").map((r) => {
    const row = {};
    for (const k of ["name", "short", "group", "date", "kickoff", "home", "away", "competition", "round", "venue", "city", "winner", "ends", "starts", "tour", "category", "surface"]) {
      if (typeof r[k] === "string" && r[k].length <= 120) row[k] = r[k];
    }
    for (const k of ["homeScore", "awayScore"]) if (typeof r[k] === "number") row[k] = r[k];
    if (r.highlight === true) row.highlight = true;
    if (r.cells && typeof r.cells === "object") {
      row.cells = {};
      for (const c of columns) if (CELL_OK(r.cells[c.key])) row.cells[c.key] = r.cells[c.key];
    }
    return row;
  });
  return {
    id: b.id, kind: b.kind, league: typeof b.league === "string" ? b.league : null, title: b.title,
    asOf: b.asOf, fetchedAt: isIso(b.fetchedAt) ? b.fetchedAt : null,
    status: b.status === "held" ? "held" : "fresh", heldReason: typeof b.heldReason === "string" ? b.heldReason : null,
    heldDays: Number.isInteger(b.heldDays) ? b.heldDays : 0,
    lastFreshAsOf: isDate(b.lastFreshAsOf) ? b.lastFreshAsOf : b.asOf,
    // Optional, additive: what the data reflects, as distinct from when it was fetched (asOf).
    through: isDate(b.through) ? b.through : null,
    throughLabel: str(b.throughLabel, 80) ? b.throughLabel : null,
    compactRows: Number.isInteger(b.compactRows) ? b.compactRows : null,
    columns: columns.map((c) => ({ key: c.key, label: c.label, labelKey: typeof c.labelKey === "string" ? c.labelKey : null, align: c.align === "start" ? "start" : "end" })),
    rows, source, emptyText: typeof b.emptyText === "string" ? b.emptyText : null,
  };
}

export function sanitiseTables(raw, opts = {}) {
  const out = { version: 1, updatedAt: isIso(raw?.updatedAt) ? raw.updatedAt : null, sports: {} };
  const sports = raw && typeof raw.sports === "object" && raw.sports ? raw.sports : {};
  for (const key of SPORT_KEYS) {
    const blocks = Array.isArray(sports[key]?.blocks) ? sports[key].blocks.map((b) => sanitiseBlock(b, opts)).filter(Boolean) : [];
    if (blocks.length) out.sports[key] = { blocks };
  }
  return out;
}

// The one edition readers may see: the newest, and only if it is at most 7 days old.
export function currentEdition(wire, today) {
  const ed = wire.editions[0];
  if (!ed || !ed.items.length) return null;
  if (daysBetween(ed.date, today) > EDITION_MAX_AGE_DAYS) return null;
  return ed;
}

// Blocks readers may see: held no more than 3 days, and fetched fresh within the last 14 days.
// Keyed on the last fresh FETCH, never on the newest result: a table fetched today is current
// through an international break or an off week.
export const blockVisible = (b, today) => b.heldDays <= 3 && daysBetween(b.lastFreshAsOf || b.asOf, today) <= BLOCK_MAX_AGE_DAYS;

export function buildWireFeed(wire, { generatedAt }) {
  const ed = wire.editions[0] || null;
  return {
    schema: WIRE_SCHEMA,
    generatedAt,
    edition: ed ? { date: ed.date, status: ed.status, timeZone: SOURCES.editionTimeZone } : null,
    items: ed ? ed.items.map((i) => ({
      id: i.id, sport: i.sport, league: i.league, source: { id: i.sourceId, name: i.source },
      headline: i.headline, url: i.url, publishedAt: i.publishedAt, publishedDate: i.publishedDate,
      timePrecision: i.timePrecision, note: i.note,
    })) : [],
    footer: SOURCES.footer,
  };
}

export function buildTablesFeed(tables, { generatedAt }) {
  return { schema: TABLES_SCHEMA, generatedAt, updatedAt: tables.updatedAt, sports: tables.sports };
}
