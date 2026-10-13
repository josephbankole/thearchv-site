# The ARCHV brand tokens

Extracted from the live site (`src/style.css` `:root`, cross-checked against `public/content.css` and `pageStyles()` in `scripts/shared/page-shell.mjs`). These are the real values the site ships, not a redesign. Rewritten 2026-08-09 for the white ground; the ground became warm paper on 2026-10-13 (founder: a slightly darker background and better contrast).

Three files in this folder:

- `tokens.json`: structured tokens (color, type, layout, radius, motion). Feed this to a token pipeline, a Tailwind config, or any tool that reads JSON.
- `tokens.css`: the same values as a portable `:root` block. Drop it into any project and use the `var(--*)` names.
- `BRAND-TOKENS.md`: this file, the rules a value alone can't tell you.

## Palette

The ground is warm off-white paper and the ink is navy. Orange is the accent, and it does two different jobs at
two different values: `--accent` fills and rules, `--accent-ink` carries words. Green and amber are
the two status states the desks use.

The contrast column is the measured WCAG ratio against `#F4F1EA` and against `#EAE6DC`, the only
two grounds this system sets text on. Every text role clears 4.5:1; that is a floor, not a target.

| Token | Value | Contrast (ground / sunken) | Use |
|---|---|---|---|
| `--bg` | `#F4F1EA` | — | Page background |
| `--bg-sunken` | `#EAE6DC` | — | Wire strip, app strip, panels |
| `--ink` | `#1E223D` | 13.78:1 / 12.47:1 | Primary text |
| `--ink-soft` | `#3C4163` | 8.75:1 / 7.92:1 | Deks, secondary text |
| `--ink-muted` | `#4C5176` | 6.78:1 / 6.14:1 | Muted text: bylines, dates, captions, legal |
| `--ink-faint` | `#7A7F9E` | 3.48:1 / 3.15:1 | **Decorative only.** Never text |
| `--accent` | `#F54F1B` | 3.09:1 / 2.80:1 | **Fills and rules only.** Never text |
| `--accent-ink` | `#B23109` | 5.58:1 / 5.05:1 | Accent text, links, kickers |
| `--on-accent` | `#16192E` | 4.96:1 on the accent fill | Text on an orange fill |
| `--rule` | `#D9D3C5` | — | Hairlines and borders |
| `--rule-soft` | `#E7E2D6` | — | Interior dividers |
| `--confirmed` | `#176A2E` | 5.93:1 / 5.37:1 | Verified state |
| `--reported` | `#6E5600` | 6.22:1 / 5.63:1 | Reported / still open state |

Band hues (`--yellow` `#FFD85F`, `--lilac` `#C8BEFA`, `--chalk` `#EFE9E9`) are 2px decorative
rules under a section name. They carry no contrast floor and must never sit behind text.

## Three rules that aren't in the values

1. **The accent has two values and they are not interchangeable.** `#F54F1B` is a fill. The moment
   it carries a word it fails AA on the ground, so text uses `#B23109`. If a rule sets both a background
   and a colour, state the colour explicitly rather than inheriting.
2. **`--ink-faint` is not `--ink-muted`.** The faint tone is for bar fills and marks. The muted one
   is for words. This is the same split the navy system made between `--cream-faint` and
   `--cream-faint-text`, carried across intact.
3. **One look, no inversion.** The dark-mode token block mirrors the light one deliberately. A
   newspaper front page has one ground; supporting two is supporting two designs.

## Type

- **Headlines:** Anton, one weight (400), uppercase, slight positive tracking (`0.01em` to `0.06em`
  depending on size). Self-hosted latin subset with `font-display: swap`.
- **Deks and prose:** Fraunces (variable), light weights, `1.55` line-height.
- **Body / UI / labels:** Inter Tight (variable). Body line-height `1.6`. Labels are `0.72rem`,
  uppercase, letter-spaced, set in `--ink-muted`.
- **Scale:** all fluid `clamp()`: `--t-display`, `--t-h2`, `--t-h3`, `--t-body`, `--t-label`.

Load Fraunces and Inter Tight via `@fontsource-variable/*`; Anton is a committed woff2 in
`public/fonts/`, licensed SIL OFL 1.1 (`public/fonts/OFL-Anton.txt`).

## Layout, radius, motion

- Content max width `1280px`; article reading measure `46rem`; inline gutter `clamp(1.25rem, 5vw, 5rem)`.
- Corners are nearly square. Default radius is `2px` (buttons, frames, tags). Digest cards `3px`, legend cards `10px`. When in doubt, `2px`.
- Two easing curves: `--ease` `cubic-bezier(0.22,1,0.36,1)` for transforms, `--ease-out-expo` `cubic-bezier(0.16,1,0.3,1)` for entrances.

## Where these live

Three copies of the `:root` block ship, and none of them imports another: `src/style.css` (the
front page and its bundle), `pageStyles()` in `scripts/shared/page-shell.mjs` (article, lane,
sport, glossary, standards, duel, guess and author pages), and `public/content.css` (the long-form
content pages). Change one, change all three. The legacy navy names (`--navy`, `--cream`, `--gold`
and the rest) still exist in all three as aliases pointing at white-system values; they are the
migration seam from the navy build, not a second palette.
