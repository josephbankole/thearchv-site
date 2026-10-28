/* home.mjs: the Wire block on the front page (spec B1.8, the founder's 2026-10-28 ask).
   STUB WRITTEN BY PACKAGE H so the homepage can mount the block before package W lands. The
   signature, the markup and the rank-1 rule are the spec's; package W owns this file and replaces
   it (its home.test.mjs is the authority). Until W adds `rank`, every item counts as rank 1.

   Pure: no file reads, no clock. `today` comes from the caller (the Vite build), so staleness is a
   build-time fact and renderEditionLine prints "No new edition since then." on an old edition.
   It mirrors the app's All-tab Wire shelf: publisher label, headline verbatim, no image, the link
   opens the publisher's own URL in a new tab. '' when there is no current edition. */
import { esc } from "../../shared/page-shell.mjs";
import { SPORT_KEYS, currentEdition } from "./schema.mjs";
import { renderWireItem, renderEditionLine, renderWireFooter, wireItemsFor } from "./render.mjs";

// The app's `wire.subline`, word for word.
export const HOME_WIRE_SUBLINE = "Headlines from other newsrooms, picked once a day.";

export function renderHomeWire(wire, today) {
  const ed = currentEdition(wire, today);
  if (!ed) return "";
  const rankOne = { ...ed, items: ed.items.filter((it) => (it.rank ?? 1) === 1) };
  const items = SPORT_KEYS.flatMap((key) => wireItemsFor(rankOne, key));
  if (!items.length) return "";
  return `<section class="wire wire--home" aria-labelledby="home-wire-title">
        <div class="wrap">
          <h2 id="home-wire-title" class="wire__title">The Wire</h2>
          <p class="wire__subline">${esc(HOME_WIRE_SUBLINE)}</p>
          ${renderEditionLine(ed, today)}
          <ul class="wire__list">
          ${items.map((it, i) => renderWireItem(it, i + 1)).join("\n          ")}
          </ul>
          ${renderWireFooter()}
          <p class="wire__more"><a href="/wire/">The Wire page</a></p>
        </div>
      </section>`;
}
