# design-sync notes — thearchv-site

## Shape: tokens-only (off-script)

This repo is a vanilla Vite + Three.js + GSAP marketing site, not a component
library. There is no Storybook and no compiled component bundle, so the standard
`/design-sync` converter does not apply. Instead we sync a **brand/token design
system**: tokens, fonts, and the real CSS primitives ported from `src/style.css`.

The upload bundle is built by hand into `ds-bundle/`:

- `styles.css` — entry. `@import`s fonts + tokens, sets the surface, defines primitives.
- `tokens/tokens.css` — the `:root` tokens (mirror of `tokens/tokens.css` at repo root).
- `fonts/fonts.css` + `fonts/files/*.woff2` — bundled Fraunces + Inter Tight (latin/latin-ext, ~340K). No CDN dependency.
- `README.md` — conventions header for the design agent (gold cap, light display, vocabulary).

No `_ds_sync.json` anchor is written: the package-shape recipe assumes a component
build this bundle does not have, so the next sync re-derives from `src/style.css`
rather than trusting a stale anchor. That is the correct behaviour for this shape.

## Source of truth

`src/style.css` `:root` is canonical. `public/content.css` repeats the palette with
two slightly different cream alphas (`--cream-dim` .72, `--cream-faint` .3); we follow
the app stylesheet. Regenerate tokens from `src/style.css` if the palette changes.

## Auth

DesignSync needs a claude.ai login with design scopes. The session's
`CLAUDE_CODE_OAUTH_TOKEN` cannot be upgraded in place — run `/login` before pushing.
