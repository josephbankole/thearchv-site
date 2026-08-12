/* source-links.mjs — the sources line: named outlets become links.

   Every desk entry closes on a "Sources: ..." paragraph, and until 2026-08-09 not one word of
   it was a link, on a site whose whole pitch is that each claim is checked against two named
   sources. A reader could read the names and had no way to go and look.

   This lives in shared/ because TWO surfaces render that paragraph: the canonical article page
   (scripts/build-article-pages.mjs) and the RSS body in content:encoded (scripts/build-rss.mjs).
   They shipped different treatments of the same sentence until 2026-08-09 — the page linked the
   outlets, the feed did not — which is exactly the drift a single module prevents. Anything else
   that grows a sources line imports from here rather than re-declaring the map.

   SOURCE_LINKS is a hand-written allowlist mapping an exact string to that publication's or
   organisation's own canonical home page. NOTHING here is derived, guessed or pattern-built: a
   URL is either verifiably that outlet's front door or the name is absent from this map and
   ships as plain text, which is what happens to journalists' bylines (David Ornstein, Fabrizio
   Romano, Ben Jacobs), aggregators, fan sites and anything ambiguous. These are publication
   home pages, not deep links to the individual story: the desk data records which outlet
   carried a claim, never the article URL, so a per-story link would have to be invented.

   Adding a row is a two-part claim: that the string only ever appears in these paragraphs as a
   citation, and that the URL is that outlet's real home page. Check both before adding one. */
import { esc, escAttr } from "./page-shell.mjs";

export const SOURCE_LINKS = {
  // Named in the brief.
  "The Athletic": "https://www.nytimes.com/athletic/",
  "Sky Sports": "https://www.skysports.com/",
  "BBC Sport": "https://www.bbc.co.uk/sport",
  ESPN: "https://www.espn.com/",
  // Club official sites. Matched on the full "<club> official" phrase, never on the bare club
  // name, because a bare club name in these paragraphs is usually the subject of a claim
  // ("Newcastle United's private position") rather than the source of one.
  "Manchester United official": "https://www.manutd.com/",
  "Chelsea FC official": "https://www.chelseafc.com/",
  // Governing bodies and tours publishing their own results, fixtures and standings.
  "Premier League": "https://www.premierleague.com/",
  "PGA Tour": "https://www.pgatour.com/",
  "ATP Tour": "https://www.atptour.com/",
  "NFL.com": "https://www.nfl.com/",
  "Formula1.com": "https://www.formula1.com/",
  // Wire services and major outlets that appear in this corpus only as citations.
  "Associated Press": "https://apnews.com/",
  "The Washington Post": "https://www.washingtonpost.com/",
  "Sports Illustrated": "https://www.si.com/",
  "CBS Sports": "https://www.cbssports.com/",
  "NBC Sports": "https://www.nbcsports.com/",
  "CBC Sports": "https://www.cbc.ca/sports",
  "Golf Channel": "https://www.golfchannel.com/",
  "Motorsport.com": "https://www.motorsport.com/",
  Autosport: "https://www.autosport.com/",
  Forbes: "https://www.forbes.com/",
  TSN: "https://www.tsn.ca/",
};

// One alternation, longest name first, so "Manchester United official" is matched before any
// shorter substring could be. The lookarounds keep a name from matching inside a longer word
// (ESPN must not fire inside ESPNFC) while still allowing the dotted names.
const SOURCE_NAME_RE = new RegExp(
  `(?<![\\w.])(${Object.keys(SOURCE_LINKS)
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")})(?![\\w])`,
  "g",
);

// Linkifies an ALREADY-ESCAPED sources paragraph. Single pass, so a replacement can never land
// inside markup an earlier replacement wrote, and first mention only: a paragraph citing Sky
// Sports four times gets one link, not four.
export function linkSources(escapedText) {
  const linked = new Set();
  return escapedText.replace(SOURCE_NAME_RE, (name) => {
    if (linked.has(name)) return name;
    linked.add(name);
    return `<a href="${escAttr(SOURCE_LINKS[name])}" rel="noopener">${name}</a>`;
  });
}

// The sources paragraph is the one that opens with "Sources:" (or "Source:"). Everything else in
// the body is left exactly as it was: no in-body linkification, deliberately.
export const isSourcesPara = (p) => /^Sources?\s*:/i.test(p);

// One paragraph, escaped, and linkified only when it is the sources line. Both callers build
// their own <p> around it (the page adds class="article__sources", the feed does not), so this
// returns the inner HTML and nothing else.
export const sourcesAwareParagraph = (p) => (isSourcesPara(p) ? linkSources(esc(p)) : esc(p));

// tests-by-assertion, same convention as metaDescription in build-article-pages.mjs: a
// regression fails the build, in whichever script imported this module first.
(function selfTestSourceLinks() {
  const out = sourcesAwareParagraph("Sources: Sky Sports; ESPN and Sky Sports again; David Ornstein; Manchester United official.");
  if (!out.includes('<a href="https://www.skysports.com/" rel="noopener">Sky Sports</a>')) {
    throw new Error(`linkSources self-test: expected a Sky Sports link, got ${out}`);
  }
  if ((out.match(/skysports\.com/g) || []).length !== 1) {
    throw new Error("linkSources self-test: only the first mention of a source should be linked");
  }
  if (out.includes(">David Ornstein<") || out.includes("David Ornstein</a>")) {
    throw new Error("linkSources self-test: a journalist's name must stay plain text");
  }
  if (!out.includes('<a href="https://www.manutd.com/" rel="noopener">Manchester United official</a>')) {
    throw new Error("linkSources self-test: the club-official phrase should link to the club site");
  }
  const body = ["Sky Sports report that Manchester United moved.", "Sources: Sky Sports."]
    .map(sourcesAwareParagraph)
    .join("\n");
  if ((body.match(/<a /g) || []).length !== 1) {
    throw new Error("linkSources self-test: only the sources paragraph may be linkified");
  }
})();
