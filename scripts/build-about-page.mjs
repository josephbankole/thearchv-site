/* scripts/build-about-page.mjs — emits the one About page, dist/about/index.html, and the four
   redirect stubs that replace the pages it absorbed.

   WHY (founder, 2026-10-19): "fewer sections, merge how we verify, standards, corrections,
   privacy, contact and Joseph Bankole all to the About section". One About page holds all of
   them as sections, and each old URL redirects to its section:

     /standards/              -> /about/#how-we-verify   (carries #how-made)
     /corrections/            -> /about/#corrections     (carries #report, #log)
     /privacy/                -> /about/#privacy         (the App Store policy URL and the app's
                                                          Settings link; slashless /privacy is
                                                          301ed to /privacy/ by GitHub Pages)
     /authors/joseph-bankole/ -> /about/#joseph-bankole  (carries #recent-work, #long-reads,
                                                          #explainers)

   It replaces three hand-built public/ pages (about, corrections, privacy) and three generators
   (build-standards-page.mjs, build-author-page.mjs, build-corrections-log.mjs). Copy moved word
   for word; the corrections log and the author lists come from scripts/shared/corrections-log.mjs
   and scripts/shared/author-profile.mjs. Every old fragment id (who, funding, contact, how-made,
   report, log, recent-work, long-reads, explainers) is kept, so a deep link still lands.

   Same self-contained page family as the lane and article pages (scripts/shared/page-shell.mjs):
   documentShell, masthead(NO_SPORT), footer(), pageStyles(). The page-local CSS the old pages
   carried (.log, .example, .cases, .promise) is ported through documentShell's extraHead, not
   pageStyles(), so no other page carries it. The page has no inline script of its own: its CSP
   is the shared masthead + PostHog pair.

   Runs after vite build (it writes into dist/, which vite empties) and before build-search.mjs
   and verify-csp-pages.mjs (see package.json "build"). The /about/ sitemap row is in
   build-content.mjs's EXTRA_URLS; the stubs are noindex and in no sitemap. */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SITE, NO_SPORT, esc, escAttr, longDate, masthead, footer, documentShell, ROBOTS_INDEXABLE,
  ROBOTS_NOINDEX_FOLLOW, cspMeta, scriptHash, MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH,
  ORG_REF, ORG_NODE, AUTHOR_NAME, AUTHOR_PERSONAL_URL,
} from "./shared/page-shell.mjs";
import { THIRD_PARTY_LOGOS } from "./shared/logos.mjs";
import { correctionsRows, correctionItem, correctionDay, reportCorrections } from "./shared/corrections-log.mjs";
import {
  BIO, AUTHOR_ROLE, PERSON_NODE, portrait, deskWork, recentCard, linkList,
} from "./shared/author-profile.mjs";

const TAG = "[build-about-page]";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.CONTENT_OUT || join(ROOT, "dist");
const PATH = "/about/";
const URL = `${SITE}${PATH}`;

const TITLE = "About The ARCHV";
// Both carried over from the old hand-built /about/ (its meta description and its og:description).
const META_DESCRIPTION =
  "The ARCHV is a verification-first illustrated sports publication: a daily archive of football, NFL, F1, tennis, golf and basketball, written plainly and drawn in its own house style. Founded by Joseph Bankole.";
const SOCIAL_DESCRIPTION =
  "A verification-first illustrated sports publication. A daily archive of football, NFL, F1, tennis, golf and basketball, written plainly and drawn in its own house style.";

// The newest correction log rows show; any older ones sit inside one native <details> (never a
// button plus a zero-height panel: see the long-reads rule in CLAUDE.md).
const LOG_VISIBLE = 10;

// The privacy policy's "Last updated" day. Change the policy, change this (the policy promises
// the date moves with it). It renders the visible line and feeds the AboutPage dateModified.
const PRIVACY_UPDATED = "2026-11-21";

const PAGE_CSP = cspMeta({ scripts: [MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH], posthog: true });

/* ---------- page-local styles ----------
   Ported from the hand-built about and corrections pages. Their navy-alias names are written
   out as the real tokens they resolved to on those pages: --gold was --accent-ink and
   --cream-dim was --ink-muted's #4C5176 (not pageStyles' --cream-dim, which is --ink-soft), so
   the log reads exactly as it did. The rgba tints are the ink at low alpha, as before; no new hue.
   The sport tab row is sticky (about 3.3rem), so every anchored section gets a scroll margin. */
const ABOUT_STYLES = `<style>
    .about [id] { scroll-margin-top: 4rem; }
    .about__section { margin-top: 2.5rem; padding-top: .4rem; border-top: 1px solid var(--rule); }
    .about .about__section > h2 { margin-top: 1.2rem; }
    .about h3 { color: var(--ink); font-family: "Fraunces", Georgia, serif; font-weight: 500; font-size: 1.15rem; line-height: 1.3; margin: 1.6rem 0 .5rem; }
    .about .updated, .about .disclaimer { color: var(--ink-muted); font-size: .9rem; }
    /* In-prose links carry an underline, so a link is not told apart by colour alone (the old
       about, corrections and privacy pages kept the browser underline; mirrors .article__body a).
       The breadcrumb, "On this page" and the author's link lists stay plain, as across the family. */
    .about__section p a, .log a { text-decoration: underline; text-underline-offset: 3px; }
    /* "On this page": plain wrapping links, NOT a horizontal scroller (trap 3). */
    .onpage { margin: 0 0 .5rem; }
    .onpage__title { margin: 0 0 .1rem; font-family: var(--font-mono); font-size: .8rem; font-weight: 500; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-muted); }
    .onpage__list { display: flex; flex-wrap: wrap; gap: 0 1.25rem; list-style: none; margin: 0; padding: 0; }
    .onpage__list a { display: inline-flex; align-items: center; min-height: 44px; }
    .about__list { margin: 0 0 1rem 1.25rem; padding: 0; }
    .about__list li { margin: 0 0 .5rem; }
    .promise, .cases { margin: .75rem 0 1rem; padding-left: 18px; list-style: none; }
    .promise li, .cases li { position: relative; margin-bottom: 8px; }
    .promise li::before, .cases li::before { content: ""; position: absolute; left: -18px; top: .72em; width: 6px; height: 1px; background: var(--accent-ink); }
    .about .example { margin: 4px 0 18px; padding: 14px 16px; border-left: 2px solid var(--accent-ink); background: rgba(30, 34, 61, .08); border-radius: 0 8px 8px 0; font-size: .95rem; color: var(--ink-muted); }
    .about .example strong { color: var(--ink); font-weight: 600; }
    .log { margin: 14px 0 0; padding: 0; list-style: none; }
    .log li { margin: 0 0 18px; padding: 14px 16px; border-left: 2px solid var(--accent-ink); background: rgba(30, 34, 61, .04); border-radius: 0 8px 8px 0; font-size: .95rem; }
    .about .log p { margin: 0 0 8px; }
    .about .log p:last-child { margin-bottom: 0; }
    .log .meta { font-size: .82rem; letter-spacing: .04em; color: var(--ink-muted); }
    .log .was { color: var(--ink-muted); }
    .log strong { color: var(--ink); font-weight: 600; }
    .log .src { font-size: .85rem; color: var(--ink-muted); }
    .log-older { margin: 0 0 1rem; }
    .log-older > summary { cursor: pointer; padding: .6rem 0; color: var(--accent-ink); font-weight: 600; }
    .log-older > summary:focus-visible { outline: 2px solid var(--accent-ink); outline-offset: 3px; }
    .about .author { padding: 0; }
    .about .author__head { margin-top: 1.4rem; }
    .about .author__headtext h2 { margin: 0 0 .35rem; }
    .about .related h3 { color: var(--ink); font-family: var(--display); font-weight: 400; text-transform: uppercase; letter-spacing: .03em; font-size: 1.25rem; line-height: 1.2; margin: 0 0 .6rem; padding-top: 1.2rem; border-top: 1px solid var(--rule-soft); }
  </style>`;

/* ---------- data ---------- */
const corrections = await correctionsRows();
const { rows } = corrections;
const { recent, united, explainers } = await deskWork();
// The later of the newest log row and the privacy policy's "Last updated" day (ISO dates compare
// as strings), so the structured data never says the page changed before a date it shows.
const newestLogDay = rows.length ? correctionDay(rows[0].at) : "";
const dateModified = newestLogDay > PRIVACY_UPDATED ? newestLogDay : PRIVACY_UPDATED;

/* ---------- the corrections log ---------- */
const visibleRows = rows.slice(0, LOG_VISIBLE);
const olderRows = rows.slice(LOG_VISIBLE);
const logHtml = [
  `<ul class="log">\n${visibleRows.map((r) => correctionItem(r, "          ")).join("\n")}\n        </ul>`,
  olderRows.length
    ? `<details class="log-older">
          <summary>Earlier entries in the log (${olderRows.length})</summary>
          <ul class="log">
${olderRows.map((r) => correctionItem(r, "            ")).join("\n")}
          </ul>
        </details>`
    : "",
].filter(Boolean).join("\n        ");

/* ---------- portrait credits (audit gap4-2, 2026-11-15) ----------
   Every portrait made from a Wikimedia Commons photo credits its photographer and licence, read
   from identity.licence in scripts/data/heads-hd.json (check-portrait-provenance.mjs makes sure
   each one is recorded). The name is the registry's, from illustrated.json. */
const readData = (f) => JSON.parse(readFileSync(join(ROOT, "scripts", "data", f), "utf8"));
const nameByStem = new Map(
  readData("illustrated.json").players.map((p) => [String(p.hd).split("/").pop().replace(/\.webp$/i, ""), p.name])
);
const credits = readData("heads-hd.json").entries
  .filter((e) => e.identity?.method === "reference-render" && e.identity.licence?.source)
  .map((e) => ({ player: nameByStem.get(e.out), ...e.identity.licence }))
  .filter((c) => c.player)
  .sort((a, b) => a.player.localeCompare(b.player, "en-GB"));
const creditItem = (c) => {
  const label = esc(c.name === "Public domain" ? "public domain" : c.name);
  const licence = c.url ? `<a href="${escAttr(c.url)}" rel="license noopener">${label}</a>` : label;
  return `<li>${esc(c.player)}: photo by ${esc(c.author)}, ${licence}, <a href="${escAttr(c.source)}">source on Wikimedia Commons</a></li>`;
};
/* ---------- photo credits (founder ruling, 21 Nov 2026) ----------
   Every Commons photograph the site shows, read from the kind "photo" rows of illustrated.json
   (check-portrait-provenance.mjs makes sure each records its licence, author and file page). The
   64px card circles are too small for a credit of their own, so this list is their credit, and
   the footer's legal line links here. A CC BY-SA photo is cropped, and the crop is an adaptation
   shared under the same licence, which the list says. */
const photoRows = readData("illustrated.json").players
  .filter((p) => p.kind === "photo" && p.photo && p.licence)
  .sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
const photoItem = (p) => {
  const l = p.licence;
  const licence = l.url ? `<a href="${escAttr(l.url)}" rel="license noopener">${esc(l.name)}</a>` : esc(l.name);
  const sa = p.photo.shareAlike ? "; cropped, and the crop is shared under the same licence" : "; cropped";
  return `<li>${esc(p.name)}: photograph by ${esc(l.author)}, ${licence}, <a href="${escAttr(l.source)}">file on Wikimedia Commons</a>${sa}</li>`;
};
const photoCreditsHtml = photoRows.length
  ? `<h3 id="photo-credits">Photo credits</h3>
        <p>Where a free-licence photograph of a player, coach or driver is published on Wikimedia Commons and is recent enough to show them as they are now, we use it, with credit. Where there is none, the page keeps our illustration. Each photograph is cropped to head and shoulders and otherwise unaltered. Photographs never appear on posters, in the shop or on the cards a page shares to other sites. The photographer, licence and file of each one are listed here.</p>
        <details class="log-older credits" open>
          <summary>Photographers and licences (${photoRows.length})</summary>
          <ul>
${photoRows.map((p) => `            ${photoItem(p)}`).join("\n")}
          </ul>
        </details>`
  : "";

/* ---------- crest credits (D-2026-11-21b, 25 Nov 2026) ----------
   Every club crest the site shows beside a team name, from scripts/data/crests.json: Wikimedia
   Commons files, each with its author and licence. Off with the logo switch. */
const crestRows = THIRD_PARTY_LOGOS
  ? readData("crests.json").crests.slice().sort((a, b) => a.club.localeCompare(b.club, "en-GB"))
  : [];
const crestItem = (c) => {
  const licence = c.licenceUrl ? `<a href="${escAttr(c.licenceUrl)}" rel="license noopener">${esc(c.licenceName)}</a>` : esc(c.licenceName);
  return `<li>${esc(c.club)}: ${licence}, ${esc(c.author)}, <a href="${escAttr(c.filePage)}">file on Wikimedia Commons</a></li>`;
};
const crestCreditsHtml = crestRows.length
  ? `<h3 id="crest-credits">Club crests</h3>
        <p>Club crests are shown small beside a team's name in our tables and scores, for identification only. Each is a file from Wikimedia Commons, used unaltered; the crests are trade marks of their clubs, and The ARCHV is not affiliated with or endorsed by any of them. They never appear on posters, in the shop or on the cards a page shares to other sites.</p>
        <details class="log-older credits">
          <summary>Crests and licences (${crestRows.length})</summary>
          <ul>
${crestRows.map((c) => `            ${crestItem(c)}`).join("\n")}
          </ul>
        </details>`
  : "";

const creditsHtml = (credits.length
  ? `<h3 id="portrait-credits">Portrait credits</h3>
        <p>Some of our portraits are made from a reference photograph published on Wikimedia Commons under an open licence. The photographer and the licence of each one are listed here.</p>
        <details class="log-older credits">
          <summary>Photographers and licences (${credits.length})</summary>
          <ul>
${credits.map((c) => `            ${creditItem(c)}`).join("\n")}
          </ul>
        </details>`
  : "") + (photoCreditsHtml ? `\n\n        ${photoCreditsHtml}` : "") + (crestCreditsHtml ? `\n\n        ${crestCreditsHtml}` : "");

/* ---------- Joseph Bankole: the derived lists ---------- */
const recentBlock = recent.length
  ? `<section class="related" aria-labelledby="recent-work">
          <h3 id="recent-work">Latest from The ARCHV Desk</h3>
          <ul class="lane-list">
            ${recent.map(recentCard).join("\n            ")}
          </ul>
          <a class="related__all" href="/desk/transfer/">Every transfer entry</a>
        </section>`
  : "";
const unitedBlock = united.length
  ? `<section class="related" aria-labelledby="long-reads">
          <h3 id="long-reads">Long reads</h3>
          <ul>
            ${linkList(united, "            ")}
          </ul>
        </section>`
  : "";
const explainerBlock = explainers.length
  ? `<section class="related" aria-labelledby="explainers">
          <h3 id="explainers">Explainers</h3>
          <ul>
            ${linkList(explainers, "            ")}
          </ul>
        </section>`
  : "";

/* ---------- JSON-LD ----------
   AboutPage + the Organization + the full Person + breadcrumbs. The Person keeps the legacy
   /authors/joseph-bankole/#person @id (PERSON_ID in page-shell.mjs) and its url is now
   /about/#joseph-bankole. dateModified is the later of the newest corrections log row and
   PRIVACY_UPDATED. */
const schema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "AboutPage",
      "@id": `${URL}#webpage`,
      url: URL,
      name: TITLE,
      description: META_DESCRIPTION,
      inLanguage: "en-GB",
      isPartOf: { "@type": "WebSite", name: "The ARCHV", url: `${SITE}/` },
      about: ORG_REF,
      mainEntity: ORG_REF,
      publisher: ORG_REF,
      dateModified,
    },
    ORG_NODE,
    PERSON_NODE,
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "The ARCHV", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "About", item: URL },
      ],
    },
  ],
};

/* ---------- the page ----------
   Notes on the copy, kept here rather than as HTML comments in the shipped page:
   - "CONFIRMED, REPORTED and RUMOUR" (search plan G5 and 3.3, 2026-10-11): the chip on every desk
     card is derived from these three tiers by chipLabel() in src/lib/entryGates.ts. VERIFIED was
     printed on every entry, rumours included, so it went.
   - #how-made (search plan 3.2, Decision 1, approved 2026-09-23) names no model and no vendor.
     The dated pages link to it from their byline ("How this desk works", HOW_MADE_PATH).
   - Privacy, "The website": the sentence after the fonts line used to say the partnerships form
     was delivered by Web3Forms. The form and Web3Forms left the site on 2026-10-13, so on
     2026-10-19 it was replaced with how partnership enquiries actually arrive, and the "Last
     updated" date moved to 19 October 2026. Nothing else in the policy changed. Its closing
     line (not affiliated with, endorsed by, or licensed by FIFA, any club, federation,
     competition, or player) stays as the section's last line: footer() says something narrower
     and never mentions players, and the #standards copy names no player either. #contact keeps
     the old About's wording; the Instagram handle is in the policy's own Contact line above it.
   - Privacy, waitlist paragraph (audit be-support-6, 2026-11-15): the IP hash sentence matches
     waitlist_rate_hits in supabase/migrations/20261115180000, pruned on each claim and by the
     hourly job in 20261115210000. The waitlist itself has no purge job, so the page gives no
     deletion date for it. "How long we keep it" lists only periods a scheduled job enforces
     (retention_purge in 20261115200200 and the two prune jobs); apply those migrations before
     this page reaches main (scripts/deploy-preconditions.txt).
   - Sections the old pages repeated were kept once: the old About's "How the work is checked",
     "When we get it wrong" and "Who we answer to" summaries, the standards page's "Corrections
     are added, not hidden" and the corrections page's "How we check things first time" each
     restated a section that now sits on this same page. */
const html = `${documentShell({
  title: TITLE,
  // Not clampDescription'd: the old hand-built /about/ shipped this description at full length.
  metaDescription: META_DESCRIPTION,
  description: SOCIAL_DESCRIPTION,
  socialTitle: TITLE,
  robots: ROBOTS_INDEXABLE,
  canonical: URL,
  ogUrl: URL,
  ogType: "website",
  ogImage: `${SITE}/og.jpg`,
  csp: PAGE_CSP,
  jsonLd: schema,
  extraHead: [ABOUT_STYLES],
})}
<body>
  ${masthead(NO_SPORT)}
  <main class="wrap" id="main">
    <article class="standards about">
      <p class="breadcrumb"><a href="/">The ARCHV</a> / About</p>
      <p class="lane__eyebrow">About</p>
      <h1>About The ARCHV</h1>

      <p class="lead">The ARCHV is a football publication that checks what it prints and draws
      what it publishes. It files daily on the transfer market and international football, and regularly on the league season, in plain English. Faces are our own illustration, or a credited free-licence photograph where a current one exists.
      Entries stay up, dated, in the order they were filed, which is what makes the site an
      archive.</p>

      <nav class="onpage" aria-labelledby="onpage-title">
        <p class="onpage__title" id="onpage-title">On this page</p>
        <ul class="onpage__list">
          <li><a href="#who">Who makes it</a></li>
          <li><a href="#how-we-verify">How we verify</a></li>
          <li><a href="#standards">Editorial standards</a></li>
          <li><a href="#corrections">Corrections</a></li>
          <li><a href="#privacy">Privacy policy</a></li>
          <li><a href="#contact">Getting in touch</a></li>
          <li><a href="#joseph-bankole">${esc(AUTHOR_NAME)}</a></li>
        </ul>
      </nav>

      <section class="about__section">
        <h2>What we publish</h2>
        <p>Daily desk entries on the transfer market, international football and the league season,
        each short and written to be read once, without jargon or padding. The site also keeps
        question pages on the NFL, Formula 1, tennis, golf and basketball, the long reads, a glossary,
        and an archive of 18 finals, ten of them World Cup finals from Mexico 1970 to MetLife 2026.</p>
        <p>Everything reads free on the web. The same stories reach the iPhone app, which has no
        paywall and no in-app purchases. Its Buy Here buttons open our shop at shop.thearchv.ca, or our Etsy shop on older versions of the app.</p>
      </section>

      <section class="about__section">
        <h2 id="who">Who makes it</h2>
        <p>Joseph Bankole founded The ARCHV and sets its rules. The daily desk entries and question
        pages are drafted with automated writing tools and published under the checks set out in
        <a href="#how-made">how the daily desks are made</a>, which is why they carry The
        ARCHV Desk as their byline. Joseph is the person answerable for everything the site
        publishes. His <a href="#joseph-bankole">profile</a> below says more, and his own site is
        <a href="https://josephbankole.ca">josephbankole.ca</a>.</p>
      </section>

      <section class="about__section">
        <h2 id="how-we-verify">How we verify</h2>
        <p>The ARCHV is a football-history publication. We treat the game's present the way we treat its past, by checking it before we publish. This page sets out how we decide what to run, and how confident we are when we run it.</p>

        <h3>A trusted, named source before we publish</h3>
        <p>Nothing goes up as fact without a trusted source, and the source is named on the page. Trusted means an established outlet or reporter, or the body itself on the record: a club, a league, UEFA or FIFA. On the NFL and Formula 1 desks, the league's own official record is that source. One trusted source is enough to publish a claim, a fee, a date or a scoreline. It is not always enough to call it confirmed, and the labels below say how firm each entry is. When two trusted sources disagree, we drop the number or name both.</p>

        <h3>Breaking news: the REPORTED tier</h3>
        <p>Transfer news moves faster than confirmation, and the best of it often breaks through one reporter. When a named journalist with a strong record breaks a story alone, we may run it marked REPORTED, with the reporter and outlet named every time.</p>
        <p>REPORTED means one credible source and nothing more. It does not turn into confirmed because other sites have copied it. It hardens only when the club confirms, or a genuinely separate outlet reports the same thing.</p>

        <h3>CONFIRMED, REPORTED and RUMOUR say what they mean</h3>
        <p>Every desk entry carries a label that says how firm it is. CONFIRMED means the club or the body itself has said it on the record, or a second trusted outlet has reported it on its own. For NFL and Formula 1 results, the league's own official record is enough. REPORTED means one named reporter, named on the page. RUMOUR, used on the transfer desk only, means a link and not a move, however loudly it is being talked about. We do not blur the three to make a story sound bigger than it is. When we are not sure, the label says so.</p>

        <h3 id="how-made">How the daily desks are made</h3>
        <p>The daily desk entries and the question pages are drafted with automated writing tools, language models among them, working from the sources each entry names. Every draft goes through the same checks before it can publish: a named source for each fact, figures re-read against those sources at the moment of publishing, and a dated stamp. A draft that fails them does not run. No person reads a desk entry before it goes up, so those pages carry The ARCHV Desk as their byline rather than a name. Joseph Bankole sets these rules and answers for what the desks publish, and a piece he wrote himself carries his name.</p>
      </section>

      <section class="about__section">
        <h2 id="standards">Editorial standards</h2>

        <h3>The artwork, and the photographs we credit</h3>
        <p>Club and match images on The ARCHV are original illustration, drawn in our own house style. A player, coach or driver is shown in a free-licence photograph from Wikimedia Commons where a recent one exists, credited to its photographer with its licence, and in our own stylised drawing where it does not. The drawings are editorial commentary, never passed off as photos. We use no club crests, no kit designs and no agency photographs, and no competition marks apart from the Premier League logo, shown under its owner's terms beside the league's name. The video row on the front page is a further exception: its stills come from our own YouTube channel and show the people who present it.</p>

        ${creditsHtml}

        <h3>We answer to nobody in the game</h3>
        <p>The ARCHV is independent. We are not affiliated with FIFA, or with any club, federation, league or competition. No governing body approves our copy and none pays for it. That independence is the point of the whole thing: it is what lets us call a rumour a rumour, and correct ourselves in public when we get it wrong.</p>

        <h3>What you are promised</h3>
        <ul class="promise">
          <li>No betting, and no betting ads.</li>
          <li>No account, on the site or in the app.</li>
          <li>No paywall on the web.</li>
          <li>One notification a day in the app, and no more than that.</li>
        </ul>

        <h3 id="funding">Who pays for it</h3>
        <p>The only money The ARCHV takes comes from what it sells through its shop at
        shop.thearchv.ca and its Etsy shop, and from paid subscriptions to the Dispatch newsletter,
        which is paused. No club, league or
        betting company pays for anything here.</p>
      </section>

      <section class="about__section">
        <h2 id="corrections">Corrections</h2>
        <p>The archive is a record, so it is not quietly rewritten. When a fact
        changes, or when we get one wrong, the change is added to the piece and dated. The original
        wording stays where it was.</p>

        <h3>Corrections are appended, not swapped in</h3>
        <p>A published entry is never silently edited. A change arrives as a dated addition at the
        foot of the piece, or as a visible change of status on a transfer. The note reads like
        this:</p>
        <p class="example"><strong>Update, 4 July:</strong> the club confirmed the move the day
        after this entry was filed.</p>
        <p>Rewriting a headline, the line beneath it or a judgment after publication, without
        saying so, is not allowed. You can read what we first said, and see what changed, on the
        same page.</p>

        <h3>Backfill is a different thing</h3>
        <p>Backfill adds entries for days that have none. It is written from that day's sources and
        describes what was known then, with no hindsight framing. A correction changes something
        already published, and it always shows itself.</p>
        <p>New lanes launch under their real publish date. Nothing is back-dated to make the archive
        look older than it is.</p>

        <h3>What gets corrected</h3>
        <ul class="cases">
          <li>A wrong score, date, name spelling, fee or attendance figure.</li>
          <li>A story that resolved the other way after we published it.</li>
          <li>A claim attributed to the wrong reporter or the wrong outlet.</li>
          <li>A name left ambiguous because two footballers share it and the sentence never settled
          which one we meant.</li>
        </ul>

        <h3 id="report">How to report an error</h3>
        <p>Email <a href="mailto:partnerships@josephbankole.ca">partnerships@josephbankole.ca</a>.
        Say which page you are reading and which line looks wrong, and what you believe the right
        version is. A link to a source makes it quicker to check.</p>
        <p>Anything that checks out is corrected on the page itself, with the date the note went
        up.</p>

        <h3 id="log">The corrections log</h3>
        <p>Every correction, update and revision note on the site is listed here as well as on its
        page, newest first. The list is rebuilt from the pages each time the site is published. A
        correction quotes what the page said, then what is right and where we checked it. An update
        or a revision adds to a page without saying it was wrong, so its note appears as it stands.</p>
        ${logHtml}
      </section>

      <section class="about__section">
        <h2 id="privacy">Privacy policy</h2>
        <p class="updated">Last updated ${esc(longDate(PRIVACY_UPDATED))}</p>

        <p>The ARCHV is an independent football publication. We publish an iOS app and this
        website. We run no ads on either, there are no accounts, and we do not track you
        across other companies' apps or websites. This page says exactly what we do collect
        and which outside companies handle it for us, in plain words.</p>

        <h3>The app</h3>
        <p>The app has no login and no account. What it handles:</p>
        <ul class="about__list">
          <li><strong>An anonymous device id.</strong> The app generates a random identifier
          on your phone. It is not your hardware id and it is not linked to your name. It
          exists so a support message or a push opt-in can be tied to your install and
          nothing else.</li>
          <li><strong>Daily push, if you turn it on.</strong> Opting in sends your phone's
          push token to our server with the anonymous id, the app version, and your phone's
          time zone setting (a name such as Europe/London). The app may also send the sport
          you picked on Home, and the notification then carries that sport's lead story. We
          store the token, the id, the app version, the sport if the app sent one, whether
          push is on, when the app last registered, and the day we last sent that phone a
          notification. We use them to send one notification a day through Apple's push
          service. Our server does not store the time zone at present. Turning the toggle off
          stops the push, and the token is deleted 30 days later.</li>
          <li><strong>Support messages.</strong> If you write to us through Settings, we
          store your message, the category you picked, the app version, and the anonymous id,
          along with anything you add to the conversation later. An email address is
          optional; if you include one, we use it only to reply to you.</li>
          <li><strong>The first reply is automated.</strong> When a new support message
          arrives, its text, category, and app version go to Anthropic, whose Claude model
          writes a first reply from our help notes, or a short holding reply if a person
          needs to look at it. That step does not send your email address or the anonymous
          id.</li>
          <li><strong>Messages that need the founder.</strong> If the automated step passes
          a message up to the founder, an email goes to his inbox through Zoho Mail, our
          email provider. It contains your message, its category, the app version, the
          automated reply, and a one-line note. Your email address is not in it.</li>
          <li><strong>Usage analytics.</strong> We use PostHog to count things like opens
          and reads so we know what is worth writing. PostHog is a separate company that
          handles this data for us. The app sends events to PostHog under a random id that
          PostHog creates for your install, which is not the device id above. When you open,
          save, or rate a story (More like this or Fewer like this), or use the Continue
          reading card, the event includes the story's headline. The open, save, and rating
          events also include its section. Every event carries details that PostHog's own
          software adds, including the phone model, iOS version, app version, language
          setting, and time zone. PostHog uses the IP address each event comes from to
          estimate a rough location, such as the city or country, and then discards the
          address. We never use any of it to follow you anywhere else.</li>
          <li><strong>Saved stories, and the story you last left unfinished, stay on your
          phone.</strong> The app does not upload them. The analytics events above do
          record a story's headline when you open or save it.</li>
        </ul>
        <p>Support messages and push tokens are kept in a database that Supabase runs for
        us, on its servers in the United States (Oregon). Supabase logs every request to that
        server, from the app or from this site, with its IP address, the approximate location
        and network provider worked out from that address, and the device details the request
        carries. It keeps those logs for seven days and then deletes them. We use them only to
        keep the server running and to fix faults. PostHog stores the analytics on its servers
        in the United States. Nothing is sold, shared for advertising, or used to build a
        profile of you.</p>

        <h3>The website</h3>
        <p>This site uses the same PostHog analytics as the app. It records:</p>
        <ul class="about__list">
          <li><strong>Page views.</strong> An event when a page opens and another when you
          leave it, with the page address and the page that sent you.</li>
          <li><strong>On the front page.</strong> How far down you scroll (25, 50, 75 and 100
          per cent), which sections come into view, and clicks on links to the App Store, our
          shop, our Etsy shop, Instagram and our long reads. A long read click records the link's
          address and its text.</li>
          <li><strong>On story pages.</strong> A tap on the share, post to X or copy link
          buttons, with the story's address.</li>
          <li><strong>On the start and app pages.</strong> Taps on their buttons and links,
          such as the App Store badge, the story link and the follow button, with where the
          link goes. The start page also records when you scroll most of the way down it, and
          whether its card for today's story loaded.</li>
          <li><strong>On the games.</strong> On the quiz, the daily archive game and the player
          comparisons, an event when you play, finish or share one.</li>
          <li><strong>Browser details.</strong> Every event carries details that PostHog's own
          script adds, such as your browser, operating system, screen size, language and time
          zone. PostHog uses the IP address each event comes from to estimate a rough
          location, such as the city or country.</li>
          <li><strong>A random identifier.</strong> PostHog keeps a random id in your
          browser's local storage, not in a cookie, so a return visit is not counted as a new
          visitor. It is not linked to your name or email. Clearing this site's data in your
          browser erases it.</li>
        </ul>
        <p>Autocapture and session recording are switched off, so PostHog does not record
        every click, keystroke or form field. PostHog's surveys, heatmaps and error reports are
        switched off too. If your browser sends Global Privacy Control or Do Not Track, the
        PostHog script does not load at all, so nothing is stored in your browser and no events
        are sent for your visit. The scores on the front page and the scores page load live
        from the same Supabase server, so those requests appear in its logs. This site serves
        its own fonts, so your browser does not request them from anyone else. Partnership enquiries come by email to
        <a href="mailto:partnerships@josephbankole.ca">partnerships@josephbankole.ca</a>, and the
        site has no contact form.</p>
        <p><strong>YouTube videos.</strong> The front page shows videos from our YouTube
        channel. The thumbnails are our own copies, served from this site, so nothing is sent to
        YouTube until you press play. When you do, the video loads from YouTube in its
        privacy-enhanced mode (youtube-nocookie.com). From then on Google receives your IP
        address and details of your device and browser, and may store data in your browser,
        under <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google's
        privacy policy</a>. Google may process that data outside Canada. YouTube may show its own
        adverts in the player; we do not sell or choose them. A link that opens a video on
        youtube.com takes you to YouTube itself. This site uses YouTube API Services, so by
        playing a video here you agree to the
        <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube Terms of Service</a>.</p>
        <p>Android visitors to the <a href="/app/">app page</a> see a waitlist. Joining it
        stores your email address, your browser's user agent (the line of text that names
        your browser and operating system), and the page you signed up on, in the same
        Supabase database. We use the address only to tell you when the Android app is
        ready. We keep it until then, and there is no fixed date yet for deleting the list
        after that email goes out. To stop one source flooding the list, our server also keeps
        a one-way hash of the IP address you joined from, with a count of sign-ups from it in
        that hour. The raw IP address is not stored, and each count is deleted a day after the
        hour it covers.</p>

        <h3>How long we keep it</h3>
        <ul class="about__list">
          <li><strong>Support conversations.</strong> Once a conversation is marked resolved
          or closed, it is deleted 12 months after the last change or message on it, with every
          message in it and your email address if you gave one. A conversation that is still
          open is kept until it is closed and those 12 months pass, or until you delete it from
          the app.</li>
          <li><strong>Push tokens.</strong> A token you switch off is deleted 30 days later. A
          token Apple reports as no longer working, for example after the app is deleted, is
          removed by the daily notification run once Apple reports it. A token that is switched
          on and still working is kept while push stays on.</li>
          <li><strong>Reply checks.</strong> When the app checks for support replies or asks
          us to delete its data, our server notes the anonymous id and the time, to limit how
          often that can happen. Each note is deleted after two hours.</li>
          <li><strong>Waitlist emails.</strong> Kept until the Android app is ready, as above,
          with no fixed deletion date yet.</li>
          <li><strong>Copies outside the database.</strong> An email already sent to the
          founder about a support message stays in his inbox until he deletes it. Supabase also
          keeps backups of the database, and a deleted entry can stay in a backup until that
          backup expires.</li>
        </ul>

        <h3>Deleting your data</h3>
        <p>If your version of the app has a Delete my data button in Settings, it deletes,
        straight away, every support conversation sent from that install, with its messages
        and any email address in it, and that install's push sign-up from our database. The app then starts a new
        anonymous id and a new PostHog id, so later activity is not linked to the old ones. If
        daily push is on, the app signs up again under the new id and the notifications keep
        coming. Analytics events already sent to PostHog are not deleted by this button.</p>
        <p>Deleting the app removes everything stored on the device, but not what has
        already reached our database, such as a support conversation or a push token. If your
        app has the button, use it first if you want both gone. If it does not, or you no
        longer have the install, ask us and we will delete your support conversation. To ask
        about deleting a push token, a waitlist email, or anything else on this page, email
        <a href="mailto:partnerships@josephbankole.ca">partnerships@josephbankole.ca</a>.</p>

        <h3>Changes</h3>
        <p>If this policy changes, the date at the top changes with it. We will not quietly
        add tracking; no ads and no cross-site tracking is a product promise, not a
        settings default.</p>

        <h3>Contact</h3>
        <p>Joseph Bankole is responsible for protecting your personal information on this site
        and in the app.</p>
        <p>Email <a href="mailto:partnerships@josephbankole.ca">partnerships@josephbankole.ca</a> or
        message <a href="https://instagram.com/thearchvfc">@thearchvfc</a> on Instagram.
        For app help, see <a href="/support/">support</a>.</p>

        <p class="disclaimer">The ARCHV is not affiliated with, endorsed by, or licensed by
        FIFA, any club, federation, competition, or player.</p>
      </section>

      <section class="about__section">
        <h2 id="contact">Getting in touch</h2>
        <p>Write to <a href="mailto:partnerships@josephbankole.ca">partnerships@josephbankole.ca</a>.
        Press and partnership enquiries reach the same inbox as corrections. If the question is
        about the app, <a href="/support/">support</a> is the faster route.</p>
      </section>

      <section class="about__section author" id="joseph-bankole">
        <div class="author__head">
          <img class="author__portrait${portrait.real ? "" : " author__portrait--crest"}" src="${escAttr(portrait.src)}" alt="${escAttr(portrait.alt)}" width="120" height="120" loading="lazy" decoding="async" />
          <div class="author__headtext">
            <h2>${esc(AUTHOR_NAME)}</h2>
            <p class="author__role">${esc(AUTHOR_ROLE)}</p>
          </div>
        </div>
        <div class="author__bio">
          ${BIO.map((p) => `<p>${esc(p)}</p>`).join("\n          ")}
        </div>
        <p class="author__elsewhere">Elsewhere: <a href="${escAttr(AUTHOR_PERSONAL_URL)}" rel="me noopener" target="_blank">${esc(AUTHOR_PERSONAL_URL.replace("https://", ""))}</a> · <a href="#how-we-verify">How we verify</a> · <a href="#corrections">Corrections policy</a></p>
        ${recentBlock}
        ${unitedBlock}
        ${explainerBlock}
      </section>
    </article>
  </main>
  ${footer()}
</body>
</html>
`;

mkdirSync(join(OUT, "about"), { recursive: true });
writeFileSync(join(OUT, "about", "index.html"), html);
console.log(
  `${TAG} wrote ${PATH} (${rows.length} log row(s), ${Math.min(rows.length, LOG_VISIBLE)} shown, ${olderRows.length} in <details>; ` +
  `${recent.length} desk entr${recent.length === 1 ? "y" : "ies"}, ${united.length} long read(s), ${explainers.length} explainer(s); ` +
  `portrait: ${portrait.real ? "headshot" : "crest fallback, no headshot in repo"})`,
);
reportCorrections(TAG, corrections, PATH);

/* ---------- the redirect stubs ----------
   GitHub Pages cannot send a 301, so each old URL is a small page that hands the reader on.
   A plain meta refresh drops the incoming fragment, so one inline script, hashed into the page's
   own CSP, carries an allowed fragment across with location.replace (no stub left in the back
   history) and sends anything else to the section's default.

   The meta refresh sits inside <noscript>, AFTER the script, deliberately. Left bare, it races
   the script: WebKit schedules location.replace as a zero-delay navigation and a 0-second meta
   refresh parsed after it replaces that pending navigation, so /standards/#how-made would land
   on #how-we-verify. With scripting on, the parser treats <noscript> as text and only the script
   navigates; with scripting off, the refresh fires and lands on the default section. The visible
   link is the last resort. robots is noindex,follow and the canonical is /about/ (no fragment).

   The script never contains "<!--" or "</script": verify-csp-pages.mjs strips HTML comments
   before hashing, so either would break its check. */
const STUBS = [
  { dir: "standards", title: "How we verify · The ARCHV", fallback: "how-we-verify", keep: ["how-made"],
    line: "How we verify is now part of the About page." },
  { dir: "corrections", title: "Corrections · The ARCHV", fallback: "corrections", keep: ["report", "log"],
    line: "Corrections are now part of the About page." },
  // The App Store privacy policy URL and the iOS app's Settings link (AppConfig.privacyURL).
  { dir: "privacy", title: "Privacy policy · The ARCHV", fallback: "privacy", keep: [],
    line: "The privacy policy is now part of the About page." },
  { dir: "authors/joseph-bankole", title: `${AUTHOR_NAME} · The ARCHV`, fallback: "joseph-bankole", keep: ["recent-work", "long-reads", "explainers"],
    line: `${AUTHOR_NAME}'s profile is now part of the About page.` },
];

function stubScript({ keep, fallback }) {
  return `
    (function () {
      var keep = ${JSON.stringify(keep)};
      var h = location.hash.slice(1);
      location.replace(${JSON.stringify(PATH + "#")} + (keep.indexOf(h) > -1 ? h : ${JSON.stringify(fallback)}));
    })();
  `;
}

function stubPage(stub) {
  const body = stubScript(stub);
  if (body.includes("<!--") || body.includes("</script")) throw new Error(`${TAG} stub script for /${stub.dir}/ must not contain "<!--" or "</script"`);
  const target = `${PATH}#${stub.fallback}`;
  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(stub.title)}</title>
  <meta name="robots" content="${ROBOTS_NOINDEX_FOLLOW}" />
  <link rel="canonical" href="${escAttr(URL)}" />
  <meta name="theme-color" content="#F4F1EA" />
  ${cspMeta({ scripts: [scriptHash(body)] })}
  <script>${body}</script>
  <noscript><meta http-equiv="refresh" content="0; url=${escAttr(target)}" /></noscript>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <style>
    body { margin: 0; background: #F4F1EA; color: #1E223D; font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; display: flex; min-height: 100vh; align-items: center; justify-content: center; text-align: center; padding: 0 16px; }
    a { color: #B23109; }
  </style>
</head>
<body>
  <main>
    <p>${esc(stub.line)} <a href="${escAttr(target)}">Continue</a>.</p>
  </main>
</body>
</html>
`;
}

for (const stub of STUBS) {
  const dir = join(OUT, ...stub.dir.split("/"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), stubPage(stub));
}
console.log(`${TAG} wrote ${STUBS.length} redirect stubs: ${STUBS.map((s) => `/${s.dir}/ -> ${PATH}#${s.fallback}`).join(", ")}`);
