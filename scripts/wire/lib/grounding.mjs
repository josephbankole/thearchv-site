/* grounding.mjs: the deterministic checks on a desk-written note (design-final B6).
   The rule is that a note frames the item and never asserts: it states no event, consequence or
   causal claim in The ARCHV's own voice. Nothing in this repo WRITES a note; this file only
   refuses one. A refused note is dropped and its item still publishes without it. */

const HEDGES = /\b(sources?|reportedly|expected|in talks|could|set to|rumou?rs?|reports?|according to)\b/i;
const ATTRIBUTION = /\b(reports?|reported by|according to|says|say)\b/i;
const COMPLETION = ["signed", "signs", "traded", "fired", "sacked", "completed", "won", "agreed", "confirmed", "joined", "released", "retired", "beat", "lost", "hired", "appointed"];
const NEGATION = /\b(not|no|never|without|nor)\b|n't\b/gi;
const NARRATION = ["why it matters", "here's why", "heres why", "the part most people miss", "that's the point", "worth watching"];
const BETTING = /\b(odds|bets?|betting|parlays?|picks?|props|sportsbook|favou?rites?|longshots?|wager)\b/i;

const words = (s) => (String(s).toLowerCase().match(/[\p{L}\p{N}']+/gu) || []);

export function checkNote(note, { headline = "", summary = "", sourceName = "" } = {}) {
  const errors = [];
  const n = String(note ?? "").trim();
  const src = `${headline} ${summary}`;
  const srcLower = src.toLowerCase();
  if (n.length < 40 || n.length > 160) errors.push("length");
  if ((n.match(/[.!?](\s|$)/g) || []).length > 1) errors.push("more-than-one-sentence");
  if (/\?/.test(n)) errors.push("question-mark");
  if (/!/.test(n)) errors.push("exclamation");
  if (/[–—]/.test(n)) errors.push("dash");
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(n)) errors.push("emoji");
  if (/#/.test(n)) errors.push("hashtag");
  if (/https?:\/\/|www\./i.test(n)) errors.push("url");
  if (/["“”‘’]|(^|\s)'|'(\s|$)/.test(n)) errors.push("quotation-marks");
  for (const d of n.match(/\d+(?:[.,]\d+)*/g) || []) if (!src.includes(d)) errors.push(`number-not-in-item:${d}`);
  // Capitalised words after the first word must appear in the item (names are a hard fail).
  const tokens = n.split(/\s+/).slice(1);
  for (const t of tokens) {
    const w = t.replace(/[^\p{L}\p{N}'-]/gu, "").replace(/'s$/, "");
    if (w && /^\p{Lu}/u.test(w) && !srcLower.includes(w.toLowerCase()) && w.toLowerCase() !== sourceName.toLowerCase()) errors.push(`name-not-in-item:${w}`);
  }
  if (HEDGES.test(src) && !(ATTRIBUTION.test(n) && (!sourceName || n.toLowerCase().includes(sourceName.toLowerCase())))) errors.push("hedged-item-needs-attribution");
  const srcWords = new Set(words(src));
  for (const v of COMPLETION) if (words(n).includes(v) && !srcWords.has(v)) errors.push(`completion-verb-not-in-item:${v}`);
  const noteNeg = (n.match(NEGATION) || []).map((x) => x.toLowerCase());
  const srcNeg = new Set((src.match(NEGATION) || []).map((x) => x.toLowerCase()));
  for (const x of noteNeg) if (!srcNeg.has(x)) errors.push(`negation-not-in-item:${x}`);
  for (const p of NARRATION) if (n.toLowerCase().includes(p)) errors.push(`narration:${p}`);
  if (BETTING.test(n)) errors.push("betting-word");
  const hw = words(headline);
  if (hw.length) {
    const nw = new Set(words(n));
    const repeated = hw.filter((w) => nw.has(w)).length / hw.length;
    if (repeated > 0.6) errors.push("restates-headline");
  }
  return { ok: errors.length === 0, errors };
}
