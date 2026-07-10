# Flip day — App Store go-live

The go-live-day changes (App Store badge on `/start`, "App" button in every
masthead, quiz CTA prep) are built and committed on `preview` but every new
button ships `hidden` and points at the placeholder:

```
APP_STORE_URL = https://apps.apple.com/app/idPLACEHOLDER
```

Grep for `APP_STORE_URL_PLACEHOLDER` to find every line that needs touching.
There are 4 source locations (one shared constant covers all lane/article/long-read
pages):

1. **`scripts/shared/page-shell.mjs`** — shared masthead used by lane index pages
   and article pages.
   - Change the `APP_STORE_URL` constant near the top of the file to the real
     App Store URL.
   - In `masthead()`, remove the `hidden` attribute from the App `<a>` tag.

2. **`scripts/build-content.mjs`** — masthead for the older content pages
   (finals, United, explainers). It imports `APP_STORE_URL` from
   `scripts/shared/page-shell.mjs`, so step 1's constant change covers this file
   automatically.
   - Remove the `hidden` attribute from the App `<a>` tag in the masthead markup.

3. **`index.html`** (homepage) — masthead top bar.
   - Change the `href` on `.masthead__app` from
     `https://apps.apple.com/app/idPLACEHOLDER` to the real URL.
   - Remove the `hidden` attribute.

4. **`public/start/index.html`** — the App Store badge, first button on `/start`.
   - Change the `href` on `#app-store-badge` from
     `https://apps.apple.com/app/idPLACEHOLDER` to the real URL.
   - Remove the `hidden` attribute.

5. **`public/quiz/index.html`** — quiz CTA, RECOMMENDED at launch (founder can veto).
   - Change `<meta name="robots">` from `noindex,nofollow` to `index,follow`.
   - Change the `href` on `#cta-primary` from `https://thearchv.ca/start` to the
     real App Store URL, and change its label from "Read the archive" to
     "Get the app".
   - Both marked with an `APP_STORE_URL_PLACEHOLDER` comment directly above.

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
