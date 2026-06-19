# The ARCHV brand tokens

Extracted from the live site (`src/style.css` `:root`, cross-checked against `public/content.css`). These are the real values the site ships, not a redesign.

Three files in this folder:

- `tokens.json`: structured tokens (color, type, layout, radius, motion). Feed this to a token pipeline, a Tailwind config, or any tool that reads JSON.
- `tokens.css`: the same values as a portable `:root` block. Drop it into any project and use the `var(--*)` names.
- `BRAND-TOKENS.md`: this file, the rules a value alone can't tell you.

## Palette

Navy is the base. Cream carries the text. Gold is the accent, and pitch green is the confirm state.

| Token | Value | Use |
|---|---|---|
| `--navy` | `#0c2a3e` | Page background |
| `--navy-deep` | `#071c2b` | Deepest panels, overlays |
| `--navy-soft` | `#133a52` | Raised cards |
| `--cream` | `#f2ead3` | Primary text |
| `--cream-dim` | `rgba(242,234,211,.6)` | Secondary text |
| `--cream-faint` | `rgba(242,234,211,.28)` | Hairlines, borders, tertiary text |
| `--gold` | `#c9a14a` | Accent, capped (see below) |
| `--gold-soft` | `rgba(201,161,74,.5)` | Accent borders, focus rings |
| `--pitch` | `#2e6b3a` | Done / confirmed |

## Two rules that aren't in the values

1. **Gold is capped.** No more than two gold elements in a viewport at once. On the site this is enforced in JS. Treat gold as punctuation, not a fill. Links, one key mark, or a single primary button, then stop.
2. **Display type runs light.** The Fraunces headings sit around weight 300 to 360, not 400+. The hero and section titles look the way they do because the serif is set light with tight, slightly negative tracking. Bumping the weight up breaks the feel.

## Type

- **Display / headings:** Fraunces (variable). Light weights, tight leading (`0.98` on the hero), negative tracking (`-0.035em` display, `-0.02em` section heads).
- **Body / UI / labels:** Inter Tight (variable). Body line-height `1.6`. Labels are `0.72rem`, uppercase, letter-spaced `0.22em`, set in `--cream-dim`.
- **Scale:** all fluid `clamp()`: `--t-display`, `--t-h2`, `--t-h3`, `--t-body`, `--t-label`.

Load both fonts via `@fontsource-variable/fraunces` and `@fontsource-variable/inter-tight`, or the Google Fonts link in `tokens.css`.

## Layout, radius, motion

- Content max width `1280px`; article reading measure `46rem`; inline gutter `clamp(1.25rem, 5vw, 5rem)`.
- Corners are nearly square. Default radius is `2px` (buttons, frames, tags). Digest cards `3px`, legend cards `10px`. When in doubt, `2px`.
- Two easing curves: `--ease` `cubic-bezier(0.22,1,0.36,1)` for transforms, `--ease-out-expo` `cubic-bezier(0.16,1,0.3,1)` for entrances.

## One reconciliation note

The app CSS and the article CSS carry slightly different alphas on two cream tints (`--cream-dim` .6 vs .72, `--cream-faint` .28 vs .3). The values above follow the app stylesheet, which is the one labelled the design system. If you regenerate from `content.css`, expect those two to drift a hair.
