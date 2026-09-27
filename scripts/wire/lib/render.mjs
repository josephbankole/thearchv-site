/* render.mjs: pure HTML renderers for the Wire and the table blocks, used by
   build-daily-pages.mjs (/wire/, /tables/) and build-sport-pages.mjs (the per-sport strip).
   Calm by construction: no images, no logos, no crests, no relative times, no "live", nothing
   that moves. Every outbound link opens in a new tab with rel="noopener noreferrer", and its href
   is the feed's own URL, escaped for the attribute and otherwise untouched. A renderer with
   nothing to show returns '' so no empty section ever ships. */
import { esc, escAttr } from "../../shared/page-shell.mjs";
import { SOURCES, currentEdition, blockVisible, daysBetween } from "./schema.mjs";

const fmt = (iso, opts) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts }).format(new Date(iso + "T00:00:00Z"));
export const editionLabel = (date) => fmt(date, { weekday: "long", day: "numeric", month: "long" });
const dayMonth = (date) => fmt(date, { day: "numeric", month: "short" });
const fullDate = (date) => fmt(date, { day: "numeric", month: "long", year: "numeric" });

export const WIRE_SUBLINE = "Headlines from other newsrooms, picked once a day. One story per source, linked to the publisher.";
export const LEAGUE_LABEL = { nba: "NBA", wnba: "WNBA" };

function itemTime(it) {
  if (!it.publishedDate) return "";
  let label = dayMonth(it.publishedDate);
  if (it.timePrecision === "exact" && it.publishedAt) {
    const t = new Intl.DateTimeFormat("en-GB", { timeZone: SOURCES.editionTimeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(it.publishedAt));
    label += `, ${t} ET`;
  }
  return ` <span aria-hidden="true">&middot;</span> <time datetime="${escAttr(it.publishedDate)}">${esc(label)}</time>`;
}

export function renderWireItem(it, pos) {
  const league = it.league && LEAGUE_LABEL[it.league] ? ` <span aria-hidden="true">&middot;</span> ${esc(LEAGUE_LABEL[it.league])}` : "";
  const note = it.note
    ? `\n        <p class="wire-item__note"><span class="wire-item__note-label">Our note</span> ${esc(it.note)}</p>`
    : "";
  return `<li class="wire-item">
        <p class="wire-item__meta"><span class="wire-item__source">${esc(it.source)}</span>${league}${itemTime(it)}</p>
        <h3 class="wire-item__headline"><a href="${escAttr(it.url)}" target="_blank" rel="noopener noreferrer" data-wire-source="${escAttr(it.sourceId)}" data-wire-sport="${escAttr(it.sport)}" data-wire-pos="${pos}">${esc(it.headline)}</a></h3>${note}
      </li>`;
}

// The edition line. The web never says "today": a static page can outlive its day.
export function renderEditionLine(ed, today) {
  const stale = daysBetween(ed.date, today) > 0 ? ` <span class="wire__stale">No new edition since then.</span>` : "";
  return `<p class="wire__edition">Edition of <time datetime="${escAttr(ed.date)}">${esc(editionLabel(ed.date))}</time>.${stale}</p>`;
}

export const renderWireFooter = () => `<p class="wire__footer">${esc(SOURCES.footer)}</p>`;

/* A sport's items, in feed order (basketball: NBA then WNBA, as equals). */
export function wireItemsFor(ed, sportKey) {
  const items = ed.items.filter((i) => i.sport === sportKey);
  if (sportKey === "basketball") items.sort((a, b) => (a.league === b.league ? 0 : a.league === "nba" ? -1 : 1));
  return items;
}

/* The per-sport strip for a sport hub. '' when there is no current edition or no item. */
export function renderWireStrip(wire, sportKey, today) {
  const ed = currentEdition(wire, today);
  if (!ed) return "";
  const items = wireItemsFor(ed, sportKey);
  if (!items.length) return "";
  return `<section class="wire wire--strip" aria-labelledby="wire-title-${escAttr(sportKey)}">
      <h2 id="wire-title-${escAttr(sportKey)}" class="wire__title">The Wire</h2>
      <p class="wire__subline">${esc(WIRE_SUBLINE)}</p>
      ${renderEditionLine(ed, today)}
      <ul class="wire__list">
      ${items.map((it, i) => renderWireItem(it, i + 1)).join("\n      ")}
      </ul>
      ${renderWireFooter()}
      <p class="wire__more"><a href="/wire/#${escAttr(sportKey)}">Every sport on the Wire</a></p>
    </section>`;
}

/* ---------- tables ---------- */

function blockFooter(b) {
  // asOf is the day the data was fetched; through/throughLabel say what it reflects.
  const reflects = b.throughLabel || (b.through ? `Results to ${fullDate(b.through)}` : "");
  const when = `${b.status === "held" ? "Last updated" : "Updated"} ${fullDate(b.asOf)}${reflects ? `. ${reflects}` : ""}`;
  const s = b.source;
  const src = s.url ? `<a href="${escAttr(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.attribution)}</a>` : esc(s.attribution);
  const lic = s.licence
    ? ` ${s.adapted ? "Adapted by The ARCHV. " : ""}${s.licenceUrl ? `<a href="${escAttr(s.licenceUrl)}" target="_blank" rel="noopener noreferrer">${esc(s.licence)}</a>` : esc(s.licence)}.`
    : "";
  return `<p class="tblock__foot"><span class="tblock__when">${esc(when)}.</span> ${src}${lic}</p>`;
}

const cell = (v) => (v === null || v === undefined ? "" : esc(String(v)));
const shortWhen = (r) => (r.date ? dayMonth(r.date) : "");

function renderTableRows(b, compact) {
  const grouped = b.rows.some((r) => r.group);
  let rows = b.rows;
  if (compact && b.compactRows) {
    if (grouped) {
      // Grouped tables (NFL divisions, basketball conferences): the top N of each group.
      const count = new Map();
      rows = rows.filter((r) => { const n = (count.get(r.group) || 0) + 1; count.set(r.group, n); return n <= b.compactRows || r.highlight; });
    } else {
      rows = [...rows.slice(0, b.compactRows), ...rows.slice(b.compactRows).filter((r) => r.highlight)];
    }
  }
  const head = b.columns.map((c) => `<th scope="col"${c.align === "end" ? ' class="num"' : ""}>${esc(c.label)}</th>`).join("");
  let lastGroup = null;
  const body = rows.map((r) => {
    let groupRow = "";
    if (grouped && r.group !== lastGroup) {
      lastGroup = r.group;
      groupRow = `<tr class="tblock__group"><th scope="colgroup" colspan="${b.columns.length}">${esc(r.group || "")}</th></tr>\n          `;
    }
    const tds = b.columns.map((c) => {
      const v = c.key === "team" || c.key === "name" ? (compact && r.short ? r.short : r.name) : r.cells?.[c.key];
      return c.align === "end" ? `<td class="num">${cell(v)}</td>` : `<td>${cell(v)}</td>`;
    }).join("");
    return `${groupRow}<tr${r.highlight ? ' class="is-highlight"' : ""}>${tds}</tr>`;
  }).join("\n          ");
  return `<table class="tblock__table">
        <caption class="visually-hidden">${esc(b.title)}</caption>
        <thead><tr>${head}</tr></thead>
        <tbody>
          ${body}
        </tbody>
      </table>`;
}

function renderMatchRows(b) {
  const items = b.rows.map((r) => {
    const score = b.kind === "results" && typeof r.homeScore === "number" ? `<span class="tblock__score">${r.homeScore} to ${r.awayScore}</span>` : `<span class="tblock__v">v</span>`;
    const meta = [shortWhen(r), r.competition, r.round].filter(Boolean).map(esc).join(" &middot; ");
    return `<li class="tblock__match"><span class="tblock__meta">${meta}</span><span class="tblock__teams"><span>${esc(r.home || "")}</span> ${score} <span>${esc(r.away || "")}</span></span></li>`;
  });
  return `<ul class="tblock__matches">
        ${items.join("\n        ")}
      </ul>`;
}

function renderEventRows(b) {
  const items = b.rows.map((r) => {
    const place = [r.venue, r.city].filter(Boolean).join(", ");
    const when = [r.date || r.starts, r.ends].filter(Boolean).map(dayMonth).join(" to ");
    const winner = r.winner ? `<span class="tblock__winner">Winner: ${esc(r.winner)}</span>` : "";
    return `<li class="tblock__event"><span class="tblock__teams">${esc(r.name || "")}</span><span class="tblock__meta">${[when, place, r.round].filter(Boolean).map(esc).join(" &middot; ")}</span>${winner}</li>`;
  });
  return `<ul class="tblock__matches">
        ${items.join("\n        ")}
      </ul>`;
}

export function renderTableBlock(b, { compact = false, today } = {}) {
  if (today && !blockVisible(b, today)) return "";
  let inner;
  if (!b.rows.length) {
    if (!b.emptyText) return "";
    inner = `<p class="tblock__empty">${esc(b.emptyText)}</p>`;
  } else if (b.kind === "standings" || b.kind === "ranking") inner = renderTableRows(b, compact);
  else if (b.kind === "event") inner = renderEventRows(b);
  else inner = renderMatchRows(b);
  return `<section class="tblock" id="tblock-${escAttr(b.id)}" aria-labelledby="tblock-title-${escAttr(b.id)}">
      <h3 class="tblock__title" id="tblock-title-${escAttr(b.id)}">${esc(b.title)}</h3>
      ${inner}
      ${blockFooter(b)}
    </section>`;
}

/* A sport's compact table blocks for its hub. '' when none are visible. */
export function renderTablesStrip(tables, sportKey, today) {
  const blocks = (tables.sports[sportKey]?.blocks || []).map((b) => renderTableBlock(b, { compact: true, today })).filter(Boolean);
  if (!blocks.length) return "";
  return `<section class="tables tables--strip" aria-labelledby="tables-title-${escAttr(sportKey)}">
      <h2 id="tables-title-${escAttr(sportKey)}" class="wire__title">Tables and fixtures</h2>
      ${blocks.join("\n      ")}
      <p class="wire__more"><a href="/tables/#${escAttr(sportKey)}">Full tables</a></p>
    </section>`;
}
