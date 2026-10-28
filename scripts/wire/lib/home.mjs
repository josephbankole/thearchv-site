/* home.mjs: the Wire block on the front page (founder, 2026-10-28: the Wire on the homepage,
   before the Dispatch block). Pure: vite.config.ts swaps it in at the <!--archv:wire--> marker
   through src/render/home.ts, so nothing here may emit a <script> tag (check-csp-hash.mjs).

   It mirrors the app's All-tab Wire shelf: the publisher's name as a label before the headline,
   the headline verbatim and whole, no image, every link to the publisher's own URL in a new tab.
   Rank-1 items only, one per source, in SPORT_KEYS order; the club-tagged extras stay in the
   feed's `recent` block. `today` is computed at build time, so staleness is a build-time fact:
   a stale edition prints "No new edition since then." and an edition past seven days, or no
   edition at all, renders nothing. */
import { esc } from "../../shared/page-shell.mjs";
import { SPORT_KEYS, currentEdition } from "./schema.mjs";
import { renderWireItem, renderEditionLine, renderWireFooter, wireItemsFor } from "./render.mjs";

// The app's `wire.subline`, word for word, so the two surfaces introduce the Wire the same way.
export const HOME_WIRE_SUBLINE = "Headlines from other newsrooms, picked once a day.";

/* renderHomeWire(wire, today): the whole <section>, or '' when there is no current edition. */
export function renderHomeWire(wire, today) {
  const ed = currentEdition(wire, today);
  if (!ed) return "";
  let pos = 0;
  const items = SPORT_KEYS.flatMap((key) => wireItemsFor(ed, key)).map((it) => renderWireItem(it, ++pos));
  if (!items.length) return "";
  return `<section class="wire wire--home" aria-labelledby="home-wire-title">
  <div class="wrap">
    <h2 id="home-wire-title" class="wire__title">The Wire</h2>
    <p class="wire__subline">${esc(HOME_WIRE_SUBLINE)}</p>
    ${renderEditionLine(ed, today)}
    <ul class="wire__list">
      ${items.join("\n      ")}
    </ul>
    ${renderWireFooter()}
    <p class="wire__more"><a href="/wire/">The Wire page</a></p>
  </div>
</section>`;
}
