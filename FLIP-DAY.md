# Flip day — App Store go-live

The go-live-day changes (App Store badge on `/start`, "App" item in every
masthead, quiz CTA prep) are built and committed on `preview` but every new
button ships `hidden` and points at the placeholder:

```
APP_STORE_URL = https://apps.apple.com/app/idPLACEHOLDER
```

**2026-07-11 fix (post-incident):** an earlier deploy carried these buttons live
to production even though they still had the `hidden` attribute, because CSS
`display` rules on `.btn` / `.appstore-badge` (both same specificity as
`[hidden]`, declared later in the cascade) were overriding it. Every marked
element now also carries an inline `style="display:none"` alongside `hidden` —
inline style wins the cascade regardless of what the class rules do. Flipping
the button live now requires removing **both** the `hidden` attribute **and**
the `style="display:none"` from each element, not just the attribute.

Grep for `APP_STORE_URL_PLACEHOLDER` to find every line that needs touching.
There are 4 source locations (one shared constant covers all lane/article/long-read
pages). As of 2026-07-11 the homepage masthead and the shared masthead
(`page-shell.mjs`) button row were replaced by a hamburger menu (see "Hamburger
masthead" below) — the App link now lives inside the dropdown menu instead of
the top-level button row, same hidden + display:none convention.

1. **`scripts/shared/page-shell.mjs`** — shared masthead used by lane index pages
   and article pages.
   - Change the `APP_STORE_URL` constant near the top of the file to the real
     App Store URL.
   - In `masthead()`, on the App `<a>` inside the dropdown menu, remove both the
     `hidden` attribute and the `style="display:none"`.

2. **`scripts/build-content.mjs`** — masthead for the older content pages
   (finals, United, explainers). It imports `APP_STORE_URL` from
   `scripts/shared/page-shell.mjs`, so step 1's constant change covers this file
   automatically.
   - Remove the `hidden` attribute and the `style="display:none"` from the App
     `<a>` tag in the masthead markup.

3. **`index.html`** (homepage) — masthead hamburger menu.
   - Change the `href` on `.masthead__app` from
     `https://apps.apple.com/app/idPLACEHOLDER` to the real URL.
   - Remove both the `hidden` attribute and the `style="display:none"`.

4. **`public/start/index.html`** — the App Store badge, first button on `/start`.
   - Change the `href` on `#app-store-badge` from
     `https://apps.apple.com/app/idPLACEHOLDER` to the real URL.
   - Remove both the `hidden` attribute and the `style="display:none"`.

5. **`public/quiz/index.html`** — quiz CTA, RECOMMENDED at launch (founder can veto).
   - Change `<meta name="robots">` from `noindex,nofollow` to `index,follow`.
   - Change the `href` on `#cta-primary` from `https://thearchv.ca/start` to the
     real App Store URL, and change its label from "Read the archive" to
     "Get the app".
   - Both marked with an `APP_STORE_URL_PLACEHOLDER` comment directly above.

## Hamburger masthead (founder design, 2026-07-11)

The masthead button row (Follow / Subscribe / Shop / hidden App) was replaced
site-wide by a hamburger: a three-line toggle button at the masthead's right,
opening a small navy dropdown panel (cream text, gold hover/Subscribe link)
listing Follow, Subscribe to the Dispatch, Shop, and App. Same three page
families as the rest of this doc, same source locations:

- **Homepage** (`index.html`) — markup in the masthead `<header>`, styles in
  `src/style.css` (`.masthead__menu`, `.masthead__toggle`, `.masthead__panel*`),
  behaviour in `src/ui/chrome.ts`'s `initMastheadMenu()`, wired in `src/main.ts`.
  CSP-safe: no inline handlers, the toggle listens via `addEventListener` in the
  bundled TS.
- **Lane + article pages** (`scripts/shared/page-shell.mjs`) — `masthead()` emits
  the button + panel markup and an inline `<script>` with the same open/close
  logic (these pages carry no CSP, and already use inline `<script>` for the
  PostHog snippet and the article share row, so this matches the existing
  convention rather than introducing a new one). Panel styles are in
  `pageStyles()`.
- **Older content pages** (`scripts/build-content.mjs`, `public/content.css`) —
  same markup + inline script pattern as above, styles in the external
  `content.css` since these pages don't inline their CSS.

Behaviour: `aria-expanded` / `aria-controls` on the button, plain wrapping
links inside (not a full ARIA `menu`, so normal Tab order works with no
roving-tabindex needed), Escape closes and returns focus to the button, a
document click outside the panel closes it. No CSS transition on open/close
(the `hidden` attribute is toggled directly), so it is reduced-motion safe by
construction rather than needing a media-query opt-out. Verified working at
320px on all three page families and at desktop width.

The App link inside the panel keeps the same `hidden` + `style="display:none"`
+ `APP_STORE_URL_PLACEHOLDER` convention as before — flipping it live still
means removing both, per the file-by-file list above, just inside the panel
now instead of the old top-level button row.

## After editing

```
cd thearchv-site
npm run build          # confirm it emits cleanly, spot-check dist/ for the new buttons
git add -A
git commit -m "Go-live: flip App Store URL live"
bash scripts/deploy-site.sh
```

Verify live with a cache-busted curl against the homepage, `/start`, and (if
flipped) `/quiz`, grepping for the real App Store URL to confirm it shipped.
