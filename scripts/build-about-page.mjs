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
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SITE, NO_SPORT, esc, escAttr, masthead, footer, documentShell, ROBOTS_INDEXABLE,
  ROBOTS_NOINDEX_FOLLOW, cspMeta, scriptHash, MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH,
  ORG_REF, ORG_NODE, AUTHOR_NAME, AUTHOR_PERSONAL_URL,
} from "./shared/page-shell.mjs";
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
    .about .updated { color: var(--ink-muted); font-size: .9rem; }
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
const dateModified = rows.length ? correctionDay(rows[0].at) : null;

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
   /about/#joseph-bankole. dateModified is the newest corrections log row. */
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
      ...(dateModified ? { dateModified } : {}),
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
     updated" date moved to 19 October 2026. Nothing else in the policy changed.
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
      what it publishes. It files daily on the transfer market and international football, and regularly on the league season, in plain English, with original illustration in place of photography.
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
        paywall and no in-app purchases. Its Buy Here buttons open the poster shop on Etsy.</p>
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

        <h3>Two sources before we publish</h3>
        <p>Nothing goes up as fact on a single source, with one standing exception: on the NFL and Formula 1 desks, the league's own official record is enough on its own, and it is named on the page. Everywhere else, a claim, a fee, a date or a scoreline is checked against at least two independent outlets before we treat it as settled. Two write-ups of the same original scoop are not two sources; we want outlets that did the reporting separately.</p>

        <h3>Breaking news: the REPORTED tier</h3>
        <p>Transfer news moves faster than confirmation, and the best of it often breaks through one reporter. When a named journalist with a strong record breaks a story alone, we may run it marked REPORTED, with the reporter and outlet named every time.</p>
        <p>REPORTED means one credible source and nothing more. It does not turn into confirmed because other sites have copied it. It hardens only when the club confirms, or a genuinely separate outlet reports the same thing.</p>

        <h3>CONFIRMED, REPORTED and RUMOUR say what they mean</h3>
        <p>Every desk entry carries a label that says how firm it is. CONFIRMED means two independent outlets, or the official body for NFL and Formula 1 results. REPORTED means one named reporter, named on the page. RUMOUR, used on the transfer desk only, means a link and not a move, however loudly it is being talked about. We do not blur the three to make a story sound bigger than it is. When we are not sure, the label says so.</p>

        <h3 id="how-made">How the daily desks are made</h3>
        <p>The daily desk entries and the question pages are drafted with automated writing tools, language models among them, working from the sources each entry names. Every draft goes through the same checks before it can publish: a named source for each fact, figures re-read against those sources at the moment of publishing, and a dated stamp. A draft that fails them does not run. No person reads a desk entry before it goes up, so those pages carry The ARCHV Desk as their byline rather than a name. Joseph Bankole sets these rules and answers for what the desks publish, and a piece he wrote himself carries his name.</p>
      </section>

      <section class="about__section">
        <h2 id="standards">Editorial standards</h2>

        <h3>The artwork is our own</h3>
        <p>Every image on The ARCHV is original illustration, drawn in our own house style. We use no club crests, no kit designs, no federation or competition marks, and no photographs. The faces are stylised drawings published as editorial commentary, not likenesses passed off as photos.</p>

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
        <p>The only money The ARCHV takes comes from the posters it sells through its Etsy shop and
        from paid subscriptions to the Dispatch newsletter, which is paused. No club, league or
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
        <p class="updated">Last updated 19 October 2026</p>

        <p>The ARCHV is an independent football publication. We publish an iOS app and this
        website. There are no ads on either, there are no accounts, and we do not track you
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
          stops the push.</li>
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
        us. Nothing is sold, shared for advertising, or used to build a profile of you.</p>

        <h3>The website</h3>
        <p>This site uses the same PostHog analytics, and it honours your
        browser's Do Not Track setting. This site serves its own fonts, so your browser
        does not request them from anyone else. Partnership enquiries come by email to
        <a href="mailto:partnerships@josephbankole.ca">partnerships@josephbankole.ca</a>, and the
        site has no contact form.</p>
        <p>Android visitors to the <a href="/app/">app page</a> see a waitlist. Joining it
        stores your email address, your browser's user agent (the line of text that names
        your browser and operating system), and the page you signed up on, in the same
        Supabase database. We use the address to tell you when the Android app is
        ready.</p>

        <h3>Deleting your data</h3>
        <p>Deleting the app removes everything stored on the device, but not what has
        already reached our database, such as a support conversation or a push token. If you
        have written to support and want that conversation and any details in it removed,
        ask us and we will delete it. To ask about deleting a push token, a waitlist email,
        or anything else on this page, email
        <a href="mailto:partnerships@josephbankole.ca">partnerships@josephbankole.ca</a>.</p>

        <h3>Changes</h3>
        <p>If this policy changes, the date at the top changes with it. We will not quietly
        add tracking; no ads and no cross-site tracking is a product promise, not a
        settings default.</p>

        <h3>Contact</h3>
        <p>Email <a href="mailto:partnerships@josephbankole.ca">partnerships@josephbankole.ca</a> or
        message <a href="https://instagram.com/thearchvfc">@thearchvfc</a> on Instagram.
        For app help, see <a href="/support/">support</a>.</p>
      </section>

      <section class="about__section">
        <h2 id="contact">Getting in touch</h2>
        <p>Write to <a href="mailto:partnerships@josephbankole.ca">partnerships@josephbankole.ca</a>
        or message <a href="https://instagram.com/thearchvfc">@thearchvfc</a> on Instagram.
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
