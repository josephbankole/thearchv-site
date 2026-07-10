/* scripts/shared/page-shell.mjs — shared bits for the self-contained static page family
   (per-article pages, lane index pages): brand CSS, masthead/footer markup, escaping helpers
   and the lane registry. Both scripts/build-article-pages.mjs and scripts/build-lane-pages.mjs
   import from here so the two page types stay visually and structurally in lockstep (same
   masthead, same CSP-exempt inline-style pattern per thearchv-site/CLAUDE.md "Per-article
   pages"). Not used by the homepage bundle (src/), which stays CSP-clean and router-free. */

export const SITE = "https://thearchv.ca";
export const POSTHOG_KEY = "phc_kg8nXCp4TJMcRjBQAVZTQoubijYWeBRMHU9PHYgiUagm";

// GO-LIVE DAY placeholder (LAUNCH-RUNWAY.md "ready-to-flip"). Every masthead's "App" button
// and the /start badge point here, all shipped `hidden` until flip day. See FLIP-DAY.md at
// the repo root for the exact lines to change. <!-- APP_STORE_URL_PLACEHOLDER -->
export const APP_STORE_URL = "https://apps.apple.com/app/idPLACEHOLDER";

export const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const escAttr = (s = "") => esc(s).replace(/"/g, "&quot;");
export const longDate = (iso) => {
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }); }
  catch { return iso; }
};

// lane = URL segment under /desk/, anchor = the homepage section this lane links back to.
export const LANE_META = {
  transfer: { label: "Transfer Desk", anchor: "#transfer-desk" },
  "world-cup": { label: "International Football", anchor: "#world-cup" },
  leagues: { label: "Football Leagues", anchor: "#football-leagues" },
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

export function masthead() {
  return `<header class="masthead">
    <a class="wordmark" href="/"><img src="/brand/logo-badge.png" width="34" height="34" alt="" /><span class="wordmark__the">THE</span><span class="wordmark__archv">ARCHV</span></a>
    <nav class="masthead__actions" aria-label="Primary">
      <a class="btn btn--ghost" href="${APP_STORE_URL}" hidden><!-- APP_STORE_URL_PLACEHOLDER -->App</a>
      <a class="btn btn--ghost" href="https://instagram.com/thearchvfc" target="_blank" rel="noopener noreferrer">Follow</a>
      <a class="btn btn--gold" href="https://thearchvdispatch.substack.com/subscribe" target="_blank" rel="noopener noreferrer">Subscribe</a>
    </nav>
  </header>`;
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
    .masthead__actions { display: inline-flex; flex-wrap: wrap; gap: .6rem .75rem; }
    .btn { display: inline-block; padding: .5rem .9rem; border-radius: .5rem; font-size: .85rem; font-weight: 600; white-space: nowrap; }
    .btn--ghost { border: 1px solid var(--gold-soft); color: var(--cream); }
    .btn--gold { background: var(--gold); color: var(--navy-deep); }

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

    .footer { margin-top: 3rem; border-top: 1px solid var(--cream-faint); background: var(--navy-deep); }
    .footer .wrap { max-width: 72rem; padding-top: 2rem; padding-bottom: 2.5rem; }
    .footer__links { display: flex; flex-wrap: wrap; gap: .9rem 1.5rem; font-size: .9rem; margin: 0 0 1rem; }
    .footer__tag { color: var(--cream); margin: .5rem 0; }
    .footer__legal { color: var(--cream-faint); font-size: .74rem; line-height: 1.5; max-width: 60rem; }

    @media (prefers-reduced-motion: reduce) {
      .lane-card, .more-card { transition: none; }
    }
  </style>`;
}
