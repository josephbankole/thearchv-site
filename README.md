# thearchv.ca

The owned website for **The ARCHV** (`@thearchv_ca`). Football history, illustrated.
An immersive single-page experience: the IG link-in-bio destination and the brand-deal
credibility surface.

> "Football has a memory. We are the archive."

Built to an awwwards-grade brief on the locked ARCHV identity — Navy `#0C2A3E`, Cream
`#F2EAD3`, Gold `#C9A14A` (capped), Pitch Green `#2E6B3A` — with British-English,
period-terminated copy and no em-dashes.

## Stack

- **Vite + vanilla TypeScript** (no framework; static export)
- **GSAP + ScrollTrigger** for scroll choreography and micro-interactions
- **three.js** for the adaptive WebGL hero (film-grain shader + drifting gold dust)
- **Self-hosted variable fonts** (Fraunces + Inter Tight via `@fontsource`) — no third-party requests
- Deploys as static files to **GitHub Pages** (custom domain `thearchv.ca`)

Performance posture: the hero headline and Follow CTA render in static HTML and never wait
on JS. `three` is a lazy desktop-only chunk. Mobile and `prefers-reduced-motion` get a
lightweight, fully-functional experience (no WebGL).

## Commands

```bash
npm install        # install dependencies
npm run assets     # (re)generate optimized posters from ../POSTERS/FINAL  -> public/posters
npm run og         # (re)generate the social share image -> public/og.jpg
npm run dev        # local dev server
npm run build      # typecheck + production build -> dist/
npm run preview    # serve the production build on :4173
```

The poster + OG images are committed under `public/`, so a clean `npm install && npm run build`
works without the source art. Re-run `npm run assets` only when the poster set changes.

## Activate the partnerships form

The form posts to [Web3Forms](https://web3forms.com) (static, no backend). The access key is
public-safe by design (it only routes mail to your verified address).

1. Go to web3forms.com, enter the destination email, and copy the access key.
2. In `index.html`, add inside `<head>`:
   `<meta name="web3forms-key" content="YOUR-KEY" />`
3. Rebuild. Until a key is set, the form validates but shows "not connected yet."

## Analytics (PostHog)

Privacy-friendly, opt-in, and **dormant until a key is set** (no key = zero network, zero cookies).
Config is lean by design: autocapture OFF, session recording OFF, respects Do Not Track,
`localStorage` persistence (no third-party cookies). Only explicit events are sent.

Activate:
1. Create a free project at [posthog.com](https://posthog.com) and copy the **Project API key** (`phc_…`).
2. Set it one of two ways:
   - build env: `VITE_POSTHOG_KEY=phc_xxx` (and `VITE_POSTHOG_HOST=https://us.i.posthog.com` or the EU host), or
   - in `index.html` head: `<meta name="posthog-key" content="phc_xxx">` (+ optional `<meta name="posthog-host" …>`).
3. Rebuild. Verify in PostHog → Activity (events arrive within seconds).

Events captured: `site_loaded`, `$pageview`, `section_view` (per section), `scroll_depth`
(25/50/75/100), `follow_click` (every Instagram CTA), `digest_day_view` (each day card),
`partnership_submit`. The CSP already allows the PostHog US/EU ingest + asset hosts.

## Content — the daily engine fills these

Two sections are "live trackers" seeded with honest, clearly-labelled placeholder cards
(`status: 'pending'`, shown as **Updated daily**). The daily engine replaces them with
verified entries under the two-source gate. No scores or deals are invented in the repo.
- `src/data/transferDays.ts` — Transfer Desk daily wrap-ups
- `src/data/worldCupDays.ts` — World Cup daily wrap-ups (`DayEntry` shape; set `status: 'verified'` once filled)

## Commerce — Etsy prints (Printful)

The Archive posters are wired to link to their Etsy listings (fulfilled by Printful, store
`etsy.com/shop/TheARCHVCA`). Each `Poster` in `src/data/posters.ts` has an optional `etsyUrl`.
When set, a gold **"Shop this print"** button appears in that poster's lightbox; until then it
stays hidden. As of Jun 2026 all nine archive posters are live and wired. No fake links ship.

## Player headshots — brand illustrations only

Story cards (`src/data/*Days.ts`) take an optional `image` (+ `imageAlt`). **Only brand-illustrated
headshots** are allowed: navy ground, no crest, no kit logo, no sponsor mark, not a photo, and no
`@fifa.archv`/legacy watermark. Source them from the headshot bank or by cropping the face out of a
brand cover (watermark/title-bar excluded), then optimize to `public/heads/*.webp` (~240px). Club
"welcome" graphics and kit photos are forbidden. Keep headshots in editorial cards only, never in
the partnerships section.

## Deploy (GitHub Pages)

1. Push to `main`. The workflow in `.github/workflows/deploy.yml` builds and publishes `dist/`.
2. In the repo: **Settings → Pages → Source = GitHub Actions**.
3. `public/CNAME` pins `thearchv.ca`. Point the domain's DNS at GitHub Pages
   (A records to GitHub's IPs, or a CNAME to `<user>.github.io`), then tick **Enforce HTTPS**.

## Asset / IP decisions baked in

- **Nine posters, not ten.** Moscow 2018 is intentionally **excluded** — its gold cup reads as
  the World Cup trophy, whose shape is a registered design mark, and this is a permanent,
  commercial, indexed page. To restore it, regenerate a trophy-free version, drop it in
  `../POSTERS/FINAL`, add it to `scripts/optimize-posters.mjs` + `src/data/posters.ts`, re-run
  `npm run assets`.
- **No player likenesses on the site.** The third-party player renders are not ours to publish.
  The Transfer Desk is a typographic treatment instead. Keep any future player art editorial,
  never beside the partnerships section.
- **Johannesburg 2010** carries "La Roja's Minute" baked into the art (low-medium mark risk).
  Defensible as editorial; swap to a trophy/text-free variant if a sponsor's counsel objects.

## Pre-launch go / no-go gate

Do not point DNS / go public until every box is true:

- [ ] No `fifa.archv` / `fifaarchv` / `beehiiv` strings anywhere in `dist/` (CI-checkable: `grep -rinE "fifa\.?archv|beehiiv" dist/`)
- [ ] No "FIFA" / "World Cup" / "Qatar 2022" in `<title>`, meta, OG/Twitter, or JSON-LD (editorial body text is fine)
- [ ] Every poster confirmed free of crests, kit logos, competition marks, trophy shapes
- [ ] Footer affiliation disclaimer present
- [ ] Partnerships section shows **no follower/reach numbers** (avoid over-claiming)
- [ ] All social links point to `@thearchv_ca` only
- [ ] Web3Forms key set, or the form intentionally left dormant
- [ ] Rebuilt and re-scrubbed after any content change

See `SECURITY.md` for the security assessment.

© 2026 The ARCHV. Independent publication, not affiliated with any governing body, league, or club.
