/* grounding.mjs: the deterministic checks on a desk-written note (design-final B6).
   The rule is that a note frames the item and never asserts: it states no event, consequence or
   causal claim in The ARCHV's own voice. Nothing in this repo WRITES a note; this file only
   refuses one. A refused note is dropped and its item still publishes without it. */

const HEDGES = /\b(sources?|reportedly|expected|in talks|could|set to|rumou?rs?|reports?|according to)\b/i;
const ATTRIBUTION = /\b(reports?|reported by|according to|says|say)\b/i;
// Every tense that reports the thing as done, present as well as past ("wins", "confirms"):
// an exact form is allowed only when the item itself uses that form.
const COMPLETION = [
  "signed", "signs", "traded", "trades", "fired", "fires", "sacked", "sacks", "completed", "completes",
  "won", "wins", "agreed", "agrees", "confirmed", "confirms", "joined", "joins", "released", "releases",
  "retired", "retires", "beat", "beats", "beaten", "lost", "loses", "hired", "hires", "appointed", "appoints",
  // Headline-style present for plural subjects ("United sign", "the Bears trade"): same assertion.
  "sign", "trade", "fire", "sack", "complete", "win", "agree", "confirm", "join", "release", "retire",
  "lose", "hire", "appoint",
];
const NEGATION = /\b(not|no|never|without|nor)\b|n't\b/gi;
const NARRATION = ["why it matters", "here's why", "heres why", "the part most people miss", "that's the point", "worth watching"];
const BETTING = /\b(odds|bets?|betting|parlays?|picks?|props|sportsbook|favou?rites?|longshots?|wager)\b/i;
// Words a sentence may open with that are not names. Any other capitalised first word is checked.
const SENTENCE_START = new Set([
  "a", "an", "the", "this", "that", "these", "those", "it", "its", "his", "her", "their", "our", "with", "after",
  "before", "for", "from", "in", "on", "at", "as", "by", "if", "once", "until", "while", "when", "where",
  "whether", "what", "who", "which", "how", "both", "either", "neither", "each", "every", "all", "any", "some",
  "much", "more", "most", "one", "next", "another", "and", "but", "so", "yet", "there", "here", "still", "now",
  "then", "also", "only", "even", "just", "watch", "expect", "keep", "look", "note",
]);
// A period after one of these, or after single letters (U.S., A.J.), does not end a sentence.
const ABBREV = /^(?:\p{L}\.)+$|^(?:st|mr|mrs|ms|dr|jr|sr|vs|mt|ft|gen|lt|col|sgt|capt|prof|rev|inc|ltd|co|corp|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.$/iu;
const NUMBER = /\d+(?:[.,]\d+)*/g;

const words = (s) => (String(s).toLowerCase().match(/[\p{L}\p{N}']+/gu) || []);
// A typographic apostrophe is read as a plain one everywhere past the quotation-mark check.
const plain = (s) => String(s).replace(/’/g, "'");
// A name token without dots ("U.S." -> "US"), outer punctuation or a possessive "'s".
const nameKey = (t) => t.replace(/\./g, "").replace(/[^\p{L}\p{N}'-]/gu, "").replace(/'s$/i, "").replace(/^['-]+|['-]+$/g, "");

export function checkNote(note, { headline = "", summary = "", sourceName = "" } = {}) {
  const errors = [];
  const n = String(note ?? "").trim();
  const nn = plain(n);
  const src = plain(`${headline} ${summary}`);
  if (n.length < 40 || n.length > 160) errors.push("length");
  const ends = nn.split(/\s+/).filter((t, i, all) => /[.!?]$/.test(t) && (i === all.length - 1 || !ABBREV.test(t)));
  if (ends.length > 1) errors.push("more-than-one-sentence");
  if (/\?/.test(n)) errors.push("question-mark");
  if (/!/.test(n)) errors.push("exclamation");
  if (/[–—]/.test(n)) errors.push("dash");
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(n)) errors.push("emoji");
  if (/#/.test(n)) errors.push("hashtag");
  if (/https?:\/\/|www\./i.test(n)) errors.push("url");
  // An apostrophe inside a word (Lynx’s, won't) or after a plural s (players') is not a quotation mark.
  const unquoted = n.replace(/(?<=\p{L})[’'](?=\p{L})/gu, "").replace(/(?<=s)[’'](?=[\s.,;:]|$)/giu, "");
  if (/["“”‘’']/.test(unquoted)) errors.push("quotation-marks");
  // Whole numbers only: a "1" is not grounded by "21st", nor a "20" by "2026".
  const srcNumbers = new Set(src.match(NUMBER) || []);
  for (const d of nn.match(NUMBER) || []) if (!srcNumbers.has(d)) errors.push(`number-not-in-item:${d}`);
  // Capitalised words must appear in the item as whole words (names are a hard fail). The first
  // word is checked too unless it is an ordinary sentence opener.
  const srcNames = new Set();
  for (const t of src.split(/[\s/]+/)) {
    const k = nameKey(t).toLowerCase();
    if (!k) continue;
    srcNames.add(k);
    for (const part of k.split(/['-]/)) if (part) srcNames.add(part);
  }
  const grounded = (w) => w.toLowerCase().split(/['-]/).every((part) => !part || srcNames.has(part));
  nn.split(/\s+/).forEach((t, i) => {
    const w = nameKey(t);
    if (!w || !/^\p{Lu}/u.test(w)) return;
    if (i === 0 && SENTENCE_START.has(w.toLowerCase())) return;
    if (grounded(w) || w.toLowerCase() === sourceName.toLowerCase()) return;
    errors.push(`name-not-in-item:${w}`);
  });
  if (HEDGES.test(src) && !(ATTRIBUTION.test(nn) && (!sourceName || nn.toLowerCase().includes(sourceName.toLowerCase())))) errors.push("hedged-item-needs-attribution");
  const srcWords = new Set(words(src));
  const noteWords = words(nn);
  for (const v of COMPLETION) if (noteWords.includes(v) && !srcWords.has(v)) errors.push(`completion-verb-not-in-item:${v}`);
  const noteNeg = (nn.match(NEGATION) || []).map((x) => x.toLowerCase());
  const srcNeg = new Set((src.match(NEGATION) || []).map((x) => x.toLowerCase()));
  for (const x of noteNeg) if (!srcNeg.has(x)) errors.push(`negation-not-in-item:${x}`);
  for (const p of NARRATION) if (nn.toLowerCase().includes(p)) errors.push(`narration:${p}`);
  if (BETTING.test(nn)) errors.push("betting-word");
  const hw = words(plain(headline));
  if (hw.length) {
    const nw = new Set(noteWords);
    const repeated = hw.filter((w) => nw.has(w)).length / hw.length;
    if (repeated > 0.6) errors.push("restates-headline");
  }
  return { ok: errors.length === 0, errors };
}
