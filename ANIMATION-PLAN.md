# thearchv.ca full animation pass - work plan (QUEUED: execute only after the iOS
# app work and the josephbankole.ca pass are BOTH done, per founder 2026-07-04)

Analyst-ruled scope. Self-contained; any model can execute cold. Check
fifa.archv/SITE-AND-APP-TODO.md first to confirm the queue has cleared.

## Read first
CANONICAL-CONTEXT.md and EDITOR_STANDARDS.md in fifa.archv/ (brand law), src/main.ts
and src/anim/scroll.ts (existing GSAP motion system incl. reduced-motion handling and
the kin-w word-mask pattern shipped 2026-07-03), src/style.css, index.html.

## Brand and stack
Navy #0C2A3E / navy-deep #071C2B / cream #F2EAD3 / gold #C9A14A (sparing) / pitch
#2E6B3A. Fraunces + Inter Tight. Vite+TS+GSAP (bundled; STRICT CSP: script-src
'self' only, no external scripts ever). Deploy = commit on `preview`, then
`bash scripts/deploy-site.sh` (merges to main; engine data files win via --ours;
NEVER hand-edit src/data day files here). Traffic skews mobile from Instagram.

## Standing rulings that bind this pass
NO custom cursor, NO intro/loading sequence, NO sound layer, NO background video
hero. The finals-archive scroll set piece is a SEPARATE approved-but-queued project;
this pass must not absorb or block it. Reduced-motion: follow the existing pattern
(the motion module is dynamically imported and skipped entirely under
prefers-reduced-motion; keep new work inside that module).

## The moves (in build order)

### 1. Artwork marquee (strategy, not decoration)
Infinite horizontal marquee of OUR OWN artwork: the World Cup finals posters
(public/posters/*.webp) and/or illustrated heads (public/heads/*.webp, 240px).
Placement: a full-bleed band between the hero and the first content section, or
above the footer (judge against the live layout). CSS-only keyframes, duplicated
track aria-hidden, pause on hover, static single row under reduced motion. Each tile
links to the relevant section (#world-cup for posters). Rights: everything shown is
ARCHV-made; never a photo, crest or third-party mark. Track `marquee_tile_click`
via the existing PostHog wrapper.

### 2. Floating bottom CTA pill
Crest mark + the site's standing CTA order: FOLLOW (Instagram @thearchvfc) leads,
gold; behind it nothing else (one action, this brand does not stack CTAs in a pill).
Appears after the hero scrolls out, hides when the footer CTA row is visible,
safe-area aware. Track as the existing follow CTA events do, with location 'pill'.

### 3. Giant footer wordmark
"THE ARCHV" in Fraunces at ~14-16vw, cream at 6-8% opacity, above the footer CTA
row. Word-mask pull-up on view (reuse the kin-w pattern). Texture, not a link.

### 4. Manifesto scroll reveal
The manifesto/mission paragraph (the emotional copy) gets a WORD-level scroll-linked
opacity reveal (0.25 -> 1) via GSAP ScrollTrigger, scrub true, mapped across the
paragraph's viewport transit. Word-level only, aria-label carries the original text.
One paragraph on the whole site. Under reduced motion: fully visible, no effect.

### 5. Parallax seasoning
Subtle depth on 2-3 existing large images/cards (archive posters rail, partner
section art): y-drift max 30px, GSAP scrub, transform-only, disabled on touch AND
reduced motion. If mobile jank appears in testing, cut this move entirely.

## Hard floors
Mobile LCP <= current (measure before and after; the marquee lazy-loads and must not
enter the first viewport paint). `npm run build` clean. CSP untouched. All new JS
inside the dynamically imported motion module. Stage-2 conversion experiment
readability: do not add new gold elements near the footer Follow (the gold audit
ruling stands).

## Verification
Local vite preview at 375px + 1280px with screenshots; reduced-motion pass; JS-off
pass; grep built output for PostHog + CSP meta intact; deploy via deploy-site.sh and
curl-verify a new class on the live CSS; Lighthouse/PSI mobile LCP comparison noted
in the commit body. KPIs: follow CTR, Dispatch CTR, mobile bounce, LCP.

Commit style: plain one-liners ending
"Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>".
