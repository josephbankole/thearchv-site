/* src/lib/longreadMd.ts — the light markdown a long-read body may carry, and the one place it is
 * read.
 *
 * WHY (founder order 2026-09-11). Every issue of The ARCHV Dispatch on Substack is copied onto
 * the site as a long read, word for word, with its links and formatting kept. Formatting kept
 * means the body can no longer be plain paragraphs, so it carries a deliberately small markdown:
 *
 *   blank line            paragraph break (unchanged: every older essay is exactly this)
 *   "## " / "### "        a heading line (# and ## become <h2>, ### and deeper become <h3>)
 *   "> "                  a quoted paragraph
 *   "---" (or *** ___)    a divider
 *   "- " lines            list items, inside any paragraph
 *   **x**  *x*            strong and emphasis
 *   [text](url)           a link, only for http(s) URLs or a site-relative path; anything else
 *                         (javascript:, mailto:, data:) renders its words and no anchor
 *   \X                    a literal X, for any ASCII punctuation, so text can say * or [ safely
 *
 * The iOS app reads the same syntax (thearchv-app LongReadFormat, commit 21a24fd), so the body in
 * the feed passes through unchanged and each side renders it natively.
 *
 * THE SAFETY RULE. Input is escaped BEFORE any markup is written, character by character, and the
 * only tags that can come out are the ones this file spells: p, br, h2, h3, blockquote, hr, ul,
 * li, strong, em, a. There is no raw HTML passthrough of any kind, and no way to write one: a "<"
 * in a body is always "&lt;" on the page. The body is written by the desk engine through the
 * Contents API, not by anyone on a reviewed branch, which is the reason this is not negotiable.
 *
 * WHY TYPESCRIPT IN src/lib/. The same reason as src/lib/readTime.ts, whose header has it in full:
 * src/render/home.ts runs through Vite and can import this, and every .mjs generator already
 * bundles src/ through esbuild via scripts/shared/day-data.mjs (the "longreadMd" extra), so one
 * copy serves the front page, the /reads/ pages, the feed, RSS and search. A second copy in .mjs
 * is the drift this avoids.
 *
 * THE PLAIN-TEXT HALF. longreadPlain() strips the syntax and keeps every word, in order, with
 * paragraphs separated by a blank line. It is what anything that is not the page reads: the meta
 * and JSON-LD description, the RSS dek, the search index, the word count behind "N min read" and
 * the front-page accordion. On a body with no syntax in it, which is every essay filed before this
 * existed, it returns the body unchanged, and the self-test below holds that.
 */

type Mode = 'html' | 'text';

const ASCII_PUNCT = /[!-/:-@[-`{-~]/;
const DIVIDER = /^(?:---|\*\*\*|\* \* \*|___)$/;
const HEADING = /^(#{1,6})[ \t]+([\s\S]+)$/;
const LIST_ITEM = /^- (.*)$/;
const MAX_DEPTH = 4;

/* Text-node escaping, identical to esc() in scripts/shared/page-shell.mjs, which is what the
   /reads/ pages always used: an existing plain paragraph must render byte-identical. */
const escText = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: string): string => escText(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* A link is written only for an absolute http(s) URL or a site-relative path ("/reads/x/", never
   the protocol-relative "//host"). Internal means thearchv.ca or relative; everything else gets
   rel="noopener", the attribute the site's source links already carry. */
const SAFE_HREF = /^(?:https?:\/\/[^\s<>"']+|\/(?!\/)[^\s<>"']*)$/i;
const INTERNAL_HREF = /^(?:https?:\/\/(?:www\.)?thearchv\.ca(?:[/?#]|$)|\/(?!\/))/i;

/* ---------- inline ---------- */

interface Run {
  out: string;
  end: number;
  closed: boolean;
}

function inline(src: string, mode: Mode): string {
  const memo = new Map<string, Run>();
  const lit = (s: string): string => (mode === 'html' ? escText(s) : s);

  // Scan from `i` until `closer` (if any) closes the run. Memoised on (start, closer, depth): an
  // opener that never closes is tried once per position, not once per enclosing attempt, which
  // keeps a paragraph full of stray asterisks linear-ish instead of exponential.
  function run(i: number, closer: string | null, depth: number): Run {
    const key = `${i}|${closer ?? ''}|${depth}`;
    const hit = memo.get(key);
    if (hit) return hit;
    let out = '';
    let result: Run | null = null;
    while (i < src.length) {
      const c = src[i];
      if (c === '\\' && i + 1 < src.length && ASCII_PUNCT.test(src[i + 1])) {
        out += lit(src[i + 1]);
        i += 2;
        continue;
      }
      if (closer && src.startsWith(closer, i) && out !== '' && !/\s/.test(src[i - 1])) {
        // Inside *...*, a "**" is a nested strong if it closes, and our closer if it does not.
        if (closer === '*' && src.startsWith('**', i)) {
          const strong = tryDelim(i, '**', depth);
          if (strong) {
            out += mode === 'html' ? `<strong>${strong.out}</strong>` : strong.out;
            i = strong.end;
            continue;
          }
        }
        result = { out, end: i + closer.length, closed: true };
        break;
      }
      if (c === '*') {
        if (src.startsWith('**', i)) {
          const strong = tryDelim(i, '**', depth);
          if (strong) {
            out += mode === 'html' ? `<strong>${strong.out}</strong>` : strong.out;
            i = strong.end;
            continue;
          }
        }
        const em = tryDelim(i, '*', depth);
        if (em) {
          out += mode === 'html' ? `<em>${em.out}</em>` : em.out;
          i = em.end;
          continue;
        }
        out += lit(c);
        i += 1;
        continue;
      }
      if (c === '[' && depth < MAX_DEPTH) {
        const link = tryLink(i, depth);
        if (link) {
          out += link.out;
          i = link.end;
          continue;
        }
      }
      out += lit(c);
      i += 1;
    }
    if (!result) result = { out, end: i, closed: false };
    memo.set(key, result);
    return result;
  }

  // An opener must be followed by a non-space and must close on a non-space, the same flanking
  // shape CommonMark uses, so "3 * 2" and a lone "*" stay literal.
  function tryDelim(i: number, delim: string, depth: number): Run | null {
    if (depth >= MAX_DEPTH) return null;
    const after = src[i + delim.length];
    if (after === undefined || /\s/.test(after)) return null;
    const r = run(i + delim.length, delim, depth + 1);
    return r.closed && r.out !== '' ? r : null;
  }

  function tryLink(i: number, depth: number): Run | null {
    // The matching "]", respecting escapes and nested brackets, then "(" url ")" immediately.
    let j = i + 1;
    let level = 1;
    while (j < src.length) {
      const c = src[j];
      if (c === '\\') { j += 2; continue; }
      if (c === '[') level += 1;
      if (c === ']') { level -= 1; if (level === 0) break; }
      j += 1;
    }
    if (j >= src.length || src[j + 1] !== '(') return null;
    const close = src.indexOf(')', j + 2);
    if (close === -1) return null;
    const rawUrl = src.slice(j + 2, close);
    if (!rawUrl || /\s/.test(rawUrl)) return null;
    const text = src.slice(i + 1, j);
    if (!text) return null;
    const url = rawUrl.replace(/\\([!-/:-@[-`{-~])/g, '$1');
    const inner = inlineAt(text, mode, depth + 1);
    if (mode === 'text' || !SAFE_HREF.test(url)) return { out: inner, end: close + 1, closed: true };
    const rel = INTERNAL_HREF.test(url) ? '' : ' rel="noopener"';
    return { out: `<a href="${escAttr(url)}"${rel}>${inner}</a>`, end: close + 1, closed: true };
  }

  return run(0, null, 0).out;
}

// Link text is parsed as its own inline run (so **bold** inside a link works), one level deeper.
function inlineAt(src: string, mode: Mode, depth: number): string {
  if (depth >= MAX_DEPTH) return mode === 'html' ? escText(src.replace(/\\([!-/:-@[-`{-~])/g, '$1')) : src.replace(/\\([!-/:-@[-`{-~])/g, '$1');
  return inline(src, mode);
}

/* ---------- blocks ---------- */

type Block =
  | { kind: 'hr' }
  | { kind: 'heading'; level: 2 | 3; text: string }
  | { kind: 'quote'; paras: string[][] }
  | { kind: 'para'; groups: { list: boolean; lines: string[] }[] };

/** Paragraphs split on blank lines, the rule every long read has always used. */
function paragraphs(body: string): string[] {
  return String(body ?? '')
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function parseBlock(p: string): Block {
  if (DIVIDER.test(p)) return { kind: 'hr' };
  const h = p.match(HEADING);
  if (h) return { kind: 'heading', level: h[1].length <= 2 ? 2 : 3, text: h[2].replace(/\s*\n\s*/g, ' ').trim() };
  if (p.startsWith('>')) {
    const paras: string[][] = [[]];
    for (const line of p.split('\n')) {
      const l = line.replace(/^>[ ]?/, '').trim();
      if (!l) { if (paras[paras.length - 1].length) paras.push([]); continue; }
      paras[paras.length - 1].push(l);
    }
    return { kind: 'quote', paras: paras.filter((q) => q.length) };
  }
  const groups: { list: boolean; lines: string[] }[] = [];
  for (const raw of p.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(LIST_ITEM);
    const list = !!m;
    const text = m ? m[1] : line;
    const last = groups[groups.length - 1];
    if (last && last.list === list) last.lines.push(text);
    else groups.push({ list, lines: [text] });
  }
  return { kind: 'para', groups };
}

/**
 * The body as HTML. `joiner` separates top-level blocks; build-reads-pages passes the indent it
 * has always used, so an existing essay's page comes out byte-identical.
 */
export function longreadHtml(body: string, joiner = '\n'): string {
  return paragraphs(body)
    .map((p) => {
      const b = parseBlock(p);
      switch (b.kind) {
        case 'hr':
          return '<hr>';
        case 'heading':
          return `<h${b.level}>${inline(b.text, 'html')}</h${b.level}>`;
        case 'quote':
          return `<blockquote>${b.paras.map((q) => `<p>${q.map((l) => inline(l, 'html')).join('<br>')}</p>`).join('')}</blockquote>`;
        case 'para':
          return b.groups
            .map((g) =>
              g.list
                ? `<ul>${g.lines.map((l) => `<li>${inline(l, 'html')}</li>`).join('')}</ul>`
                : `<p>${g.lines.map((l) => inline(l, 'html')).join('<br>')}</p>`,
            )
            .join('');
      }
    })
    .join(joiner);
}

/**
 * The body as plain paragraphs: every word, in order, no syntax. Dividers are dropped (they carry
 * no words); a quote's paragraphs and a list's items keep their own lines.
 */
export function longreadParagraphs(body: string): string[] {
  const out: string[] = [];
  for (const p of paragraphs(body)) {
    const b = parseBlock(p);
    if (b.kind === 'hr') continue;
    if (b.kind === 'heading') out.push(inline(b.text, 'text'));
    else if (b.kind === 'quote') for (const q of b.paras) out.push(q.map((l) => inline(l, 'text')).join('\n'));
    else out.push(b.groups.flatMap((g) => g.lines.map((l) => inline(l, 'text'))).join('\n'));
  }
  return out.filter((p) => p.trim() !== '');
}

/** The body as plain text, paragraphs separated by a blank line. */
export function longreadPlain(body: string): string {
  return longreadParagraphs(body).join('\n\n');
}

/* tests-by-assertion, the convention src/lib/readTime.ts and scripts/shared/page-shell.mjs use:
   a regression throws at import time, so every generator that reads a long read stops the build
   rather than shipping a broken or unsafe page. */
(function selfTest(): void {
  const eq = (got: string, want: string, what: string): void => {
    if (got !== want) throw new Error(`longreadMd: ${what}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`);
  };
  // An older essay is plain paragraphs and must come out exactly as the old renderer made it.
  const old = "Sacchi's AC Milan pressed in a block. It was 25 metres & tight.\n\nSecond paragraph.";
  eq(longreadHtml(old, '|'), "<p>Sacchi's AC Milan pressed in a block. It was 25 metres &amp; tight.</p>|<p>Second paragraph.</p>", 'plain paragraphs unchanged');
  eq(longreadPlain(old), old, 'plain text of a plain essay is the essay');
  // Inline syntax.
  eq(longreadHtml('**Read it** at [thearchv.ca](https://thearchv.ca/reads/x/).'), '<p><strong>Read it</strong> at <a href="https://thearchv.ca/reads/x/">thearchv.ca</a>.</p>', 'bold and internal link');
  eq(longreadHtml('See [Sky](https://www.skysports.com/) and *this*.'), '<p>See <a href="https://www.skysports.com/" rel="noopener">Sky</a> and <em>this</em>.</p>', 'external link and em');
  eq(longreadHtml('[**Bold link**](/reads/x/)'), '<p><a href="/reads/x/"><strong>Bold link</strong></a></p>', 'bold inside a relative link');
  eq(longreadHtml('***both***'), '<p><strong><em>both</em></strong></p>', 'strong and em together');
  eq(longreadHtml('*a **b** c*'), '<p><em>a <strong>b</strong> c</em></p>', 'strong inside em');
  eq(longreadPlain('**Read it** at [thearchv.ca](https://thearchv.ca/reads/x/).'), 'Read it at thearchv.ca.', 'plain strips markers, keeps words');
  // Blocks.
  eq(longreadHtml('## The week\n\n### Small\n\n> We go again.\n>\n> Twice.\n\n---\n\nIntro\n- one\n- two', '|'),
    '<h2>The week</h2>|<h3>Small</h3>|<blockquote><p>We go again.</p><p>Twice.</p></blockquote>|<hr>|<p>Intro</p><ul><li>one</li><li>two</li></ul>', 'blocks');
  eq(longreadPlain('## The week\n\n> We go again.\n\n---\n\n- one\n- two'), 'The week\n\nWe go again.\n\none\ntwo', 'plain blocks');
  // Literal text stays literal.
  eq(longreadHtml('They finished #1 and scored 3 * 2 times, 5*.'), '<p>They finished #1 and scored 3 * 2 times, 5*.</p>', 'mid-sentence symbols');
  eq(longreadHtml('\\*not em\\* and \\[not a link\\](x) \\# and \\- dash'), '<p>*not em* and [not a link](x) # and - dash</p>', 'backslash escapes');
  eq(longreadPlain('\\- not a list'), '- not a list', 'escape removed in plain');
  eq(longreadHtml('An [unclosed link and **half bold'), '<p>An [unclosed link and **half bold</p>', 'unbalanced markup is text');
  // Safety: nothing raw ever passes.
  eq(longreadHtml('<script>alert(1)</script> <b>x</b>'), '<p>&lt;script&gt;alert(1)&lt;/script&gt; &lt;b&gt;x&lt;/b&gt;</p>', 'raw html is escaped');
  eq(longreadHtml('[click](javascript:alert(1))'), '<p>click)</p>', 'javascript: never becomes a link');
  eq(longreadHtml('[mail](mailto:a@b.c)'), '<p>mail</p>', 'mailto renders words only');
  eq(longreadHtml('[x](//evil.example/)'), '<p>x</p>', 'protocol-relative is not internal');
  eq(longreadHtml('[x](https://a.example/?q="><img>)'), '<p>x</p>', 'quotes or angle brackets refuse the link');
  eq(longreadHtml('## <img src=x onerror=1>'), '<h2>&lt;img src=x onerror=1&gt;</h2>', 'heading text escaped');
  // A paragraph of stray asterisks must not blow up.
  const stress = new Array(400).fill('*a').join(' ');
  if (longreadPlain(stress) !== stress) throw new Error('longreadMd: stray asterisks are literal');
})();
