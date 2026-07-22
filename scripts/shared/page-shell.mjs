/* scripts/shared/page-shell.mjs — shared bits for the self-contained static page family
   (per-article pages, lane index pages): brand CSS, masthead/footer markup, escaping helpers
   and the lane registry. Both scripts/build-article-pages.mjs and scripts/build-lane-pages.mjs
   import from here so the two page types stay visually and structurally in lockstep (same
   masthead, same CSP-exempt inline-style pattern per thearchv-site/CLAUDE.md "Per-article
   pages"). Not used by the homepage bundle (src/), which stays CSP-clean and router-free. */
import { createHash } from "node:crypto";

export const SITE = "https://thearchv.ca";
export const POSTHOG_KEY = "phc_kg8nXCp4TJMcRjBQAVZTQoubijYWeBRMHU9PHYgiUagm";

// LIVE 2026-07-16. Country-neutral URL: Apple geo-redirects each visitor to their
// own storefront (app is live in CA/US/GB and beyond). See FLIP-DAY.md for history.
export const APP_STORE_URL = "https://apps.apple.com/app/id6786508653";

// The named author and editor of The ARCHV (founder decision, 2026-07-21). Single source of truth
// for both halves of the byline: the visible "By ..." line on every article page and the Person
// object in that page's NewsArticle JSON-LD. Google News and news aggregators want a named person
// rather than a masthead, and josephbankole.ca already carries a Person entity, so the same URL
// serves as the author's sameAs. Change the name or the URL here and every generated page follows.
export const AUTHOR_NAME = "Joseph Bankole";
export const AUTHOR_URL = "https://josephbankole.ca";

// The ARCHV's official profiles, for the Organization sameAs entity graph. Kept in one place so
// the homepage Organization JSON-LD (index.html) and every generated article page's publisher
// block point at the same set, consolidating the entity for search and answer engines.
export const ORG_SAMEAS = [
  "https://www.instagram.com/thearchvfc/",
  "https://www.threads.net/@thearchvfc",
  "https://thearchvdispatch.substack.com",
  "https://www.linkedin.com/company/thearchvfc/",
  "https://x.com/thearchvfc",
  "https://www.etsy.com/shop/TheARCHVCA",
];

// Defensive sort: every lane's day-entry array is committed newest-first by convention
// (the daily desk job), but nothing in the type enforces that order. A single
// out-of-order commit would silently scramble lane pages, prev/next nav, the homepage
// day-rail and the article feed all at once. Array.prototype.sort is stable in every
// runtime this build chain touches (Node, evergreen browsers), so entries sharing a
// date keep their existing relative order. Shared by build-lane-pages.mjs,
// build-article-pages.mjs and build-feed.mjs so the three generators can't drift.
export const byDateDesc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

// RSS autodiscovery link, shared so every page in this family (and index.html) points feed
// readers and crawlers at the same /feed.xml built by scripts/build-rss.mjs.
export const RSS_LINK = `<link rel="alternate" type="application/rss+xml" title="The ARCHV" href="/feed.xml" />`;

export const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const escAttr = (s = "") => esc(s).replace(/"/g, "&quot;");

// SEO length guards. Applied to RAW strings before esc()/escAttr() so the length
// count reflects what a search engine sees, not the HTML-entity-encoded markup.
//
// clampTitle: joins title segments with " · ", keeping the lead segment always and
// appending each following segment only while the whole stays within `max`. This
// preserves the entity-rich pattern (headline · seoSuffix · The ARCHV) when it
// fits and drops the least-important trailing pieces (brand first) when it does
// not, rather than letting Google truncate the tail. Falls back to a word-boundary
// truncation of the lead segment only if that alone overflows.
export function clampTitle(segments, max = 60) {
  const parts = (Array.isArray(segments) ? segments : [segments])
    .map((s) => String(s ?? "").trim())
    .filter(Boolean);
  if (!parts.length) return "";
  const SEP = " · ";
  let title = parts[0];
  for (let i = 1; i < parts.length; i++) {
    const candidate = `${title}${SEP}${parts[i]}`;
    if (candidate.length <= max) title = candidate;
  }
  if (title.length > max) {
    const cut = parts[0].slice(0, max - 1);
    const sp = cut.lastIndexOf(" ");
    title = (sp > max * 0.5 ? cut.slice(0, sp) : cut).replace(/[\s.,;:!?·-]+$/, "") + "…";
  }
  return title;
}

// clampDescription: collapse whitespace, then truncate to `max` at a word boundary
// with a trailing ellipsis. Meta descriptions over ~160 chars get cut off in search
// results, so this keeps the whole sentence visible or a clean truncation.
export function clampDescription(s, max = 160) {
  const str = String(s ?? "").trim().replace(/\s+/g, " ");
  if (str.length <= max) return str;
  const cut = str.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s.,;:!?-]+$/, "") + "…";
}

export const longDate = (iso) => {
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }); }
  catch { return iso; }
};

// lane = URL segment under /desk/, anchor = the homepage section this lane links back to.
// seoSuffix = the entity phrase appended after an article headline in its <title> (search-only,
// never shown on the page). indexTitle = the full <title> for that lane's index page. Visible
// copy (h1, og:/twitter: titles) stays brand-clean; only <title> and meta description use these.
export const LANE_META = {
  transfer: {
    label: "Transfer Desk",
    anchor: "#transfer-desk",
    seoSuffix: "Manchester United transfer news",
    indexTitle: "Manchester United Transfer News, Verified Daily · The ARCHV",
  },
  "world-cup": {
    label: "International Football",
    anchor: "#world-cup",
    seoSuffix: "World Cup 2026",
    indexTitle: "World Cup 2026 & International Football · The ARCHV",
  },
  leagues: {
    label: "Football Leagues",
    anchor: "#football-leagues",
    seoSuffix: "Football Leagues",
    indexTitle: "Football Leagues: Premier League, Champions League & More · The ARCHV",
  },
};

// Simple three-desk text nav, on article AND lane pages (SITE-DEPTH-PLAN.md W3.3). Kept as
// plain wrapping text links (not the masthead's button styling) so it stays collision-proof
// down to 320px — verified in the build's interactive check.
export function deskNav(currentLane) {
  const links = Object.entries(LANE_META)
    .map(([key, meta]) => {
      const current = key === currentLane ? ' aria-current="page"' : "";
      return `<a class="desknav__link" href="/desk/${key}/"${current}>${esc(meta.label)}</a>`;
    })
    .join("\n      ");
  return `<nav class="desknav" aria-label="The desks">
      ${links}
    </nav>`;
}

// Hamburger masthead (founder design, 2026-07-11): a disclosure button revealing a small
// brand-styled dropdown (Follow / Subscribe / Shop / App, App hidden until flip day, same
// hidden + display:none convention as before). Shared by lane index and article pages so
// both stay in lockstep with the homepage's version of the same pattern (src/ui/chrome.ts).
// No inline event handlers: the toggle behaviour lives in a plain <script> block wired via
// addEventListener, matching the existing inline-script convention on this page family
// (posthogSnippet(), the share-row script in build-article-pages.mjs).
export function masthead() {
  return `<header class="masthead">
    <a class="wordmark" href="/"><img src="/brand/logo-badge.png" width="34" height="34" alt="The ARCHV" /><span class="wordmark__the">THE</span><span class="wordmark__archv">ARCHV</span></a>
    <div class="masthead__menu">
      <button type="button" class="masthead__toggle" id="masthead-toggle" aria-expanded="false" aria-controls="masthead-panel" aria-label="Menu">
        <span class="masthead__toggle-bar"></span>
        <span class="masthead__toggle-bar"></span>
        <span class="masthead__toggle-bar"></span>
      </button>
      <nav class="masthead__panel" id="masthead-panel" aria-label="Primary" hidden>
        <a class="masthead__panel-link" href="https://instagram.com/thearchvfc" target="_blank" rel="noopener noreferrer">Follow</a>
        <a class="masthead__panel-link masthead__panel-link--gold" href="https://thearchvdispatch.substack.com/subscribe" target="_blank" rel="noopener noreferrer">Subscribe to the Dispatch</a>
        <a class="masthead__panel-link" href="https://www.etsy.com/shop/TheARCHVCA" target="_blank" rel="noopener noreferrer">Shop</a>
        <a class="masthead__panel-link" href="${APP_STORE_URL}">App</a>
      </nav>
    </div>
  </header>
  <script>
    (function () {
      var toggle = document.getElementById('masthead-toggle');
      var panel = document.getElementById('masthead-panel');
      if (!toggle || !panel) return;
      function onKeydown(e) { if (e.key === 'Escape') close(true); }
      function onDocClick(e) {
        if (e.target !== toggle && !toggle.contains(e.target) && !panel.contains(e.target)) close(false);
      }
      function open() {
        panel.hidden = false;
        toggle.setAttribute('aria-expanded', 'true');
        document.addEventListener('keydown', onKeydown);
        document.addEventListener('click', onDocClick, true);
      }
      function close(returnFocus) {
        panel.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
        document.removeEventListener('keydown', onKeydown);
        document.removeEventListener('click', onDocClick, true);
        if (returnFocus) toggle.focus();
      }
      toggle.addEventListener('click', function () {
        if (panel.hidden) open(); else close(false);
      });
    })();
  </script>`;
}

export function footer() {
  return `<footer class="footer">
    <div class="wrap">
      <nav class="footer__links" aria-label="Social">
        <a href="https://instagram.com/thearchvfc" target="_blank" rel="noopener noreferrer">Instagram</a>
        <a href="https://x.com/thearchvfc" target="_blank" rel="noopener noreferrer">X</a>
        <a href="https://thearchvdispatch.substack.com/subscribe" target="_blank" rel="noopener noreferrer">Dispatch</a>
        <a href="https://www.etsy.com/shop/TheARCHVCA" target="_blank" rel="noopener noreferrer">Shop</a>
        <a href="/">Home</a>
        <a href="/glossary/">Glossary</a>
        <a href="/standards/">Standards</a>
        <a href="/about/">About</a>
        <a href="/corrections/">Corrections</a>
      </nav>
      <p class="footer__tag">Football history, illustrated. Daily.</p>
      <p class="footer__legal">The ARCHV is an independent football-history publication, not affiliated with any governing body, league, club, or competition organiser. Club and competition names are referenced for editorial and historical commentary only and remain the property of their respective owners. Player illustrations are original stylised artwork, not photographs. © 2026 The ARCHV.</p>
    </div>
  </footer>`;
}

// PostHog pageview snippet, unchanged from the existing article-page pattern.
export function posthogSnippet() {
  return `<script>
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once unregister opt_in_capturing opt_out_capturing".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
    posthog.init('${POSTHOG_KEY}',{api_host:'https://us.i.posthog.com',autocapture:false,capture_pageview:true,persistence:'localStorage',respect_dnt:true});
  </script>`;
}

/* ---------- CSP (2026-07-13 review, finding #9: "only the homepage has a CSP") ----------
   GitHub Pages can't send headers, so a <meta http-equiv="Content-Security-Policy"> tag is
   the ceiling on every page family, same as index.html. Inline scripts are only allowed via
   an exact sha256 hash (never 'unsafe-inline' for script-src), so the hash must always be
   computed from the EXACT text that ends up between <script> and </script> on the page - the
   helpers below compute it by extracting that substring from the already-built markup, the
   same rule scripts/check-csp-hash.mjs enforces for index.html's own inline bootstrap script.
   That makes the hash self-verifying: whatever we hash is provably what's on the page. */

// sha256 CSP token for an inline <script> body (base64, 'sha256-...' form script-src expects).
export function scriptHash(body) {
  return `sha256-${createHash("sha256").update(body, "utf8").digest("base64")}`;
}

// Pull the exact body of the (single) inline <script>...</script> out of an HTML fragment,
// e.g. the string masthead() or posthogSnippet() returns. Throws if there isn't exactly one -
// ambiguous input is a bug here, not something to silently hash the wrong thing for.
export function extractScriptBody(html) {
  const matches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (matches.length !== 1) {
    throw new Error(`extractScriptBody: expected exactly 1 inline <script>, found ${matches.length}`);
  }
  return matches[0][1];
}

// masthead() and posthogSnippet() are static (no per-page interpolation), so their hashes are
// constant across every page that includes them - computed once here, reused everywhere.
export const MASTHEAD_SCRIPT_HASH = scriptHash(extractScriptBody(masthead()));
export const POSTHOG_SCRIPT_HASH = scriptHash(extractScriptBody(posthogSnippet()));

// Builds the CSP meta tag for a page in this family. `scripts` is every inline <script>
// body's hash on THAT page (masthead + PostHog are shared; build-article-pages.mjs also
// passes a per-page hash for its share-row script, which embeds that page's own url/title
// and so is NOT identical across pages - verified: it must be computed per page, not once).
export function cspMeta({ scripts = [], posthog = false, googleFonts = false, frame = null } = {}) {
  const scriptSrc = ["'self'", ...scripts.map((h) => `'${h}'`)];
  if (posthog) scriptSrc.push("https://us-assets.i.posthog.com", "https://eu-assets.i.posthog.com");
  const styleSrc = ["'self'", "'unsafe-inline'"]; // inline style="" attrs (e.g. the hidden App Store link)
  if (googleFonts) styleSrc.push("https://fonts.googleapis.com");
  const fontSrc = ["'self'"];
  if (googleFonts) fontSrc.push("https://fonts.gstatic.com");
  const connectSrc = ["'self'"];
  if (posthog) connectSrc.push("https://us.i.posthog.com", "https://us-assets.i.posthog.com", "https://eu.i.posthog.com", "https://eu-assets.i.posthog.com");
  const frameSrc = frame ? ["'self'", frame] : ["'none'"];
  const content = [
    `default-src 'self'`,
    `script-src ${scriptSrc.join(" ")}`,
    `style-src ${styleSrc.join(" ")}`,
    `img-src 'self' data:`,
    `font-src ${fontSrc.join(" ")}`,
    `connect-src ${connectSrc.join(" ")}`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `frame-src ${frameSrc.join(" ")}`,
  ].join("; ");
  return `<meta http-equiv="Content-Security-Policy" content="${content}" />`;
}

export function fontLinks() {
  return `<link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600&family=Inter+Tight:wght@400;500;600&display=swap" rel="stylesheet" />`;
}

// Shared brand CSS for the self-contained page family (article pages + lane index pages).
// `.desknav` is new (W3.3): a plain wrapping text row, deliberately not styled as buttons, so
// it never collides with the masthead actions or itself at 320px.
export function pageStyles() {
  return `<style>
    :root {
      --navy: #0C2A3E; --navy-deep: #071C2B; --navy-soft: #133A52;
      --cream: #F2EAD3; --cream-dim: rgba(242,234,211,.72); --cream-faint: rgba(242,234,211,.3);
      --gold: #C9A14A; --gold-soft: rgba(201,161,74,.5);
      --maxw: 46rem;
    }
    * { box-sizing: border-box; }
    html { -webkit-text-size-adjust: 100%; }
    body {
      margin: 0; background: var(--navy); color: var(--cream-dim);
      font-family: "Inter Tight", system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      font-size: 18px; line-height: 1.65; -webkit-font-smoothing: antialiased;
      background-image: radial-gradient(60rem 30rem at 50% -10rem, var(--navy-soft) 0%, rgba(12,42,62,0) 70%);
    }
    a { color: var(--gold); text-decoration: none; }
    a:hover { text-decoration: underline; }
    a:focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; }
    img { max-width: 100%; height: auto; display: block; }
    .wrap { max-width: var(--maxw); margin: 0 auto; padding: 0 1.25rem; }
    .wrap--wide { max-width: 60rem; }

    .masthead { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .6rem .9rem; max-width: 72rem; margin: 0 auto; padding: 1.1rem 1.25rem; }
    .wordmark { display: inline-flex; align-items: center; gap: .5rem; color: var(--cream); font-weight: 700; letter-spacing: .02em; flex-shrink: 0; white-space: nowrap; }
    .wordmark img { width: 34px; height: 34px; }
    .wordmark__the { opacity: .7; font-size: .8rem; letter-spacing: .18em; }
    .wordmark__archv { font-size: 1.15rem; font-family: "Fraunces", Georgia, serif; }
    .btn { display: inline-block; padding: .5rem .9rem; border-radius: .5rem; font-size: .85rem; font-weight: 600; white-space: nowrap; }
    .btn--ghost { border: 1px solid var(--gold-soft); color: var(--cream); }
    .btn--gold { background: var(--gold); color: var(--navy-deep); }

    /* masthead hamburger menu (founder design, 2026-07-11) */
    .masthead__menu { position: relative; flex-shrink: 0; }
    .masthead__toggle {
      display: inline-flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 5px; width: 42px; height: 42px; padding: 0; border: 1px solid var(--gold-soft);
      border-radius: .4rem; background: transparent; cursor: pointer;
    }
    .masthead__toggle:hover { border-color: var(--cream); }
    .masthead__toggle:focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; }
    .masthead__toggle-bar { display: block; width: 18px; height: 2px; background: var(--cream); }
    .masthead__panel {
      position: absolute; top: calc(100% + .5rem); right: 0; z-index: 20; min-width: 13.5rem;
      max-width: calc(100vw - 2.5rem);
      background: var(--navy-deep); border: 1px solid var(--cream-faint); border-radius: .5rem;
      padding: .35rem; display: flex; flex-direction: column; gap: .1rem;
      box-shadow: 0 18px 40px -14px rgba(0, 0, 0, 0.55);
    }
    .masthead__panel[hidden] { display: none; }
    .masthead__panel-link {
      display: block; padding: .65em .8em; border-radius: .35rem; font-size: .85rem; font-weight: 600;
      color: var(--cream);
    }
    .masthead__panel-link:hover, .masthead__panel-link:focus-visible { background: rgba(242, 234, 211, .08); color: var(--gold); text-decoration: none; }
    .masthead__panel-link--gold { color: var(--gold); }

    /* three-desk text nav (W3.3): plain, wrapping, never collides at 320px */
    .desknav { max-width: 72rem; margin: 0 auto; padding: 0 1.25rem .9rem; display: flex; flex-wrap: wrap; gap: .35rem 1rem; font-size: .8rem; letter-spacing: .04em; text-transform: uppercase; }
    .desknav__link { color: var(--cream-faint); }
    .desknav__link:hover { color: var(--gold); }
    .desknav__link[aria-current="page"] { color: var(--gold); }

    .share { display: flex; flex-wrap: wrap; gap: .6rem; margin: 0 0 1.75rem; }
    .share .btn { font-size: .78rem; padding: .4rem .8rem; cursor: pointer; background: none; font-family: inherit; line-height: inherit; }
    .share button.btn { appearance: none; -webkit-appearance: none; }
    .share .btn:hover { border-color: var(--gold); text-decoration: none; }
    .share [hidden] { display: none; }

    .article { padding: 2rem 0 1rem; }
    .breadcrumb { font-size: .8rem; letter-spacing: .04em; color: var(--cream-faint); text-transform: uppercase; margin: 0 0 1rem; }
    .breadcrumb a { color: var(--cream-faint); }
    .article__eyebrow { color: var(--gold); font-size: .78rem; letter-spacing: .16em; text-transform: uppercase; margin: 0 0 .6rem; }
    h1 { color: var(--cream); font-family: "Fraunces", Georgia, serif; font-weight: 600; font-size: clamp(2rem, 5vw, 2.9rem); line-height: 1.1; letter-spacing: -.01em; margin: 0 0 .5rem; }
    /* named byline, sitting between the headline and the date. Deliberately quiet: same
       register as .article__meta below, with the author's name a touch brighter so the link
       reads as a link without becoming the loudest thing under the headline. */
    .article__byline { color: var(--cream-faint); font-size: .85rem; margin: 0 0 .25rem; }
    .article__byline a { color: var(--cream-dim); text-decoration: underline; text-underline-offset: 3px; }
    .article__byline a:hover { color: var(--gold); }
    .article__meta { color: var(--cream-faint); font-size: .9rem; margin: 0 0 1.5rem; }
    .article__fig { margin: 1.5rem 0 2rem; }
    .article__fig img { border-radius: 50%; width: 96px; height: 96px; object-fit: cover; border: 1px solid var(--gold-soft); box-shadow: 0 0 0 4px rgba(7,28,43,.6); }
    .article__body p { margin: 1rem 0; }
    .article__body strong { color: var(--cream); }
    .article__rights { margin: 2rem 0; padding: 1.1rem 1.25rem; border: 1px solid var(--cream-faint); border-radius: .6rem; font-size: .85rem; color: var(--cream-faint); }
    .article__nav { margin: 2.2rem 0 1rem; display: flex; flex-wrap: wrap; gap: 1rem 1.5rem; font-size: .95rem; }

    /* prev/next chronological row (W3.2) */
    .adjacent { margin: 1.6rem 0; padding: 1.2rem 0 0; border-top: 1px solid var(--cream-faint); display: flex; flex-wrap: wrap; justify-content: space-between; gap: .75rem 1.5rem; }
    .adjacent__link { max-width: 22rem; }
    .adjacent__link--next { text-align: right; margin-left: auto; }
    .adjacent__dir { display: block; font-size: .72rem; letter-spacing: .12em; text-transform: uppercase; color: var(--cream-faint); margin-bottom: .3rem; }
    .adjacent__headline { color: var(--cream); font-family: "Fraunces", Georgia, serif; font-size: 1.05rem; line-height: 1.3; }
    .adjacent__headline:hover { text-decoration: underline; }

    .related { margin: 2.5rem 0 1rem; }
    .related h2 { color: var(--cream); font-family: "Fraunces", Georgia, serif; font-weight: 600; font-size: 1.5rem; margin: 0 0 .6rem; padding-top: 1.4rem; border-top: 1px solid var(--cream-faint); }
    .related ul { list-style: none; padding: 0; margin: 0; }
    .related li { margin: .5rem 0; }

    /* "More from the lane" whole-card links (W3.1) */
    .more-cards { list-style: none; padding: 0; margin: 0; display: grid; gap: .9rem; }
    .more-card { display: flex; gap: .85rem; align-items: flex-start; padding: 1rem 1.1rem; border: 1px solid var(--cream-faint); border-radius: .6rem; color: inherit; }
    .more-card:hover { border-color: var(--gold-soft); text-decoration: none; }
    .more-card:focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; }
    .more-card__avatar { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; flex: 0 0 auto; border: 1px solid var(--gold-soft); }
    .more-card__body { min-width: 0; }
    .more-card__kicker { display: block; font-size: .7rem; letter-spacing: .1em; text-transform: uppercase; color: var(--gold); margin-bottom: .3rem; }
    .more-card__headline { color: var(--cream); font-family: "Fraunces", Georgia, serif; font-size: 1.05rem; line-height: 1.28; margin: 0 0 .25rem; }
    .more-card__dek { font-size: .85rem; color: var(--cream-faint); margin: 0; }
    .related__all { display: inline-block; margin-top: 1.1rem; font-size: .9rem; }

    /* lane index page: full-width whole-card list */
    .lane { padding: 1.5rem 0 1rem; }
    .lane h1 { margin-bottom: 1.1rem; }
    .lane__lede { margin-bottom: 2.4rem; }
    .lane__eyebrow { color: var(--gold); font-size: .78rem; letter-spacing: .16em; text-transform: uppercase; margin: 0 0 .6rem; }
    .lane__lede { color: var(--cream-dim); font-size: 1.05rem; max-width: 42rem; margin: 0 0 2rem; }
    .lane-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 1rem; }
    .lane-card { display: flex; gap: 1.1rem; align-items: flex-start; padding: 1.4rem 1.5rem; border: 1px solid var(--cream-faint); border-radius: .75rem;
      background: linear-gradient(180deg, rgba(19, 58, 82, 0.35), rgba(7, 28, 43, 0.35)); color: inherit; transition: border-color .2s ease, transform .2s ease; }
    .lane-card:hover { border-color: var(--gold-soft); text-decoration: none; transform: translateY(-2px); }
    .lane-card:focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; }
    .lane-card__avatar { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; flex: 0 0 auto; border: 1px solid var(--gold-soft); box-shadow: 0 0 0 4px rgba(7,28,43,.6); }
    .lane-card__body { min-width: 0; }
    .lane-card__kicker { display: block; font-size: .74rem; letter-spacing: .12em; text-transform: uppercase; color: var(--gold); margin-bottom: .4rem; }
    .lane-card__headline { color: var(--cream); font-family: "Fraunces", Georgia, serif; font-weight: 600; font-size: clamp(1.15rem, 2.2vw, 1.4rem); line-height: 1.24; margin: 0 0 .4rem; }
    .lane-card__dek { font-size: .9rem; color: var(--cream-dim); margin: 0; }

    /* "From the glossary" strip on lane index pages: a compact row of the lane's key terms,
       sitting above the footer. Inherits the enclosing main's width; no button styling. */
    .lane-glossary { margin: 2.75rem 0 0; padding-top: 1.6rem; border-top: 1px solid var(--cream-faint); }
    .lane-glossary__title { color: var(--cream); font-family: "Fraunces", Georgia, serif; font-weight: 600; font-size: 1.1rem; margin: 0 0 .75rem; }
    .lane-glossary__list { list-style: none; padding: 0; margin: 0 0 .85rem; display: flex; flex-wrap: wrap; gap: .5rem .9rem; font-size: .95rem; }
    .lane-glossary__list a { color: var(--gold); }
    .lane-glossary__all { font-size: .82rem; letter-spacing: .04em; text-transform: uppercase; color: var(--cream-faint); }
    .lane-glossary__all:hover { color: var(--gold); }

    .footer { margin-top: 3rem; border-top: 1px solid var(--cream-faint); background: var(--navy-deep); }
    .footer .wrap { max-width: 72rem; padding-top: 2rem; padding-bottom: 2.5rem; }
    .footer__links { display: flex; flex-wrap: wrap; gap: .9rem 1.5rem; font-size: .9rem; margin: 0 0 1rem; }
    .footer__tag { color: var(--cream); margin: .5rem 0; }
    .footer__legal { color: var(--cream-faint); font-size: .74rem; line-height: 1.5; max-width: 60rem; }

    /* glossary (UNIT 1) + standards (UNIT 2): evergreen static surfaces */
    .glossary { padding: 1.5rem 0 1rem; }
    .glossary .lane__lede { margin-bottom: 2.4rem; }
    .glossary__q { color: var(--cream); font-family: "Fraunces", Georgia, serif; font-weight: 500; font-size: 1.2rem; line-height: 1.3; margin: 1.6rem 0 .5rem; }
    .glossary__answer { font-size: 1.15rem; color: var(--cream); margin: 0 0 1.6rem; }
    .glossary__list { list-style: none; padding: 0; margin: 0; display: grid; gap: 1rem; }
    .glossary-card { display: block; padding: 1.3rem 1.5rem; border: 1px solid var(--cream-faint); border-radius: .75rem; color: inherit;
      background: linear-gradient(180deg, rgba(19, 58, 82, 0.35), rgba(7, 28, 43, 0.35)); transition: border-color .2s ease, transform .2s ease; }
    .glossary-card:hover { border-color: var(--gold-soft); text-decoration: none; transform: translateY(-2px); }
    .glossary-card:focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; }
    .glossary-card__term { display: block; color: var(--cream); font-family: "Fraunces", Georgia, serif; font-weight: 600; font-size: 1.25rem; line-height: 1.24; margin: 0 0 .4rem; }
    .glossary-card__one { display: block; color: var(--cream-dim); font-size: .95rem; }

    .standards { padding: 1.5rem 0 1rem; }
    .standards .lead { font-size: 1.15rem; color: var(--cream); margin: 0 0 1.8rem; }
    .standards h2 { color: var(--cream); font-family: "Fraunces", Georgia, serif; font-weight: 600; font-size: 1.35rem; line-height: 1.2; margin: 2rem 0 .5rem; }
    .standards p { margin: 0 0 1rem; }

    @media (prefers-reduced-motion: reduce) {
      .lane-card, .more-card, .glossary-card { transition: none; }
    }
  </style>`;
}
