/* percentile-bar.mjs — one small, standalone component: a number, where it ranks, and a bar that
   shows the rank at a glance. Nothing else. It has no imports, no state and no dependency on the
   rest of the page shell, so the carousel renderer can pull the same two functions and the site
   and the Instagram slides cannot drift apart.

   The reason it exists: 27 tells you nothing on its own. "1st of 6" tells you everything, and the
   bar tells you before you have finished reading. A raw figure on a card is a number; a ranked
   figure is an argument.

   HONESTY RULES BAKED IN
   - The pool is always named on the component. "1st of 6 in the ARCHV Premier League set" and
     "4th of 239 forwards" are different claims and the component never lets one pass for the other.
   - No pool, no bar. Pass a value with no rank and you get the number and nothing more, rather
     than a bar drawn against an invented denominator.
   - `note` is for a sourced qualifier such as a Golden Boot, and it renders in gold beneath the
     rank. It is not a place for editorial colour.

   USAGE
     import { percentileBar, percentileBarStyles } from "./percentile-bar.mjs";
     html += percentileBarStyles();                       // once per page
     html += percentileBar({ value: "27", label: "Goals", rank: 1, poolSize: 6,
                             poolLabel: "the ARCHV Premier League set" });
*/

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th", 22 -> "22nd". */
export function ordinal(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n);
  const rem100 = Math.abs(num) % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${num}th`;
  switch (Math.abs(num) % 10) {
    case 1: return `${num}st`;
    case 2: return `${num}nd`;
    case 3: return `${num}rd`;
    default: return `${num}th`;
  }
}

/** Rank within a pool, expressed as a 0-100 percentile. Top of the pool is 100. */
export function percentileFromRank(rank, poolSize) {
  const r = Number(rank);
  const n = Number(poolSize);
  if (!Number.isFinite(r) || !Number.isFinite(n) || n < 2) return null;
  const clamped = Math.min(Math.max(r, 1), n);
  return ((n - clamped) / (n - 1)) * 100;
}

const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * @param {object} opts
 * @param {string|number} opts.value      the figure itself, already formatted
 * @param {string}  [opts.label]          metric name, e.g. "Goals"
 * @param {number}  [opts.rank]           1-based rank inside the pool
 * @param {number}  [opts.poolSize]       how many are in the pool
 * @param {string}  [opts.poolLabel]      what the pool is, in words. Required whenever rank is set.
 * @param {number}  [opts.percentile]     override the derived percentile (0-100)
 * @param {string}  [opts.note]           a sourced qualifier, rendered in gold
 * @param {"left"|"right"} [opts.align]   which way the block reads. Defaults to left.
 * @param {"gold"|"cream"} [opts.tone]    bar fill. Defaults to gold.
 * @returns {string} HTML
 */
export function percentileBar({
  value,
  label = "",
  rank = null,
  poolSize = null,
  poolLabel = "",
  percentile = null,
  note = "",
  align = "left",
  tone = "gold",
} = {}) {
  if (rank != null && !poolLabel) {
    throw new Error("[percentile-bar] a rank without a poolLabel is a claim with no denominator");
  }

  const pct = percentile ?? percentileFromRank(rank, poolSize);
  const alignClass = align === "right" ? " pctl--right" : "";
  const toneClass = tone === "cream" ? " pctl--cream" : "";

  const rankLine =
    rank != null && poolSize != null
      ? `<span class="pctl__rank">${esc(ordinal(rank))} of ${esc(poolSize)} in ${esc(poolLabel)}</span>`
      : "";

  // No pool means no bar. The number stands alone rather than leaning on a denominator we made up.
  const bar =
    pct == null
      ? ""
      : `<span class="pctl__track" role="img" aria-label="${esc(label || "Value")}: ${esc(ordinal(rank))} of ${esc(poolSize)} in ${esc(poolLabel)}">
        <span class="pctl__fill" style="width:${pct.toFixed(1)}%"></span>
      </span>`;

  return `<span class="pctl${alignClass}${toneClass}">
      ${label ? `<span class="pctl__label">${esc(label)}</span>` : ""}
      <span class="pctl__value">${esc(value)}</span>
      ${bar}
      ${rankLine}
      ${note ? `<span class="pctl__note">${esc(note)}</span>` : ""}
    </span>`;
}

/** The component's CSS. Emit once per page. Brand tokens are inlined so the module stays standalone. */
export function percentileBarStyles() {
  return `<style>
    /* percentile-bar.mjs — self-contained. Colours are the white system (phase 2A, 2026-08-09):
       ink #1E223D, muted ink #5F6485 (5.76:1 on white, the AA floor for the label and rank text),
       accent #F54F1B for the fill (a graphic mark, no contrast floor), rule #DED9DB for the track.
       Values are literals rather than var() because this module is emitted standalone into the
       carousel renderer as well as the duel pages, where no :root block is present. */
    .pctl { display: flex; flex-direction: column; gap: .28rem; min-width: 0; }
    .pctl--right { align-items: flex-end; text-align: right; }
    .pctl__label { font-size: .68rem; letter-spacing: .14em; text-transform: uppercase; color: #5F6485; }
    .pctl__value { font-family: 'Anton', 'Inter Tight', system-ui, sans-serif; font-weight: 400; text-transform: uppercase; font-size: clamp(1.6rem, 5vw, 2.1rem); line-height: 1; color: #1E223D; font-variant-numeric: tabular-nums; }
    /* Deliberately short. Wherever this sits next to a wider bar (the duel row's split bar, a
       carousel slide's chart) a full-width track reads as a second chart competing with the first.
       This one is a chip that qualifies the number above it. */
    .pctl__track { display: block; width: 100%; max-width: 8.5rem; height: 4px; border-radius: 2px; background: #DED9DB; overflow: hidden; }
    .pctl__fill { display: block; height: 100%; border-radius: 2px; background: #F54F1B; }
    .pctl--cream .pctl__fill { background: #7A7F9E; }
    .pctl__rank { font-size: .74rem; color: #5F6485; }
    .pctl__note { font-size: .72rem; line-height: 1.4; color: #C93A0F; }
  </style>`;
}
