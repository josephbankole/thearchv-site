/* sentences.mjs: a shared sentence splitter for the generators. It is lossless, and it knows that a
   full stop after an abbreviation or an initial does not end a sentence.

   WHY IT EXISTS (code review 2026-09-25). The Answer Desk built its FAQPage acceptedAnswer out of a
   regex splitter, /[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g. Neither alternative can match across a full
   stop that has no whitespace after it, so at "per NFL.com." the global match failed from the start
   of the sentence, stepped forward a character at a time until it could match again, and every
   character it stepped over was silently dropped. The 2026-09-11 NFL answer shipped "...with a
   backup quarterback. com. com and Yahoo Sports.", and the 2026-09-03 one opened ", the Atlanta
   Falcons edge rusher, is suspended" because "James Pearce Jr." had gone. A closing quote straight
   after the stop (`it."`) lost text the same way. 25 of the 145 answer pages carried JSON-LD text
   that the page does not show.

   THE RULES.
   - LOSSLESS. Every piece is a slice of the input between two boundaries, so
     sentences(t).join("") === t, character for character, whitespace included. The caller trims
     each piece. Nothing is ever skipped, and the self-test below asserts it on every shape that
     broke the old splitter.
   - A BOUNDARY is a run of . ! or ?, then any closing quotes or brackets, then whitespace or the end
     of the text. A stop inside a token ("NFL.com", "9.612 billion", "1:11.163", "No.1") is never
     one, because no whitespace follows it.
   - A FULL STOP AFTER AN ABBREVIATION OR AN INITIAL IS NOT A BOUNDARY, so a word cap can never stop
     an answer at "the FedEx St." (St. Jude) or "Wyndham Clark, J.J." (J.J. Spaun). Initials and
     dotted runs ("J.J.", "p.m.", "U.S.") are caught by shape; ABBREVIATIONS lists the titles and
     short forms the desks file.
   - ONE REFINEMENT, FROM THE DATA. "No" and "Nos" count as abbreviations only when a number follows
     ("No. 1", "Nos. 3 and 4"). The Answer Desk leads with one-word answers, and in "No. The Seattle
     Seahawks have ruled Sam Darnold out" (NFL, 2026-09-17) that full stop ends a sentence. The
     desks write rankings as "No.1", which is never a boundary in the first place.

   WHAT IT DOES NOT DO: parse quotation. A stop inside a quoted passage that has a space after it
   ("Yes. This is it.") is a boundary like any other. That drops nothing; it only means a cap can
   end an answer partway through a quotation, as the old splitter could.

   The self-test runs when this module loads, the convention scripts/shared/source-links.mjs
   follows, so a regression fails every generator that imports it. */

export const ABBREVIATIONS = new Set(["st", "mr", "mrs", "ms", "dr", "jr", "sr", "no", "nos", "vs", "v", "mt", "ft", "prof", "gen", "capt", "rev", "co", "inc", "ltd", "etc", "approx", "est"]);
// The subset of ABBREVIATIONS that only abbreviates before a number: "No. 3" is a rank, "No." an answer.
const NUMBER_ABBREVIATIONS = new Set(["no", "nos"]);

// A run of stops, then any closing quotes or brackets, then whitespace or the end of the text.
const BOUNDARY = /[.!?]+["'’”)\]]*(?=\s|$)/g;

/* True when the single full stop at `stopIndex` in `text` belongs to an abbreviation or an initial,
   and so does not end the sentence. */
export function abbreviationStop(text, stopIndex) {
  const s = String(text);
  const token = s.slice(0, stopIndex).split(/\s/).pop().replace(/^["'‘“(\[]+/, "");
  if (/^(?:[A-Za-z]\.)*[A-Za-z]$/.test(token)) return true;
  const word = token.toLowerCase();
  if (!ABBREVIATIONS.has(word)) return false;
  return !NUMBER_ABBREVIATIONS.has(word) || /^\s+\d/.test(s.slice(stopIndex + 1));
}

/* The text as whole sentences, each piece carrying the whitespace that led into it. Join them with
   "" to get the input back exactly; trim each one to use it. */
export function sentences(text) {
  const s = String(text ?? "");
  const out = [];
  let start = 0;
  for (const m of s.matchAll(BOUNDARY)) {
    // An ellipsis is never an abbreviation's stop, so only a lone full stop is checked.
    if (m[0][0] === "." && m[0][1] !== "." && abbreviationStop(s, m.index)) continue;
    const end = m.index + m[0].length;
    out.push(s.slice(start, end));
    start = end;
  }
  if (start < s.length) out.push(s.slice(start));
  return out;
}

// tests-by-assertion: exercise the splitter at module load so a regression fails the build.
(function selfTestSentences() {
  const cases = [
    // The four shapes that dropped text from filed answers, then the ones the rule must keep whole.
    ["The Seahawks won the opener, per NFL.com. New England led 10-0, per NFL.com and Yahoo Sports.",
      ["The Seahawks won the opener, per NFL.com.", " New England led 10-0, per NFL.com and Yahoo Sports."]],
    ["James Pearce Jr., the Atlanta Falcons edge rusher, is suspended. He did not appeal.",
      ["James Pearce Jr., the Atlanta Falcons edge rusher, is suspended.", " He did not appeal."]],
    ["The purchase of the Seattle Seahawks closed at 9.612 billion dollars. The league approved it.",
      ["The purchase of the Seattle Seahawks closed at 9.612 billion dollars.", " The league approved it."]],
    ['He answered, "Yes." After 22 years, he is done.',
      ['He answered, "Yes."', " After 22 years, he is done."]],
    ["Scheffler leads the FedEx St. Jude Championship by two shots. J.J. Spaun tees off at 9 a.m. local time.",
      ["Scheffler leads the FedEx St. Jude Championship by two shots.", " J.J. Spaun tees off at 9 a.m. local time."]],
    ["Michael Penix Jr. of the Atlanta Falcons is on the list. Norris took pole with a 1:11.163, by 0.102 seconds.",
      ["Michael Penix Jr. of the Atlanta Falcons is on the list.", " Norris took pole with a 1:11.163, by 0.102 seconds."]],
    ["No. The Seahawks ruled him out. She is the No. 3 seed and the world No.1 is not in the field. Why? Nobody says!",
      ["No.", " The Seahawks ruled him out.", " She is the No. 3 seed and the world No.1 is not in the field.", " Why?", " Nobody says!"]],
    ["  A trailing piece with no stop", ["  A trailing piece with no stop"]],
    ["", []],
  ];
  for (const [input, expected] of cases) {
    const got = sentences(input);
    if (got.join("") !== input) throw new Error(`sentences self-test: pieces must join back to the input exactly, lost text from ${JSON.stringify(input)}`);
    if (JSON.stringify(got) !== JSON.stringify(expected)) {
      throw new Error(`sentences self-test: ${JSON.stringify(input)} split as ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
    }
  }
})();
