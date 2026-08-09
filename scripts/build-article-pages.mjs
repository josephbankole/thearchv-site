/* build-article-pages.mjs — emits a canonical, self-contained static page for every daily entry
   across all three lanes (Transfer Desk, World Cup, Football Leagues), at:
     dist/desk/<lane>/<date>/index.html      lane one of: transfer, world-cup, leagues
   This is the URL the app's canonical shares point at (see BUILD11-PLAN.md W1/W2) and the primary
   SEO surface for daily entries. Runs AFTER vite build, build-feed.mjs and build-day-pages.mjs (see
   package.json "build"). Follows the public/start/index.html pattern: inline brand styles, the
   PostHog snippet, Google Fonts — deliberately standalone, no dependency on the hashed app bundle
   or on content.css (article pages built by build-content.mjs/build-day-pages.mjs use content.css;
   these pages intentionally match public/start/index.html instead, per the founder-approved plan).
   Also (re)writes dist/sitemap.xml: it appends every article URL to whatever sitemap already exists
   in dist at this point (built by build-content.mjs, then extended by build-day-pages.mjs), so this
   must run last in the chain. */
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import {
  SITE, POSTHOG_KEY, esc, escAttr, longDate, LANE_META, byDateDesc, clampTitle,
  deskNav, masthead, footer, posthogSnippet, fontLinks, pageStyles,
  cspMeta, scriptHash, extractScriptBody, MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH, RSS_LINK, ORG_SAMEAS,
  AUTHOR_NAME, AUTHOR_URL, AUTHOR_SAMEAS, SPORTS, QUESTION_LANE_META,
} from "./shared/page-shell.mjs";
import { isSourcesPara, sourcesAwareParagraph } from "./shared/source-links.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const OUT = process.env.CONTENT_OUT || join(ROOT, "dist");

/* ---------- load the typed day data via a bundled temp module ---------- */
const entrySrc = [
  `export { transferDays } from "./data/transferDays.ts";`,
  `export { worldCupDays } from "./data/worldCupDays.ts";`,
  `export { leaguesDays } from "./data/leaguesDays.ts";`,
  `export { nflDays } from "./data/nflDays.ts";`,
  `export { f1Days } from "./data/f1Days.ts";`,
  `export { tennisDays } from "./data/tennisDays.ts";`,
  `export { golfDays } from "./data/golfDays.ts";`,
].join("\n");
const tmp = join(ROOT, ".article-bundle.mjs");
let data;
try {
  await build({ stdin: { contents: entrySrc, resolveDir: SRC, loader: "ts", sourcefile: "article-entry.ts" },
    bundle: true, format: "esm", platform: "node", outfile: tmp, logLevel: "silent" });
  data = await import(pathToFileURL(tmp).href + `?t=${process.hrtime.bigint()}`);
} finally { try { rmSync(tmp); } catch {} }

// Defensive sort immediately after loading, before any use (see byDateDesc in
// scripts/shared/page-shell.mjs): prev/next nav and "more from the lane" below both
// assume newest-first, and a single out-of-order commit would otherwise scramble both.
const transferDays = [...data.transferDays].sort(byDateDesc);
const worldCupDays = [...data.worldCupDays].sort(byDateDesc);
const leaguesDays = [...data.leaguesDays].sort(byDateDesc);
const SPORT_DAYS = {
  nfl: [...data.nflDays].sort(byDateDesc),
  f1: [...data.f1Days].sort(byDateDesc),
  tennis: [...data.tennisDays].sort(byDateDesc),
  golf: [...data.golfDays].sort(byDateDesc),
};

// A "section" is one sport+lane's article surface. `base` is the path prefix under which its
// articles live (leading and trailing slash), `anchor` is what the breadcrumb and "more" link
// point back at, `sportKey` scopes the masthead tab row and the deskNav. Football sections keep
// base "/desk/<lane>/" and the homepage anchors, so their emitted pages are byte-identical to
// before bar the masthead sport tab row. New sports get "/<urlBase>/<lane>/" and their section
// root as the anchor. Every downstream string in render() is built from these fields, so nothing
// football-shaped changed value.
const sections = [
  { sportKey: "football", laneKey: "transfer", label: LANE_META.transfer.label, seoSuffix: LANE_META.transfer.seoSuffix, anchor: LANE_META.transfer.anchor, base: "/desk/transfer/", days: transferDays },
  { sportKey: "football", laneKey: "world-cup", label: LANE_META["world-cup"].label, seoSuffix: LANE_META["world-cup"].seoSuffix, anchor: LANE_META["world-cup"].anchor, base: "/desk/world-cup/", days: worldCupDays },
  { sportKey: "football", laneKey: "leagues", label: LANE_META.leagues.label, seoSuffix: LANE_META.leagues.seoSuffix, anchor: LANE_META.leagues.anchor, base: "/desk/leagues/", days: leaguesDays },
];
for (const sport of SPORTS) {
  if (sport.key === "football") continue;
  for (const laneKey of sport.lanes) {
    const laneMeta = QUESTION_LANE_META[laneKey] || { label: laneKey, seoSuffix: "" };
    sections.push({
      sportKey: sport.key,
      laneKey,
      label: `${sport.label} ${laneMeta.label}`,
      seoSuffix: `${sport.label} ${laneMeta.seoSuffix}`.trim(),
      anchor: `${sport.urlBase}/`,
      base: `/${sport.urlBase}/${laneKey}/`,
      days: SPORT_DAYS[sport.key] || [],
    });
  }
}

/* ---------- the sources line ----------
   SOURCE_LINKS, linkSources and isSourcesPara moved to scripts/shared/source-links.mjs on
   2026-08-09, because build-rss.mjs renders the same paragraph into content:encoded and was
   shipping it as flat text. One module, imported by both, so the page and the feed cannot
   disagree about which outlets are linked. The self-tests run when that module loads. */

/* ---------- body: \n\n paragraph breaks, dated "Update, N Jul:" additions stay visible paragraphs ---------- */
function bodyHtml(text) {
  return String(text)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (isSourcesPara(p) ? `<p class="article__sources">${sourcesAwareParagraph(p)}</p>` : `<p>${sourcesAwareParagraph(p)}</p>`))
    .join("\n        ");
}

/* ---------- meta description: "<dek> <first sentence of body>", trimmed at a word boundary so
   the whole string stays <=155 chars. Search-only; the visible page and og/twitter copy are
   untouched. Throws if the result ever exceeds 160, so a bad edit fails the build loudly. */
const DESC_TARGET = 155;
function firstSentence(text) {
  const s = String(text).trim();
  const m = s.match(/^.*?[.!?](?=\s|$)/);
  return (m ? m[0] : s).trim();
}
function truncateAtWord(str, maxLen) {
  if (str.length <= maxLen) return str;
  const cut = str.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:!?]+$/, "");
}
function metaDescription(dek, body) {
  const d = String(dek).trim();
  const sentence = firstSentence(body);
  const full = sentence ? `${d} ${sentence}` : d;
  const out = full.length > DESC_TARGET ? `${truncateAtWord(full, DESC_TARGET - 1)}…` : full;
  if (out.length > 160) throw new Error(`meta description exceeds 160 chars (${out.length}): ${out}`);
  return out;
}

// tests-by-assertion: exercise the helper at module load so a regression fails the build.
(function selfTestMetaDescription() {
  const long = "word ".repeat(80).trim(); // 400+ chars, all word boundaries
  const truncated = metaDescription("A short standfirst.", long);
  if (truncated.length > DESC_TARGET) throw new Error(`metaDescription self-test: long input produced ${truncated.length} chars`);
  if (!truncated.endsWith("…")) throw new Error("metaDescription self-test: expected an ellipsis on truncation");
  const shortDek = "Fernandes the name. Not the only one.";
  const shortBody = "The move building steam is Mateus Fernandes. And more.";
  const kept = metaDescription(shortDek, shortBody);
  if (kept !== `${shortDek} The move building steam is Mateus Fernandes.`) throw new Error("metaDescription self-test: short input should pass through untruncated");
})();

/* ---------- Answer Desk: the direct answer, used verbatim in both the page and the schema ----------
   The sport question lanes (/nfl/questions/<date>/ and friends) ARE a question and its answer, so
   they carry FAQPage alongside NewsArticle — the shape scripts/build-glossary-pages.mjs already
   uses, and the one family Google has rewarded. Same discipline as the glossary: the string used as
   acceptedAnswer is a string the page shows, in the order it shows it, so an answer engine reads
   exactly what a reader reads. The answer is the entry's dek followed by the first paragraph of the
   body; sentences are added whole and the answer stops once the next one would pass
   ANSWER_MAX_WORDS, so it is never cut mid-sentence (the glossary's winning answers run 40 to 60
   words, and a direct answer that trails off reads as broken to both a reader and a parser). */
const ANSWER_MAX_WORDS = 70;
function sentences(text) {
  return String(text).match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) || [];
}
function questionAnswer(dek, body) {
  const firstPara = String(body).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)[0] || "";
  const kept = [];
  let words = 0;
  for (const part of [String(dek).trim(), firstPara]) {
    for (const raw of sentences(part)) {
      const s = raw.trim();
      if (!s) continue;
      const n = s.split(/\s+/).length;
      if (kept.length && words + n > ANSWER_MAX_WORDS) return kept.join(" ");
      kept.push(s);
      words += n;
    }
  }
  return kept.join(" ");
}

// tests-by-assertion, same convention as metaDescription above: a regression fails the build.
(function selfTestQuestionAnswer() {
  const short = questionAnswer("The Eagles paid up. Here is why.", "Because the market moved first.\n\nA second paragraph that must not appear.");
  if (short !== "The Eagles paid up. Here is why. Because the market moved first.") {
    throw new Error(`questionAnswer self-test: dek + first paragraph expected, got ${JSON.stringify(short)}`);
  }
  const oversized = questionAnswer("Short standfirst.", `${"word ".repeat(80).trim()}.`);
  if (oversized !== "Short standfirst.") {
    throw new Error("questionAnswer self-test: an oversized sentence should be dropped whole, never cut mid-sentence");
  }
})();

function schema(entry, url, label, faq, images) {
  const graph = [
    {
        // Daily desk entries are timely news, so NewsArticle (long reads in build-content.mjs
        // stay Article). dateModified is kept equal to datePublished: the data is date-only and
        // carries no separate revised date, so claiming a later modification would be dishonest;
        // appended, dated "Update, ..." lines stay visible in the body without inflating this.
        "@type": "NewsArticle",
        headline: entry.headline,
        description: entry.dek,
        datePublished: entry.date,
        dateModified: entry.date,
        isAccessibleForFree: true,
        inLanguage: "en-GB",
        // A named Person, not the masthead: Google News and the news aggregators want a human
        // author, and the visible byline on the page says the same thing (see render() below).
        // Name and URL come from AUTHOR_NAME / AUTHOR_URL in scripts/shared/page-shell.mjs.
        // As of 2026-08-04 author.url resolves to the on-site author page and sameAs carries both
        // that page and josephbankole.ca, so the two profiles read as one Person entity.
        // publisher stays the Organization, unchanged.
        author: { "@type": "Person", name: AUTHOR_NAME, url: AUTHOR_URL, sameAs: AUTHOR_SAMEAS },
        // Compact Organization carrying the sameAs entity graph, so every article page reinforces
        // the same brand entity (matches the homepage Organization JSON-LD in index.html).
        publisher: { "@type": "Organization", name: "The ARCHV", url: `${SITE}/`, logo: `${SITE}/brand/logo-badge@192.png`, sameAs: ORG_SAMEAS },
        // The generated share cards, both crops (1.91:1 og.png and 16:9 og-wide.png), as an
        // array of absolute URLs. NEVER the entry headshot: that file is 240x240, which fails
        // Google News's large-image minimums and misrepresents the page's share art (defect
        // fixed 2026-08-06 — image previously pointed at the headshot). Falls back to the
        // site-wide /og.jpg only when card generation failed for this entry.
        image: images,
        mainEntityOfPage: url,
      },
  ];

  // FAQPage, question lanes only (SEO/AEO audit fix 2, 2026-07-28). Same block the glossary
  // emits, and placed before BreadcrumbList for the same reason it is there: the question and
  // its answer are what the page is, the breadcrumb only says where it sits. `faq.question` is
  // the entry headline verbatim, which is also the page's H1 and its answer H2, so the schema
  // never claims a question the page does not visibly ask. Football lanes pass no faq and their
  // emitted JSON is byte-identical to before.
  if (faq) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: { "@type": "Answer", text: faq.answer },
        },
      ],
    });
  }

  graph.push({
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: label, item: `${SITE}/` },
      { "@type": "ListItem", position: 3, name: entry.headline, item: url },
    ],
  });

  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
}

/* ---------- per-article OG share cards (satori + resvg) ----------
   TWO unique cards per canonical article: og.png at 1200x630 (1.91:1, the OG standard, and the
   one og:image / twitter:image reference) and og-wide.png at 1200x675 (16:9, referenced from the
   NewsArticle JSON-LD image array alongside og.png). Same design at both sizes: the wide card
   puts its extra 45px into vertical padding, so the inner layout never re-wraps and nothing
   clips. If generation fails for an entry the page falls back to the static /og.jpg and the
   build carries on. Fonts are static TTF instances committed at scripts/fonts/ (Google Fonts
   API static builds; satori does not take variable fonts well). */
const FONTS_DIR = join(ROOT, "scripts", "fonts");
const CARD_FONTS = [
  { name: "Fraunces", data: readFileSync(join(FONTS_DIR, "Fraunces-SemiBold.ttf")), weight: 600, style: "normal" },
  { name: "Inter Tight", data: readFileSync(join(FONTS_DIR, "InterTight-Regular.ttf")), weight: 400, style: "normal" },
  { name: "Inter Tight", data: readFileSync(join(FONTS_DIR, "InterTight-SemiBold.ttf")), weight: 600, style: "normal" },
];

// Shrink-to-fit headline sizing: three lines maximum, ellipsized by satori's lineClamp as a
// last resort so text can never overflow the card.
function headlineSize(text) {
  const len = String(text).length;
  if (len <= 42) return 68;
  if (len <= 64) return 58;
  if (len <= 90) return 50;
  return 44;
}

async function ogCard(entry, laneLabel, height = 630) {
  // The card was designed at 1200x630. Any taller render (og-wide at 675) keeps the content
  // block at its designed height by absorbing the difference into the vertical padding — no
  // scaling, no letterbox bars, and the headline wraps identically at both sizes.
  const padY = 64 + Math.round((height - 630) / 2);
  const kicker = `${laneLabel} · ${longDate(entry.date)}`.toUpperCase();

  // satori/resvg cannot read webp; the brand headshots in public/heads/ are 240px webp, so
  // convert to a PNG data URI with sharp (already a build dependency).
  let portrait = null;
  if (entry.image) {
    const imgPath = join(ROOT, "public", entry.image.replace(/^\//, ""));
    if (existsSync(imgPath)) {
      const png = await sharp(imgPath).resize(600, 600, { fit: "cover" }).png().toBuffer();
      portrait = `data:image/png;base64,${png.toString("base64")}`;
    }
  }

  const left = {
    type: "div",
    props: {
      style: { display: "flex", flexDirection: "column", justifyContent: "space-between", flexGrow: 1, flexShrink: 1, height: "100%", minWidth: 0 },
      children: [
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column" },
            children: [
              { type: "div", props: { style: { color: "#C9A14A", fontFamily: "Inter Tight", fontWeight: 600, fontSize: 26, letterSpacing: 4.5, lineClamp: 1, marginBottom: 34 }, children: kicker } },
              { type: "div", props: { style: { color: "#F2EAD3", fontFamily: "Fraunces", fontWeight: 600, fontSize: headlineSize(entry.headline), lineHeight: 1.12, letterSpacing: -0.5, lineClamp: 3 }, children: entry.headline } },
            ],
          },
        },
        {
          type: "div",
          props: {
            style: { display: "flex", alignItems: "baseline" },
            children: [
              { type: "div", props: { style: { color: "rgba(242,234,211,.7)", fontFamily: "Inter Tight", fontWeight: 600, fontSize: 22, letterSpacing: 5, marginRight: 12 }, children: "THE" } },
              { type: "div", props: { style: { color: "#F2EAD3", fontFamily: "Fraunces", fontWeight: 600, fontSize: 34 }, children: "ARCHV" } },
              { type: "div", props: { style: { color: "#C9A14A", fontFamily: "Fraunces", fontWeight: 600, fontSize: 34 }, children: "." } },
            ],
          },
        },
      ],
    },
  };

  const children = [left];
  if (portrait) {
    children.push({
      type: "div",
      props: {
        style: { display: "flex", alignItems: "center", marginLeft: 56, flexShrink: 0 },
        children: [
          {
            type: "img",
            props: {
              src: portrait,
              width: 300,
              height: 300,
              style: { borderRadius: 300, border: "3px solid rgba(201,161,74,.55)", boxShadow: "0 0 0 10px rgba(7,28,43,.6)" },
            },
          },
        ],
      },
    });
  }

  const svg = await satori(
    {
      type: "div",
      props: {
        style: {
          width: 1200, height, display: "flex", alignItems: "center",
          backgroundColor: "#071C2B",
          backgroundImage: "radial-gradient(at 50% -20%, #133A52 0%, #071C2B 68%)",
          padding: `${padY}px 72px`,
        },
        children,
      },
    },
    { width: 1200, height, fonts: CARD_FONTS },
  );

  return new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
}

// The share-row script embeds this page's own url/title, so - unlike masthead()/posthogSnippet()
// - it is NOT identical across pages: its CSP hash must be computed per page, at generation time,
// from this exact string (verified: two entries with different headlines produce different hashes).
function shareScriptTag(url, headline) {
  return `<script>
    (function () {
      var url = ${JSON.stringify(url).replace(/</g, "\\u003c")};
      var title = ${JSON.stringify(headline).replace(/</g, "\\u003c")};
      var ph = function (ev) { if (window.posthog) posthog.capture(ev, { url: url }); };
      var native = document.getElementById('share-native');
      if (native && navigator.share) {
        native.hidden = false;
        native.addEventListener('click', function () {
          ph('share_native');
          navigator.share({ title: title, url: url }).catch(function () {});
        });
      }
      var x = document.getElementById('share-x');
      if (x) x.addEventListener('click', function () { ph('share_x'); });
      var copy = document.getElementById('share-copy');
      if (copy) copy.addEventListener('click', function () {
        if (!(navigator.clipboard && navigator.clipboard.writeText)) return;
        navigator.clipboard.writeText(url).then(function () {
          ph('share_copy');
          copy.textContent = 'Copied';
          setTimeout(function () { copy.textContent = 'Copy link'; }, 1500);
        }, function () {});
      });
    })();
  </script>`;
}

// The read ladder. Counts on OPEN (founder call 2026-07-21: whatever gets seen by the most
// people) but dedupes by article url, so "three reads" means three different pieces rather
// than three refreshes of one. Offers swapped 2026-07-25 (see inside): first ask is a FOLLOW,
// escalating to the Dispatch at three reads. The iOS app is deliberately no longer in the
// ladder at all; it stays on /app for people who go looking, because the measured audience is
// mostly Android in markets where an App Store link is a dead end. Like the share row this embeds page-specific values, so its
// CSP hash is computed per page at generation time.
function ladderScriptTag(url, lanePath) {
  return `<script>
    (function () {
      var url = ${JSON.stringify(url).replace(/</g, "\\u003c")};
      var lane = ${JSON.stringify(lanePath).replace(/</g, "\\u003c")};
      var KEY = 'archv.read';
      var read = [];
      try { read = JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) { read = []; }
      if (!Array.isArray(read)) read = [];
      if (read.indexOf(url) === -1) {
        read.push(url);
        try { localStorage.setItem(KEY, JSON.stringify(read.slice(-50))); } catch (e) {}
      }
      var count = read.length;
      var box = document.getElementById('read-ladder');
      var note = document.getElementById('ladder-note');
      var cta = document.getElementById('ladder-cta');
      var alt = document.getElementById('ladder-alt');
      if (!box || !note || !cta || !alt) return;

      // Offer swap, 2026-07-25. The ladder used to lead with the iOS app and got 1 click
      // from 194 impressions. PostHog says why: 57% of this traffic is India, Indonesia and
      // Nigeria arriving from TikTok, largely on Android, so the app was an ask most of them
      // could not physically take. Both asks are now free, instant and device-agnostic.
      // Referrer-aware, because asking a TikTok visitor to follow on TikTok is a wasted ask.
      var from = document.referrer || '';
      var viaTikTok = from.indexOf('tiktok.') !== -1;
      var social = viaTikTok
        ? { name: 'Instagram', url: 'https://instagram.com/thearchvfc', key: 'instagram' }
        : { name: 'TikTok', url: 'https://www.tiktok.com/@thearchvfc', key: 'tiktok' };

      function external(el, href) {
        el.href = href;
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }

      var variant;
      if (count >= 3) {
        // Three pieces in means real intent, so escalate to the owned channel. Email, not
        // the app: a Substack subscription works on any device in any country.
        variant = 'dispatch';
        note.textContent = 'That is three you have read. The Dispatch brings the archive to you.';
        cta.textContent = 'Join the Dispatch';
        external(cta, 'https://thearchvdispatch.substack.com');
        alt.textContent = 'Or follow on ' + social.name;
        external(alt, social.url);
      } else {
        variant = 'follow';
        note.textContent = 'One football story a day, drawn and checked. Follow so tomorrow finds you.';
        cta.textContent = 'Follow on ' + social.name;
        external(cta, social.url);
        alt.textContent = 'Read another';
        alt.href = lane;
        alt.removeAttribute('target');
        alt.removeAttribute('rel');
      }
      box.hidden = false;
      if (window.posthog) posthog.capture('read_ladder_shown', { variant: variant, reads: count, platform: social.key, via_tiktok: viaTikTok });
      function tap(el, target) {
        el.addEventListener('click', function () {
          if (window.posthog) posthog.capture('read_ladder_click', { target: target, variant: variant, reads: count, platform: social.key, via_tiktok: viaTikTok });
        });
      }
      tap(cta, 'primary');
      tap(alt, 'secondary');
    })();
  </script>`;
}

function render(entry, section, hasCard, hasWide, moreFrom, prevEntry, nextEntry) {
  const lane = section; // section carries label/seoSuffix/anchor/base/sportKey/laneKey
  // The Answer Desk lanes (NFL, F1, tennis, golf) file a question as the headline and its answer
  // as the body. Those two facts drive both the FAQPage block and the question H2 below; the
  // three football lanes file news and take neither.
  const faq = section.laneKey === "questions"
    ? { question: entry.headline, answer: questionAnswer(entry.dek, entry.body) }
    : null;
  const url = `${SITE}${section.base}${entry.date}/`;
  const ogImage = hasCard ? `${SITE}${section.base}${entry.date}/og.png` : `${SITE}/og.jpg`;
  // JSON-LD image array: both generated crops when they exist. og:image above deliberately
  // stays the single 1200x630 og.png (1.91:1 is the OG standard); the 16:9 variant is offered
  // to the parsers that read schema.org image arrays, not to the share scrapers.
  const schemaImages = hasCard
    ? [ogImage, ...(hasWide ? [`${SITE}${section.base}${entry.date}/og-wide.png`] : [])]
    : [`${SITE}/og.jpg`];
  const xIntent = `https://x.com/intent/post?text=${encodeURIComponent(entry.headline)}&url=${encodeURIComponent(url)}&via=thearchvfc`;
  const shareScript = shareScriptTag(url, entry.headline);
  const ladderScript = ladderScriptTag(url, section.base);
  const pageCsp = cspMeta({
    scripts: [MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH, scriptHash(extractScriptBody(shareScript)), scriptHash(extractScriptBody(ladderScript))],
    posthog: true,
    googleFonts: true,
  });

  const figure = entry.image
    ? `
      <figure class="article__fig">
        <img src="${escAttr(entry.image)}" alt="${escAttr(entry.imageAlt ?? entry.headline)}" width="240" height="240" loading="eager" decoding="async" />
      </figure>` : "";

  const ladder = `
      <aside class="ladder" id="read-ladder" hidden>
        <p class="ladder__note" id="ladder-note"></p>
        <a class="ladder__cta" id="ladder-cta" href="/app/"></a>
        <a class="ladder__alt" id="ladder-alt" href="/"></a>
      </aside>
      <style>
        .ladder{margin:44px 0 8px;padding:28px 24px;border:1px solid rgba(201,161,74,.32);border-radius:16px;background:rgba(255,255,255,.03);text-align:center}
        .ladder__note{margin:0 0 18px;font-size:1rem;line-height:1.55;color:#F2EAD3}
        .ladder__cta{display:inline-block;padding:14px 26px;border-radius:12px;background:#C9A14A;color:#071C2B;text-decoration:none;font-weight:600}
        .ladder__cta:hover{filter:brightness(1.06)}
        .ladder__alt{display:block;margin-top:14px;font-size:.9rem;color:#B3AB92;text-decoration:underline;text-underline-offset:3px}
        .ladder__alt:hover{color:#F2EAD3}
      </style>`;

  // W3.1 — "More from the <lane>": whole-card links to the previous 3 entries in this lane.
  const moreCards = moreFrom.length
    ? `
      <section class="related" aria-label="More from ${esc(lane.label)}">
        <h2>More from ${esc(lane.label)}</h2>
        <ul class="more-cards">
          ${moreFrom
            .map((e) => {
              // Non-empty alt (img alt audit, UNIT 4): these are content headshots inside a link,
              // not decorative chrome, so they get the same fallback as the article's main figure.
              const avatar = e.image
                ? `<img class="more-card__avatar" src="${escAttr(e.image)}" alt="${escAttr(e.imageAlt ?? e.headline)}" loading="lazy" decoding="async" width="44" height="44" />`
                : "";
              return `<li><a class="more-card" href="${section.base}${e.date}/">${avatar}<span class="more-card__body"><span class="more-card__kicker">${esc(e.day)} · ${esc(longDate(e.date))}</span><span class="more-card__headline">${esc(e.headline)}</span><span class="more-card__dek">${esc(e.dek)}</span></span></a></li>`;
            })
            .join("\n          ")}
        </ul>
        <a class="related__all" href="${section.base}">All ${esc(lane.label)} stories &rarr;</a>
      </section>` : "";

  // W3.2 — prev/next chronological links within the lane.
  const adjacent =
    prevEntry || nextEntry
      ? `
      <nav class="adjacent" aria-label="More entries">
        ${prevEntry ? `<a class="adjacent__link adjacent__link--prev" href="${section.base}${prevEntry.date}/"><span class="adjacent__dir">&larr; Previous</span><span class="adjacent__headline">${esc(prevEntry.headline)}</span></a>` : "<span></span>"}
        ${nextEntry ? `<a class="adjacent__link adjacent__link--next" href="${section.base}${nextEntry.date}/"><span class="adjacent__dir">Next &rarr;</span><span class="adjacent__headline">${esc(nextEntry.headline)}</span></a>` : ""}
      </nav>` : "";

  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>${esc(clampTitle([entry.headline, lane.seoSuffix, "The ARCHV"]))}</title>
  <meta name="description" content="${escAttr(metaDescription(entry.dek, entry.body))}" />
  <meta name="robots" content="index,follow,max-image-preview:large" />
  <link rel="canonical" href="${url}" />
  <meta name="theme-color" content="#FFFFFF" />
  ${pageCsp}
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="The ARCHV" />
  <meta property="og:title" content="${escAttr(entry.headline)}" />
  <meta property="og:description" content="${escAttr(entry.dek)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${ogImage}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@thearchvfc" />
  <meta name="twitter:title" content="${escAttr(entry.headline)}" />
  <meta name="twitter:description" content="${escAttr(entry.dek)}" />
  <meta name="twitter:image" content="${ogImage}" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  ${RSS_LINK}
  <script type="application/ld+json">${schema(entry, url, lane.label, faq, schemaImages)}</script>

  <!-- PostHog: pageview only on this static surface. Same project as the website. -->
  ${posthogSnippet()}

  ${fontLinks()}

  ${pageStyles()}
</head>
<body>
  ${masthead(section.sportKey)}
  ${deskNav(section.laneKey, section.sportKey)}
  <main class="wrap">
    <article class="article">
      <p class="breadcrumb"><a href="/">The ARCHV</a> / <a href="/${lane.anchor}">${esc(lane.label)}</a></p>
      <p class="article__eyebrow">${esc(lane.label)} · ${esc(entry.day)}</p>
      <h1>${esc(entry.headline)}</h1>
      <p class="article__byline">By <a href="${escAttr(AUTHOR_URL)}" rel="author">${esc(AUTHOR_NAME)}</a></p>
      <p class="article__meta">${esc(longDate(entry.date))}</p>
      <div class="share" aria-label="Share this article">
        <button class="btn btn--ghost" id="share-native" type="button" hidden>Share</button>
        <a class="btn btn--ghost" id="share-x" href="${escAttr(xIntent)}" target="_blank" rel="noopener noreferrer">Share on X</a>
        <button class="btn btn--ghost" id="share-copy" type="button">Copy link</button>
      </div>${figure}
      <div class="article__body">
        ${faq ? `<h2 class="answer__q">${esc(faq.question)}</h2>\n        ` : ""}<p><strong>${esc(entry.dek)}</strong></p>
        ${bodyHtml(entry.body)}
      </div>
      <p class="article__rights">The ARCHV is an independent football-history publication, not affiliated with any governing body, league, club, or competition organiser. Club and competition names are referenced for editorial and historical commentary only and remain the property of their respective owners. Player illustrations are original stylised artwork, not photographs.</p>
      ${adjacent}
      <nav class="article__nav" aria-label="More from this section">
        <a href="/">Home</a>
        <a href="/${lane.anchor}">More ${esc(lane.label)}</a>
      </nav>${moreCards}
      ${ladder}
    </article>
  </main>
  ${footer()}
  ${shareScript}
  ${ladderScript}
</body>
</html>
`;
}

/* ---------- write pages ---------- */
let count = 0;
let cards = 0;
let wideCards = 0;
const urls = [];
for (const section of sections) {
  // dist path segments from the section base: "/desk/transfer/" -> ["desk","transfer"];
  // "/nfl/questions/" -> ["nfl","questions"]. Football is byte-identical to the old join.
  const relParts = section.base.split("/").filter(Boolean);
  const lane = section;
  for (let i = 0; i < lane.days.length; i++) {
    const entry = lane.days[i];
    const dir = join(OUT, ...relParts, entry.date);
    mkdirSync(dir, { recursive: true });

    // Per-article OG cards, both crops; a failure never breaks the build, the page just keeps
    // /og.jpg. The wide card is tried independently so a one-off failure there still leaves the
    // standard og.png as og:image and in the JSON-LD image array.
    let hasCard = false;
    let hasWide = false;
    try {
      const png = await ogCard(entry, lane.label);
      writeFileSync(join(dir, "og.png"), png);
      hasCard = true;
      cards++;
    } catch (err) {
      console.warn(`[build-article-pages] og card failed for ${section.sportKey}/${section.laneKey}/${entry.date} (${entry.headline}): ${err && err.message ? err.message : err}`);
    }
    if (hasCard) {
      try {
        const wide = await ogCard(entry, lane.label, 675);
        writeFileSync(join(dir, "og-wide.png"), wide);
        hasWide = true;
        wideCards++;
      } catch (err) {
        console.warn(`[build-article-pages] og-wide card failed for ${section.sportKey}/${section.laneKey}/${entry.date} (${entry.headline}): ${err && err.message ? err.message : err}`);
      }
    }

    // W3.1 — "more from the lane": lane.days is newest-first (see src/data/*.ts), so entries at
    // higher indices are chronologically earlier ("previous"). Pad from the newer side if the
    // current entry is near the end of the array so the block is never empty/short.
    const older = lane.days.filter((_, j) => j > i).slice(0, 3);
    const newer = lane.days.filter((_, j) => j < i).slice(-1 * (3 - older.length)).reverse();
    const moreFrom = [...older, ...newer].slice(0, 3);
    const prevEntry = lane.days[i + 1] ?? null; // older
    const nextEntry = lane.days[i - 1] ?? null; // newer

    writeFileSync(join(dir, "index.html"), render(entry, section, hasCard, hasWide, moreFrom, prevEntry, nextEntry));
    urls.push(`  <url><loc>${SITE}${section.base}${entry.date}/</loc><lastmod>${entry.date}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`);
    count++;
  }
}

/* ---------- sitemap: append to whatever dist/sitemap.xml already exists at this point in the
   build chain (build-content.mjs writes it first, build-day-pages.mjs appends day pages, this
   script runs last and appends the canonical <lane>/<date> article URLs). If dist/sitemap.xml is
   somehow missing, fall back to public/sitemap.xml so the static routes are never lost. */
const sitemapOut = join(OUT, "sitemap.xml");
const sitemapFallback = join(ROOT, "public", "sitemap.xml");
const sitemapSrc = existsSync(sitemapOut) ? sitemapOut : existsSync(sitemapFallback) ? sitemapFallback : null;
if (sitemapSrc && urls.length) {
  const xml = readFileSync(sitemapSrc, "utf8");
  writeFileSync(sitemapOut, xml.replace("</urlset>", `${urls.join("\n")}\n</urlset>`));
}

console.log(`[build-article-pages] wrote ${count} article page(s), ${cards} og card(s) and ${wideCards} og-wide card(s) to ${OUT}/desk/<lane>/<date>/, appended to sitemap`);
