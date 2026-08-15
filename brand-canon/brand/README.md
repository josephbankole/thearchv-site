# ARCHV logo & mark usage — `brand/`

> Added 2026-08-14 (brand audit quick win #5). This is a usage map for the assets already in
> this folder. **Palette authority is `../brand-colors.json`; type authority is
> `../DESIGN-PLAYBOOK.md`.** Items marked **(confirm)** are proposed defaults from the audit
> that still need a founder call — nothing here overrides a founder decision.

## Which mark, on which ground

| Asset | Use it for | Ground |
|-------|-----------|--------|
| `archv-wordmark-navy.svg/.png` | wordmark on light grounds (legacy navy `#0C2A3E`) | light / white |
| `archv-wordmark-pair1.svg` | **anchor-pair wordmark** — Archive Navy `#1E223D` text, Signal Orange `#F54F1B` dot (pair 1). Added 2026-08-14 as the on-palette wordmark. | light / white |
| `archv-wordmark-cream.svg/.png` | wordmark on dark grounds | dark navy |
| `archv-wordmark-white.svg/.png` | wordmark on photos / busy dark grounds | dark / image |
| `archv-wordmark-black.svg/.png` | single-colour / print / stamp | light |
| `archv-badge.svg/.png` | compact square mark where the wordmark is too wide | either |
| `archv-badge-circle.svg/.png` | circular avatar / watermark badge — **LEGACY palette** (navy/gold/cream), still the live avatar until the crest decision lands (see below) | dark |
| `logos-svg/archv-masthead-stacked.svg` | "THE / ARCHV" masthead (match covers, mastheads) | dark |
| `logos-svg/archv-handle-thearchvfc-gold.svg` | handle lockup watermark | dark |
| `archv-logo-poster.svg/.png` | Etsy poster lockup | as designed |
| `archv-site-favicon.svg` (`logos-svg/`) | site favicon / 16–64px | either |
| `apparel/`, `wallpapers/`, `reel-first-frame/` | garment lockups, wallpapers, reel end-cards | as designed |

## Watermark / handle corner rule

Default: **handle chip + badge bottom-RIGHT** inside the 86% safe area (brand-voice §10 / §16C).
Two documented exceptions:

1. **Static-image reels** put the handle **bottom-LEFT** — IG's action rail eats the right edge
   (`STATIC-IMAGE-REEL-SPEC.md`).
2. **Match covers** carry **no handle** — masthead + barcode chrome stand in
   (`match-covers/carousel/tokens.json`).

Handle currently locks to **`@thearchvfc`** on shared watermarks (HANDLE LOCK,
`brand-voice-CHEATSHEET.md`) pending a founder call on per-account handles.

## Clear-space & minimum size — **PROPOSED (confirm)**

No clear-space or min-size rule existed before this audit. Proposed starting defaults, to confirm:

- **Clear-space:** keep clear margin on all sides equal to the height of the wordmark's cap-height
  (≈ the "A" height) around wordmark and badge; nothing else inside that margin.
- **Minimum size:** wordmark not below **120px** wide on screen / 18mm in print; circular badge /
  favicon not below **48px** (the footer already renders the crest at 64/48px per
  `brand-crest-2026-08/OPTIONS.md`).

## Open logo decision

The shipped wordmarks still use the **legacy navy `#0C2A3E` / gold `#C9A14A`**, and the circular
badge is still legacy navy/gold/cream. `archv-wordmark-pair1.svg` is the first on-palette (pair 1)
wordmark. **The crest itself is unresolved:** five finished, contrast-audited options sit in
`../brand-crest-2026-08/` (`OPTIONS.md`) with none applied. Picking and shipping one is a founder
decision — see the brand audit.
