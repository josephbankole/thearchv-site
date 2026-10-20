/* build-scores-page.mjs: the live scores page at /scores/ (2026-10-13).

   A static shell plus one small inline script (scripts/shared/scores-client.js). The script reads
   the public archv-scores/1 feed that the scores-poll Edge Function writes to Supabase storage
   (live/scores.json, and live/match/<id>.json for the goals, cards and ratings behind a match) and
   builds the list in the browser. Nothing from the feed is rendered at build time, so the HTML here
   never goes stale and the build needs no network.

   HISTORY (2026-10-13). The same script reads days/index.json and days/<date>.json from that bucket
   (the scores-poll function archives each Edmonton day) and shows a date menu with previous and next
   day buttons above the list. The address carries the day as ?date=YYYY-MM-DD, so a past day can be
   shared and the back button walks back through the days. No index, no controls: the page is then
   exactly the live page it was.

   TEXT ONLY, BY RULE. No crests, logos or photos: the feed carries none (map.ts builds every object
   field by field), the page loads none, and img-src stays 'self' data:.

   PANELS (2026-10-19, founder: "swipe right to see the starting lineups in a graphic with player
   ratings, each player represented with a shirt in their team colors with their number, then swipe
   right again to see the team stats"). An open match shows Summary, Lineups and Team stats side by
   side in a scroll-snap track with a tab row above it. The shirts are one plain T-shirt outline drawn
   as inline SVG in the browser and filled with the team's colour from the feed: no crest, sponsor,
   stripe, trim or pattern, nothing that copies a real kit, and the hues are data, never tokens. The
   pure helpers are scripts/shared/scores-pitch.js, spliced into the client by
   scripts/shared/scores-script.mjs, and tested by `npm run test:scores`.

   CSP. The page is the one place in the family that talks to another origin, so it passes the
   Supabase storage host to cspMeta() as `connect`, which adds it to connect-src for this page and
   no other. The inline script is allowed by its exact sha256, computed from the same text that is
   written between the tags, like /guess/. verify-csp-pages.mjs checks it.

   ROBOTS. noindex,follow with a self canonical, and out of the sitemap and the search index, the
   same call as /wire/ and an empty /tables/: the server HTML holds no scores (they arrive in the
   browser), so as a search result it would be a thin page. To index it later, swap the constant. */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SITE, NO_SPORT, esc, masthead, footer, documentShell, ROBOTS_NOINDEX_FOLLOW,
  cspMeta, scriptHash, extractScriptBody, MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH,
} from "./shared/page-shell.mjs";
import { scoresClientSource } from "./shared/scores-script.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.CONTENT_OUT || join(ROOT, "dist");
const PAGE_URL = `${SITE}/scores/`;
const FEED_ORIGIN = "https://fpsfnhjxczzyqurzbqpt.supabase.co";

const TITLE = "Live scores · The ARCHV";
const DESCRIPTION =
  "Live scores from the Premier League, the Champions League and the Women's Super League, with goals, cards, lineups, team stats and player ratings.";
const SUBLINE =
  "Premier League, Champions League and Women's Super League. Select a live or finished match for its goals, cards, top-rated players, lineups and team stats.";

// The client with the pitch helpers spliced in. scoresClientSource() throws on a closing script tag
// or an HTML comment opener, either of which would break the inline element or its hash.
const clientSource = scoresClientSource(ROOT);
const script = `<script>\n${clientSource}  </script>`;

const pageCsp = cspMeta({
  scripts: [MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH, scriptHash(extractScriptBody(script))],
  posthog: true,
  connect: [FEED_ORIGIN],
});

function styles() {
  return `<style>
    .scores-page { padding: 1.6rem 0 1rem; }
    .scores-page .lede { margin: 0 0 .5rem; color: var(--ink-soft); font-size: .95rem; }
    .scores__nav { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; margin: 0 0 1rem; }
    .scores__nav[hidden] { display: none; }
    .scores__btn, .scores__pick { margin: 0; padding: .5rem .8rem; border: 1px solid var(--rule); border-radius: .5rem; background: none; color: var(--ink); font: inherit; font-size: .9rem; line-height: 1.2; }
    .scores__btn { cursor: pointer; white-space: nowrap; }
    .scores__btn:hover:not(:disabled), .scores__pick:hover { background: var(--bg-sunken); }
    .scores__btn:disabled { color: var(--ink-muted); cursor: default; opacity: .55; }
    .scores__btn:focus-visible, .scores__pick:focus-visible { outline: 2px solid var(--accent-ink); outline-offset: 2px; }
    .scores__btn[hidden] { display: none; }
    .scores__pick { flex: 1 1 9rem; min-width: 0; max-width: 100%; cursor: pointer; }
    .scores__tz { flex: 1 0 100%; margin: .1rem 0 0; color: var(--ink-muted); font-size: .85rem; }
    .scores__tz[hidden] { display: none; }
    .scores__sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
    .scores__updated { margin: 0 0 1.4rem; min-height: 1.2em; color: var(--ink-muted); font-family: var(--font-mono); font-size: .8rem; letter-spacing: .06em; text-transform: uppercase; }
    .scores__group { margin: 0 0 2rem; }
    .scores__group h2 { margin: 0 0 .2rem; color: var(--ink); font-family: var(--display); font-weight: 400; text-transform: uppercase; letter-spacing: .02em; font-size: 1.5rem; line-height: 1.2; }
    .scores__day { margin: 1rem 0 .3rem; color: var(--ink-muted); font-family: var(--font-mono); font-size: .75rem; font-weight: 400; letter-spacing: .08em; text-transform: uppercase; }
    .scores__list { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--rule); }
    .scores__item { border-bottom: 1px solid var(--rule); }
    .scores__row { display: grid; grid-template-columns: 3.9rem minmax(0, 1fr) auto minmax(0, 1fr) .9rem; align-items: center; gap: .45rem; width: 100%; margin: 0; padding: .7rem .25rem; border: 0; background: none; color: var(--ink); font: inherit; font-size: .98rem; line-height: 1.3; text-align: left; }
    button.scores__row { cursor: pointer; }
    button.scores__row:hover { background: var(--bg-sunken); }
    button.scores__row:focus-visible { outline: 2px solid var(--accent-ink); outline-offset: -2px; }
    .scores__status { color: var(--ink-muted); font-size: .82rem; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .is-live .scores__status { color: var(--accent-ink); font-weight: 600; }
    .scores__dot { display: inline-block; width: .5rem; height: .5rem; margin-right: .3rem; border-radius: 50%; background: var(--accent-fill); animation: scores-pulse 1.6s ease-in-out infinite; }
    @keyframes scores-pulse { 50% { opacity: .35; } }
    .scores__home, .scores__away { overflow-wrap: anywhere; }
    .scores__home { text-align: right; }
    .scores__score { min-width: 3.2rem; text-align: center; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .scores__pens { display: block; color: var(--ink-muted); font-size: .72rem; font-weight: 400; }
    .scores__caret { justify-self: end; width: .5rem; height: .5rem; border-right: 2px solid var(--ink-muted); border-bottom: 2px solid var(--ink-muted); transform: rotate(45deg) translate(-2px, -2px); }
    button.scores__row[aria-expanded="true"] .scores__caret { transform: rotate(225deg) translate(-2px, -2px); }
    div.scores__row .scores__caret { visibility: hidden; }
    .scores__detail { padding: .9rem .75rem 1.1rem; background: var(--bg-sunken); }
    .scores__detail[hidden] { display: none; }
    .scores__events { list-style: none; margin: 0; padding: 0; display: grid; gap: .35rem; }
    .scores__evrow { display: grid; grid-template-columns: 1fr 3.4rem 1fr; gap: .4rem; font-size: .92rem; line-height: 1.35; }
    .scores__ev--home { text-align: right; }
    .scores__min { color: var(--ink-muted); text-align: center; font-variant-numeric: tabular-nums; }
    .scores__card { margin-right: .15rem; color: var(--ink-muted); font-family: var(--font-mono); font-size: .7rem; letter-spacing: .06em; text-transform: uppercase; }
    .scores__card--red { color: var(--accent-ink); }
    .scores__ratings { margin: 1rem 0 0; padding-top: .8rem; border-top: 1px solid var(--rule); }
    .scores__ratings h4, .pitch__bench h4 { margin: 0 0 .5rem; color: var(--ink-muted); font-family: var(--font-mono); font-size: .72rem; font-weight: 400; letter-spacing: .08em; text-transform: uppercase; }
    .scores__cols { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .scores__team { margin: 0 0 .25rem; color: var(--ink); font-size: .9rem; font-weight: 600; }
    .scores__rate { list-style: none; margin: 0; padding: 0; font-size: .9rem; line-height: 1.4; }
    .scores__rate li { display: flex; justify-content: space-between; gap: .5rem; }
    .scores__num { color: var(--ink); font-variant-numeric: tabular-nums; }
    .scores__note { margin: 0; color: var(--ink-muted); font-size: .95rem; }
    .scores__foot { margin: 1.6rem 0 0; color: var(--ink-muted); font-size: .85rem; }
    .scores__noscript { padding: 1rem 1.1rem; border: 1px solid var(--rule); border-radius: .6rem; font-size: .9rem; color: var(--ink-soft); }

    /* The three panels behind an open match (2026-10-19): tab row, then the track. */
    .scores__tabs { display: flex; gap: .25rem; margin: 0 0 .9rem; padding: .2rem; border: 1px solid var(--rule); border-radius: .55rem; background: var(--bg); }
    .scores__tab { flex: 1 1 0; min-width: 0; margin: 0; padding: .45rem .4rem; border: 0; border-radius: .4rem; background: none; color: var(--ink-muted); font: inherit; font-size: .85rem; font-weight: 600; line-height: 1.2; cursor: pointer; }
    .scores__tab:hover { color: var(--ink); }
    .scores__tab[aria-selected="true"] { background: var(--ink); color: var(--bg); }
    .scores__tab:focus-visible { outline: 2px solid var(--accent-ink); outline-offset: 2px; }
    /* A horizontal scroller must never own a vertical gesture (trap 3 in CLAUDE.md, the 2026-08-04
       rollback). overflow-x: auto makes the used overflow-y auto as well, so overflow-y: hidden is set
       out loud, the same guard as .sportnav. Nothing inside the track may carry a transform or a
       translate, and there is no touch-action here: a vertical swipe on the pitch must scroll the
       page. The track is as tall as the panel on show (set by the client), and the taller panels
       beside it are clipped by this same overflow-y. No smooth scroll-behavior either: the client
       puts the panel back instantly after each 30-second rebuild, and animates only a tab press. */
    .scores__track { display: grid; grid-auto-flow: column; grid-auto-columns: 100%; align-items: start; overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain; scroll-snap-type: x mandatory; scroll-behavior: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
    .scores__track::-webkit-scrollbar { display: none; }
    /* position: relative makes each panel the containing block of the visually hidden .scores__sr
       text inside it (position: absolute). Without it that text is placed against main, outside the
       track, and the panels off to the side widen the whole page. Not a transform, so trap 3 holds. */
    .scores__panel { position: relative; min-width: 0; scroll-snap-align: start; scroll-snap-stop: always; }
    .scores__panel:focus { outline: none; }
    .scores__panel:focus-visible { outline: 2px solid var(--accent-ink); outline-offset: -2px; }

    /* Lineups: one pitch, away at the top, home at the bottom. The two halves are equal grid rows, so
       the halfway line sits at 50%. Markings are centred with inset and auto margins, never translate.
       The DOM runs keeper first and left to right for both teams; the home half is reversed top to
       bottom and the away rows left to right, so the teams face each other. */
    .pitch { position: relative; display: grid; grid-template-rows: 1fr 1fr; max-width: 34rem; margin: 0 auto; padding: .5rem .2rem; background: var(--bg); border: 1px solid var(--rule); border-radius: .5rem; }
    .pitch__marks { position: absolute; inset: 0; pointer-events: none; }
    .pitch__marks span { position: absolute; border: 1px solid var(--rule); }
    .pitch__line { left: 0; right: 0; top: 50%; height: 0; border-width: 1px 0 0; }
    .pitch__circle { inset: 0; margin: auto; width: 5rem; height: 5rem; border-radius: 50%; }
    .pitch__box, .pitch__goal { left: 0; right: 0; margin: 0 auto; }
    .pitch__box { width: 58%; height: 14%; }
    .pitch__goal { width: 26%; height: 5%; }
    .pitch__box--top, .pitch__goal--top { top: 0; border-top-width: 0; }
    .pitch__box--bottom, .pitch__goal--bottom { bottom: 0; border-bottom-width: 0; }
    .pitch__half { position: relative; display: flex; flex-direction: column; justify-content: space-around; gap: .55rem; padding: .3rem 0; }
    .pitch__half--home { flex-direction: column-reverse; }
    .pitch__row { display: flex; justify-content: space-around; margin: 0; padding: 0; list-style: none; }
    .pitch__half--away .pitch__row { flex-direction: row-reverse; }
    .pitch__p { flex: 1 1 0; min-width: 0; max-width: 7rem; padding: 0 .1rem; text-align: center; }
    .pitch__kit { position: relative; display: block; width: 2.1rem; height: 2.1rem; margin: 0 auto; }
    .pitch__shirt { display: block; width: 100%; height: 100%; }
    .pitch__shirt path { stroke-width: 1.3; stroke-linejoin: round; }
    .pitch__shirt text { font-family: 'Inter Tight', system-ui, sans-serif; font-size: 12.5px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .pitch__shirt .pitch__halo { paint-order: stroke; stroke-width: 2.4px; stroke-linejoin: round; }
    .pitch__rate { position: absolute; top: -.3rem; left: 1.55rem; padding: 0 .22rem; border: 1px solid var(--rule); border-radius: .3rem; background: var(--bg-sunken); color: var(--ink); font-size: .64rem; font-weight: 600; line-height: 1.35; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .pitch__rate.is-top { border-color: var(--accent-ink); background: var(--accent-ink); color: #fff; }
    .pitch__name { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; margin: .2rem 0 0; color: var(--ink); font-size: .68rem; line-height: 1.2; overflow-wrap: break-word; }
    .pitch__team { display: flex; flex-wrap: wrap; align-items: baseline; gap: .1rem .6rem; max-width: 34rem; margin: 0 auto .5rem; color: var(--ink); font-size: .92rem; }
    .pitch__team--home { margin: .5rem auto 0; }
    .pitch__team strong { font-weight: 600; }
    .pitch__meta { color: var(--ink-muted); font-size: .8rem; }
    .pitch__bench { margin: 1rem 0 0; padding-top: .8rem; border-top: 1px solid var(--rule); }
    .pitch__list { list-style: none; margin: 0; padding: 0; font-size: .88rem; line-height: 1.45; }
    .pitch__list li { display: flex; gap: .45rem; }
    .pitch__no { flex: 0 0 1.3rem; color: var(--ink-muted); font-variant-numeric: tabular-nums; text-align: right; }
    .pitch__list .scores__num { margin-left: auto; }
    .pitch__src { margin: .8rem 0 0; color: var(--ink-muted); font-size: .8rem; }

    /* Team stats: home value, label with a split bar under it, away value. Bars are fills only. */
    .stats { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: .9rem; line-height: 1.35; }
    .stats__side { width: 27%; }
    .stats thead th { padding: 0 0 .5rem; color: var(--ink); font-size: .88rem; font-weight: 600; overflow-wrap: anywhere; }
    .stats thead th:first-child, .stats td:first-child { text-align: left; }
    .stats thead th:last-child, .stats td:last-child { text-align: right; }
    .stats tbody td, .stats tbody th { padding: .5rem 0; border-top: 1px solid var(--rule); vertical-align: top; }
    .stats tbody td { color: var(--ink); font-weight: 600; font-variant-numeric: tabular-nums; }
    .stats tbody th { padding: .5rem .5rem; color: var(--ink-soft); font-size: .85rem; font-weight: 400; text-align: center; }
    .stats__bar { display: flex; gap: 2px; height: .3rem; margin: .4rem 0 0; }
    .stats__bar span { display: block; min-width: 2px; border-radius: 1px; }
    .stats__home { background: var(--ink); }
    .stats__away { background: var(--accent-fill); }
    @media (max-width: 380px) {
      .scores__row { grid-template-columns: 3.2rem minmax(0, 1fr) auto minmax(0, 1fr) .7rem; gap: .35rem; font-size: .93rem; }
      .scores__score { min-width: 2.8rem; }
    }
    @media (prefers-reduced-motion: reduce) { .scores__dot { animation: none; } }
  </style>`;
}

const html = `${documentShell({
  title: TITLE,
  metaDescription: DESCRIPTION,
  description: DESCRIPTION,
  socialTitle: TITLE,
  robots: ROBOTS_NOINDEX_FOLLOW,
  canonical: PAGE_URL,
  ogUrl: PAGE_URL,
  ogType: "website",
  ogImage: `${SITE}/og.jpg`,
  csp: pageCsp,
  extraHead: [styles()],
  jsonLd: {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", name: "Live scores", description: DESCRIPTION, url: PAGE_URL, inLanguage: "en-GB", isPartOf: { "@type": "WebSite", name: "The ARCHV", url: `${SITE}/` } },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "Live scores", item: PAGE_URL },
        ],
      },
    ],
  },
})}
<body>
  ${masthead(NO_SPORT)}
  <main class="wrap" id="main">
    <section class="scores-page">
      <p class="breadcrumb"><a href="/">The ARCHV</a> / Live scores</p>
      <h1>Live scores</h1>
      <p class="lede">${esc(SUBLINE)}</p>
      <nav class="scores__nav" id="scores-nav" aria-label="Match history" hidden>
        <button type="button" class="scores__btn" id="scores-prev">Previous day</button>
        <label class="scores__sr" for="scores-date">Choose a day</label>
        <select class="scores__pick" id="scores-date"></select>
        <button type="button" class="scores__btn" id="scores-next">Next day</button>
        <button type="button" class="scores__btn" id="scores-live" hidden>Back to live scores</button>
        <p class="scores__tz" id="scores-tz" hidden>Days follow Edmonton time. Kickoff times are in your own time zone.</p>
      </nav>
      <p class="scores__updated" id="scores-updated"></p>
      <p class="scores__sr" id="scores-status" role="status" aria-live="polite"></p>
      <noscript>
        <p class="scores__noscript">The scores need JavaScript, which is off in this browser.</p>
      </noscript>
      <div class="scores" id="scores">
        <p class="scores__note">Loading scores.</p>
      </div>
      <p class="scores__foot">Scores, ratings, lineups and team stats from API-Football.</p>
    </section>
  </main>
  ${footer()}
  ${script}
</body>
</html>
`;

mkdirSync(join(OUT, "scores"), { recursive: true });
writeFileSync(join(OUT, "scores", "index.html"), html);
console.log(`[build-scores-page] wrote /scores/ (noindex, text only, connect-src +${FEED_ORIGIN}) to ${OUT}`);
