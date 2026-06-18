# The ARCHV brand system (tokens and primitives)

This is a brand and token system, not a component library. There are no bespoke React components here. What it gives you is the brand surface: the real fonts, the locked palette, the type scale, and a small set of CSS primitives ported straight from the live site. Build with ordinary components and apply this vocabulary, and the result looks like The ARCHV.

Read `styles.css` first. It imports the fonts (`fonts/fonts.css`) and the tokens (`tokens/tokens.css`), sets the page surface, and defines the primitives below. Everything resolves from that one file.

## The look in one line

Navy background, cream text, a light serif for display, a tight grotesque for everything else, and gold used sparingly as the single accent.

## Two rules that override instinct

1. **Gold is capped.** Use at most two gold elements in any one screen. Gold is for a link, a key mark, or one primary button, then stop. The `.btn--gold` and any `--gold` fill both count. When you reach for a third gold thing, make it `--cream` or `--gold-soft` instead.
2. **Display type runs light.** Headings use the serif at weight 300 to 360, not 400+. The `.display`, `.h2`, `.h3`, and `.lede` classes already set the right weight. If you write your own heading, keep the serif light with slightly negative letter spacing.

## Color tokens (from `tokens/tokens.css`)

Style with the `var(--*)` names, never raw hex.

- Surfaces: `--navy` (page), `--navy-deep` (deepest panels), `--navy-soft` (raised cards)
- Text: `--cream` (primary), `--cream-dim` (secondary), `--cream-faint` (hairlines, borders, tertiary)
- Accent: `--gold`, `--gold-soft` (borders, focus rings)
- States: `--pitch` (confirm/done), `--error`, `--error-border`

## Type tokens

- Families: `--serif` (Fraunces, display) and `--grotesque` (Inter Tight, UI and body)
- Sizes: `--t-display`, `--t-h2`, `--t-h3`, `--t-body`, `--t-label`, all fluid
- Labels and eyebrows are `--t-label`, uppercase, letter-spaced `0.22em`, in `--cream-dim`

## Layout, radius, motion tokens

- `--maxw` (1280px content width), `--measure` (46rem reading width), `--gutter` (page inline padding)
- Corners are nearly square: `--r-sm` (2px, the default for buttons, frames, tags), `--r-md` (3px), `--r-lg` (10px cards)
- `--ease` for transforms, `--ease-out-expo` for entrances

## Primitive classes (from `styles.css`)

- Type: `.display`, `.h2`, `.h3`, `.lede`, `.eyebrow`, `.section-index`, `.dot`
- Buttons: `.btn` with `.btn--gold`, `.btn--ghost`, `.btn--text`
- Surfaces: `.card`, `.card--flat`, `.panel`
- Status tags: `.tag` with `.tag--done`, `.tag--live`, `.tag--rumour`
- Forms: `.field` (wraps a label `span` plus an `input` or `textarea`)
- Layout: `.wrap` (max width plus gutter)

## One build snippet

```html
<section class="wrap">
  <p class="eyebrow">04 <span class="index-tick"></span> Legends</p>
  <h2 class="h2">The names the archive keeps<span class="dot">.</span></h2>
  <p class="lede">Football history, illustrated. One moment at a time.</p>

  <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:1.75rem; margin-top:2.5rem;">
    <article class="card">
      <p class="eyebrow" style="color:var(--gold)">No. 07</p>
      <h3 class="h3" style="margin:.35rem 0 .5rem">Eric Cantona</h3>
      <p style="color:var(--cream-dim)">The collar, the chip, the standstill. Old Trafford's first king of the Premier League era.</p>
    </article>
  </div>

  <div style="margin-top:2rem; display:flex; gap:1.25rem; align-items:center;">
    <a class="btn btn--gold" href="#">Follow the archive</a>
    <a class="btn btn--ghost" href="#">Read the finals</a>
  </div>
</section>
```

That uses one gold element (the primary button) and keeps the second gold touch (the eyebrow) small, which respects the cap. The serif headings stay light. The layout glue is plain inline CSS using the tokens, which is the intended pattern: real brand vocabulary for the look, ordinary markup for structure.
