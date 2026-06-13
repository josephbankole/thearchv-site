# Launch thearchv.ca — immersive single-page site

Replaces the placeholder page with the full **The ARCHV** experience: the Instagram
link-in-bio destination and the brand-deal credibility surface. Built to an awwwards-grade
brief on the locked ARCHV identity (Navy / Cream / Gold-capped / Pitch green), British-English
period-terminated copy, no em-dashes.

> "Football has a memory. This is the ARCHV."

## What's in it

**Stack** — Vite + vanilla TypeScript, GSAP + ScrollTrigger, three.js (adaptive WebGL hero),
self-hosted variable fonts. Ships as static files to GitHub Pages. Zero third-party scripts
except opt-in PostHog.

**Page (single immersive scroll)**
- **Hero** — static headline + Follow CTA (renders with zero JS; WebGL film-grain + gold-dust layers in behind, desktop only, degrades on mobile / reduced-motion).
- **Manifesto** — short neutral brand bridge.
- **01 · The Transfer Desk** — daily wrap-up rail. Scroll the days; each card is a sub-1-minute read with DONE / RUMOUR status labels.
- **02 · The World Cup** — daily wrap-up rail, same pattern, sub-1-minute reads.
- **The ARCHV banner** — animated brand plaque (parallax).
- **03 · The Archive** — 9 illustrated World Cup final posters (drag rail + lightbox) and **The Giant-Killers** long read (10-entry accordion).
- **Partnerships** — static contact form (Web3Forms, no backend).
- **Footer** — brand badge + full independence/likeness disclaimer.

**Brand assets** — the ARCHV badge (masthead + footer) and banner (animated band) are wired in.

**Analytics** — PostHog, privacy-first and **dormant until a key is set** (autocapture off,
recording off, respects DNT, no third-party cookies). Captures Follow clicks, scroll depth,
section + day-card views, and partnership submits. Verified: events POST to PostHog ingest `→ 200`.

## Performance
- Hero content never waits on JS; `three` and `posthog` are lazy chunks off the critical path.
- Posters optimized to 22–110 KB WebP with LQIP placeholders.

## Security + IP (see `SECURITY.md`, full go/no-go in `README.md`)
- 0 npm vulnerabilities, scoped CSP, no secrets, no inline handlers, all external links `noopener`.
- IP-scrubbed: no `fifa.archv` / `beehiiv` strings; no "FIFA"/"World Cup" in title/meta/OG/JSON-LD (editorial body only); no club crests / kit logos.
- Moscow '18 poster intentionally excluded (its cup reads as the WC trophy = registered design mark) → 9 posters.
- No player likenesses on the page (the Transfer Desk is typographic).

## Founder-owned before merge to `main` / go-live
- [ ] Web3Forms key (partnerships form) — dormant-but-valid until set.
- [ ] PostHog Project API key — analytics dormant until set.
- [ ] DNS for thearchv.ca + Pages source = GitHub Actions + Enforce HTTPS.
- [ ] Rename "fully live" everywhere + IP-counsel glance at the footer disclaimer.

## Notes
- Two product calls flagged for review: the Transfer Desk leads at **01** (United-forward on a public page), and the daily-digest sections ship as honest **"Updated daily"** placeholders that the daily engine fills under the two-source gate (web research was unavailable at build time, so no results were invented).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
