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
