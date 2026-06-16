# PostHog post-wizard report

The wizard added four new analytics events to the ARCHV site, building on the existing PostHog setup in `src/analytics.ts`. The project already tracked Etsy clicks, follow clicks, scroll depth, section views, partnership form submissions, and daily digest card views. These four events fill the gaps in the poster purchase funnel and content engagement picture.

| Event | Description | File |
|---|---|---|
| `poster_open` | Fires when a user opens the poster lightbox — the entry point to the Etsy purchase funnel. Includes `slug`, `title`, `year`, and `host`. | `src/components/archiveRail.ts` |
| `lightbox_shop_click` | Fires when the "Buy Now" button inside the lightbox is clicked. The existing `etsy_click` handler missed this because the href is set dynamically at open time; `onclick` assignment avoids duplicate listeners. | `src/components/archiveRail.ts` |
| `long_read_expand` | Fires when a long-read accordion is opened. Includes `title`, `kicker`, and `index`. Fires only on expand, not collapse. | `src/components/longReads.ts` |
| `article_link_click` | Fires when a user clicks a finals or Manchester United deep-link from the homepage. Includes `href`, `text`, and `section`. Wired via a new `setupArticleLinkTracking()` function called inside `initAnalytics()`. | `src/analytics.ts` |

Environment variables `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST` have been written to `.env`.

## Next steps

A dashboard and five insights are ready in PostHog:

- [Analytics basics (wizard) — dashboard](https://us.posthog.com/project/472285/dashboard/1717745)
- [Poster opens over time](https://us.posthog.com/project/472285/insights/8DrAFcfW) — daily trend of lightbox opens
- [Most opened posters](https://us.posthog.com/project/472285/insights/NOEZCYCh) — opens broken down by poster slug
- [Poster-to-shop conversion funnel](https://us.posthog.com/project/472285/insights/4fhaN70O) — `poster_open` → `lightbox_shop_click` conversion rate
- [Long reads engagement](https://us.posthog.com/project/472285/insights/hWWlMTc2) — daily trend of essay expansions
- [Key site actions](https://us.posthog.com/project/472285/insights/eaJYpcKE) — follow clicks, article link clicks, and partnership submissions side by side

## Verify before merging

- [ ] Run a full production build (`npm run build`) and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite — call sites that were rewritten or instrumented may need updated mocks or fixtures.
- [ ] Add `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST` to `.env.example` so collaborators know what to set.
- [ ] Wire source-map upload (`posthog-cli sourcemap` or your bundler's upload step) into CI so production stack traces de-minify.

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-javascript_node/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.
