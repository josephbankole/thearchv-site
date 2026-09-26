/* feed-parse.mjs: a tolerant RSS 2.0 and Atom reader with no dependencies.
   It keeps title, link, date, guid and a short plain summary (grounding only, never shown).
   It DISCARDS content, content:encoded, enclosure, media:* and every image field, so no article
   body or publisher image can travel past this file. See design-final B2. */

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// Text of an element body: CDATA unwrapped, entities decoded. Leading/trailing whitespace is
// trimmed (XML layout, not content); nothing inside the text is touched.
function textOf(body) {
  if (body == null) return "";
  let out = "";
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>/g;
  let last = 0, m;
  while ((m = re.exec(body))) {
    out += decodeEntities(body.slice(last, m.index)) + m[1];
    last = re.lastIndex;
  }
  out += decodeEntities(body.slice(last));
  return out.trim();
}

const esc = (n) => n.replace(/[:.]/g, (c) => "\\" + c);
function firstTag(block, name) {
  const m = block.match(new RegExp(`<${esc(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${esc(name)}>`, "i"));
  return m ? m[1] : null;
}

export function stripHtml(s, max = 600) {
  const plain = decodeEntities(String(s).replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
  if (!plain || plain.toLowerCase() === "null") return "";
  return plain.length > max ? plain.slice(0, max) : plain;
}

// Remove the fields we must never carry before anything else looks at an item.
function dropForbidden(block) {
  return block
    .replace(/<content:encoded[\s\S]*?<\/content:encoded>/gi, "")
    .replace(/<content(?:\s[^>]*)?>[\s\S]*?<\/content>/gi, "")
    .replace(/<media:[a-z]+[\s\S]*?(?:\/>|<\/media:[a-z]+>)/gi, "")
    .replace(/<enclosure[^>]*\/?>/gi, "")
    .replace(/<image[\s\S]*?<\/image>/gi, "");
}

/* Returns { format, items: [{ title, link, published, guid, summary, position }] }.
   Throws on input that is not an RSS or Atom document. */
export function parseFeed(xml) {
  if (typeof xml !== "string" || !xml.trim()) throw new Error("empty-body");
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const isRss = /<rss[\s>]|<rdf:RDF[\s>]/i.test(xml);
  if (!isAtom && !isRss) throw new Error("not-a-feed");
  if (isAtom ? !/<\/feed>/i.test(xml) : !/<\/rss>|<\/rdf:RDF>/i.test(xml)) throw new Error("truncated-or-malformed");
  const tag = isAtom ? "entry" : "item";
  const blocks = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?</${tag}>`, "gi")) || [];
  const items = blocks.map((raw, position) => {
    const block = dropForbidden(raw);
    let link = "";
    if (isAtom) {
      const links = [...block.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => m[1]);
      const pick = links.find((a) => /rel=["']alternate["']/i.test(a)) || links.find((a) => !/rel=/i.test(a)) || links[0];
      const href = pick && pick.match(/href=["']([^"']+)["']/i);
      link = href ? decodeEntities(href[1]).trim() : "";
    } else {
      link = textOf(firstTag(block, "link"));
    }
    const summaryRaw = isAtom ? firstTag(block, "summary") : firstTag(block, "description");
    return {
      title: textOf(firstTag(block, "title")),
      link,
      published: textOf(isAtom ? firstTag(block, "published") ?? firstTag(block, "updated") : firstTag(block, "pubDate") ?? firstTag(block, "dc:date")),
      guid: textOf(firstTag(block, isAtom ? "id" : "guid")),
      summary: summaryRaw == null ? "" : stripHtml(textOf(summaryRaw)),
      position,
    };
  });
  return { format: isAtom ? "atom" : "rss", items };
}
