# Static-image reel — format spec (ratified 2026-06-18, analyst network)

A repurposing format: one banked illustrated face, a burned-in text box read in ~16s while trending audio plays. Text replaces the caption. Posted as an IG Reel. Turns a banked image + an existing debate take into reel-feed distribution at near-zero credit cost.

## Why it fits
Images carry our follow volume, Reels carry our follow rate. This is an image asset wearing a reel's distribution, and it is the upgrade path we should use instead of pushing images into carousels (our worst converter). It is also the first format built to drive comments, our weakest signal. Swing it 1 to 2 a week, alongside the United-image core, not replacing it.

## Pilot picks (single face only)
Single-face debate or devotion posts. Squad-grid posts (England/Portugal Ballon d'Or) are a weak fit; run them as carousels or single-hero instead.
1. The Raya question (injustice) — strongest fit
2. Messi and his father (devotion, save/share lane)
3. France Ballon d'Or — run single-hero on Mbappe, names in the text, not a grid

## The build spec
> **COLORS ARE LEGACY FOR NEW RENDERS, 2026-08-09, per D-2026-08-09b (founder).** The navy #0C2A3E
> panel, gold #C9A14A seam and cream #F2EAD3 type below are the old palette. A new static-image reel
> takes one pair from `BRAND-COLORS.md` / `brand-colors.json`: the pair's dark is the panel and the
> scrim, its light is the seam line and the kicker, and small type falls back to ink `#F5F2F3` or
> `#EFE9E9`. Pair 1 (`#1E223D` / `#F54F1B`) is display sizes only at 4.45:1. Geometry, type sizes,
> safe areas, the reveal timing and D90 are unchanged, and the old hexes stay per D-2026-08-05e.

- 1080x1920, 9:16, 30fps, ~16s (band 14-17), exported SILENT (founder adds trending audio in-app).
- Image zone top 0-1120 (58%), face high (eyes upper third), framed so nothing is clipped by the seam.
- Navy panel #0C2A3E bottom 1120-1920 (42%). Gold #C9A14A seam line at y=1120. Scrim: navy alpha ramp from ~y900 down to the seam so the face blends into the panel.
- Type: Anton (brand display), cream #F2EAD3 body ~50px, gold kicker ~40px caps. Handle @thearchvfc bottom-LEFT (IG action icons eat the right edge).
- Text column x=90 to ~960. Body finishes by ~y1610, handle ~y1650. Keep load-bearing text out of the bottom ~250px (IG caption/audio bar) and right ~150px (action rail).
- ~6 short lines, 30-42 words total. Hook line present from frame 1.
- Progressive line reveal: each line appears on a timer (~every 2.6s), all held at the end for the replay loop. Builds an open loop so viewers stay for the payoff.
- Debate posts end on a forced-choice question ("Who starts?"). Messi ends on a quiet fact, no question, no health angle.
- D90 holds: text is post-production overlay, illustrated likeness only, no crests/logos/marks.

## Audio
Add in-app from the trending tray. Low-vocal or instrumental only, so lyrics do not fight the read. Tense/building loop for debate; quiet reflective bed for Messi.

## Build method
ffmpeg + PIL. PIL builds the base frame (cropped image, scrim, panel, gold line, kicker, handle); ffmpeg overlays each body line as a timed PNG (enable='gte(t,start)') over a 16s silent canvas. Script: outputs/statreels/build.py.

## Pilot files (2026-06-18) — LOCKED
Animation LOCKED to progressive line-by-line reveal (the karaoke word-highlight variant was tried and rejected). Final files in fifa.archv, scored with founder music:
- statreel_raya_music.mp4 — JUL30_120BPM_Dm.V3
- statreel_france_music.mp4 — JUL30_120BPM_Dm.V3
- statreel_messi_music.mp4 — Rapper's Delight
Each is the first 16s of the track, 0.4s fade-in, 1s fade-out. Upload natively as Reels (Buffer won't take video via automation).

## Open items
- Captions: **RESOLVED — brand audit 2026-08-14 (confirm with founder).** Every burned-in-text reel ALSO ships a one-line searchable caption (the hook as plain text; no hashtag spam) plus the standard anchor line. The burned-in text stays the primary read; the caption is the machine-readable echo that keeps the post's reach/SEO surface and its one social-accessibility handle. This closes the format's only open accessibility gap.
- Tag the pilots so the next CSV can isolate them against the Reels FPR 1.26 baseline and the >1 comment/post target.
- A/B lever for debate posts: swap only the closing question, measure comments per 1k views.
