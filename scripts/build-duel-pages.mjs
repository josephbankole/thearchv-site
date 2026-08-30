/* build-duel-pages.mjs — the player duel system.
 *
 * EMITS
 *   dist/duel/index.html              the picker, plus every pair as a plain link
 *   dist/duel/<a>-v-<b>/index.html    one pre-rendered comparison per pair
 *   dist/duel/<a>-v-<b>/og.png        a 1200x630 share card WITH THE NUMBERS ON IT
 *
 * WHY THE PAIR PAGES ARE PRE-RENDERED. The comparison state is a pair of players and the URL is
 * the share unit, which is the whole loop. /duel/?p1=x&p2=y is a first-class entry point and works
 * exactly as typed, but GitHub Pages serves one file for every query string, so a query-only design
 * would give every argument the same social card. So the query form resolves to a canonical pair
 * path, and that path is a real page with a real card. Both URLs work; only one can unfurl.
 *
 * DATA comes through scripts/shared/football-data.mjs and nowhere else. See that file's header.
 *
 * THE CARD IS THE POINT. The competition's version of this card carries two names and two faces
 * and no numbers at all, which means the screenshot people actually share says nothing. This one
 * puts the stat rows on the image, with the split bar, so the argument survives being posted.
 *
 * Runs after `vite build` (see package.json "build"). The og.png path follows the proven one in
 * build-article-pages.mjs, and now literally the same code: renderCard() and artPng() out of
 * shared/card-brand.mjs. A card failure warns and the page falls back to /og.jpg; it never fails
 * the build, and that decision stays here rather than in the shared module. */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SITE, esc, escAttr, clampTitle, clampDescription, longDate, jsLiteral,
  masthead, footer, documentShell, ROBOTS_INDEXABLE,
  cspMeta, scriptHash, extractScriptBody, MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH,
} from "./shared/page-shell.mjs";
import { CARD, CARD_GROUND, div, text, accentRule, wordmark, renderCard, artPng } from "./shared/card-brand.mjs";
import { percentileBar, percentileBarStyles } from "./shared/percentile-bar.mjs";
import { loadDataset, listPairs, compareStat, formatValue, providerName } from "./shared/football-data.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.CONTENT_OUT || join(ROOT, "dist");

const data = await loadDataset();
const { competition, asOf, metrics, sources, omitted = [] } = data;
// A duel needs two people. The static provider validates this; a live provider that returned a
// short roster would otherwise reach the picker and crash on players[1] with nothing useful said.
if (!data.players || data.players.length < 2) {
  throw new Error(`[build-duel-pages] provider "${providerName}" returned ${data.players?.length ?? 0} player(s); a duel needs at least two.`);
}
const pairs = await listPairs();

// Short, because it repeats on every value in every row, and precise, because a rank is a claim.
// The sentence in POOL_NOTE spells out what the roster is, once per page.
const POOL_LABEL = "the ARCHV roster";
const POOL_NOTE = `A rank here counts the ${data.players.length} players in this roster and nobody else, not the whole ${competition.label}. Where a placing is league-wide, the row says so and names the source.`;
const SCOPE_LINE = `${competition.label}, ${competition.season}. ${competition.scopeNote} Figures as of ${longDate(asOf)}.`;

// longDate was defined here, correctly pinned to UTC, while four other generators redefined it
// without the pin and rendered the previous day west of Greenwich. It now lives in page-shell.mjs
// as the one implementation everything imports.

/* ---------- sources: one named line per stat, printed under the number it belongs to ---------- */
function sourceNames(ids = []) {
  const names = [...new Set(ids.map((id) => sources[id]?.name).filter(Boolean))];
  if (!names.length) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/* ---------- the tug of war row ---------- */
// Split proportionally between the two figures. Two zeroes split evenly and the row says so
// rather than drawing an empty bar that reads as missing data.
function splitPercent(valueA, valueB) {
  const a = Number(valueA) || 0;
  const b = Number(valueB) || 0;
  const total = a + b;
  if (total <= 0) return { a: 50, b: 50, empty: true };
  return { a: (a / total) * 100, b: (b / total) * 100, empty: false };
}

function statRow(metric, playerA, playerB) {
  const statA = playerA.stats[metric.key];
  const statB = playerB.stats[metric.key];
  if (!statA || !statB) return "";

  const winner = compareStat(metric, statA, statB);
  const split = splitPercent(statA.value, statB.value);
  const rowSources = sourceNames([...(statA.sources || []), ...(statB.sources || [])]);

  const chip = (side) =>
    winner === side ? " duel-bar__side--win" : winner === "tie" ? " duel-bar__side--tie" : "";

  const barLabel = split.empty
    ? `${metric.label}: neither player registered one.`
    : `${metric.label}: ${playerA.name} ${formatValue(metric, statA.value)}, ${playerB.name} ${formatValue(metric, statB.value)}.`;

  // The bar always ranks against the pool we can actually see, and says which pool that is. A
  // sourced league-wide placing rides alongside as a note rather than quietly replacing the
  // denominator: "1st of 6 in the ARCHV set" and "1st in the Premier League" are different claims
  // and only one of them is provable from this dataset.
  const cell = (player, stat, align) =>
    percentileBar({
      value: formatValue(metric, stat.value),
      rank: stat.rosterRank ?? null,
      poolSize: stat.rosterSize ?? null,
      poolLabel: POOL_LABEL,
      align,
      tone: winner === (align === "right" ? "b" : "a") ? "gold" : "cream",
    });

  // League-wide placings sit under the row rather than inside a value cell, so the two cells stay
  // the same height and the numbers line up with each other at every width.
  const leagueNotes = [
    statA.leagueRankNote ? `${playerA.sortName}: ${statA.leagueRankNote}` : "",
    statB.leagueRankNote ? `${playerB.sortName}: ${statB.leagueRankNote}` : "",
  ].filter(Boolean);

  return `<li class="duel-row">
        <div class="duel-row__grid">
          <div class="duel-row__cell duel-row__cell--a">${cell(playerA, statA, "left")}</div>
          <div class="duel-row__metric">
            <span class="duel-row__metric-name">${esc(metric.label)}</span>
            ${metric.derived ? `<span class="duel-row__metric-calc">ARCHV calculation</span>` : ""}
          </div>
          <div class="duel-row__cell duel-row__cell--b">${cell(playerB, statB, "right")}</div>
        </div>
        <div class="duel-bar" role="img" aria-label="${escAttr(barLabel)}">
          <span class="duel-bar__side duel-bar__side--a${chip("a")}" style="width:${split.a.toFixed(1)}%"></span>
          <span class="duel-bar__side duel-bar__side--b${chip("b")}" style="width:${split.b.toFixed(1)}%"></span>
        </div>
        ${leagueNotes.length ? `<p class="duel-row__flag">${leagueNotes.map(esc).join(" ")}</p>` : ""}
        <p class="duel-row__source">${esc(metric.blurb)}${rowSources ? ` Source: ${esc(rowSources)}.` : ""}</p>
      </li>`;
}

/* ---------- headshots: illustrated only, and never a broken image ---------- */
// public/heads/ is committed to main by the daily engine, so a preview checkout can legitimately
// be missing a face. A missing file falls back to a monogram disc rather than an alt-text
// stub, which keeps the card looking deliberate instead of broken.
// No existence check here: artPng() returns null for a path that is not on disk, and a duel
// card with no face falls back to the initials disc either way.
function headPath(player) {
  if (!player.head) return null;
  return join(ROOT, "public", player.head.replace(/^\//, ""));
}

function initials(name) {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function headFigure(player, size = 104) {
  if (headPath(player)) {
    return `<img class="duel-head__img" src="${escAttr(player.head)}" alt="${escAttr(player.headAlt)}" width="${size}" height="${size}" loading="eager" decoding="async" />`;
  }
  return `<span class="duel-head__monogram" role="img" aria-label="${escAttr(player.headAlt)}">${esc(initials(player.name))}</span>`;
}

/* ---------- the OG card ----------
   RE-ARTED ON THE WHITE SYSTEM, phase 2B, alongside the article cards: palette, fonts and the
   wordmark all come from scripts/shared/card-brand.mjs, so a duel shared into a feed previews as
   the page it opens. The split bars keep the same reading as the percentile bars on the page
   itself (scripts/shared/percentile-bar.mjs): the accent is the one in front, the muted ink is
   the one behind, and the track is the rule grey. */

// Cached per player, not per path: the same face appears in every pairing that player is in.
const headPngCache = new Map();
async function headPng(player) {
  if (headPngCache.has(player.id)) return headPngCache.get(player.id);
  const png = await artPng(headPath(player), { size: 400 });
  const uri = png ? `data:image/png;base64,${png.toString("base64")}` : null;
  headPngCache.set(player.id, uri);
  return uri;
}

const CARD_W = 1200;
const CARD_H = 630;
const CARD_PAD = 56;
const BAR_W = CARD_W - CARD_PAD * 2;

function cardHeadNode(uri, player, align) {
  const face = uri
    ? { type: "img", props: { src: uri, width: 116, height: 116, style: { borderRadius: 116, border: `2px solid ${CARD.rule}` } } }
    : div(
        { display: "flex", width: 116, height: 116, borderRadius: 116, border: `2px solid ${CARD.rule}`, alignItems: "center", justifyContent: "center", backgroundColor: CARD.bgSunken },
        [text({ fontFamily: "Anton", fontSize: 44, color: CARD.accentInk }, initials(player.name))],
      );

  // Shrink-to-fit so a long name keeps to one line where it can and never runs into the centre V.
  // Anton is condensed, so each step sits above the old Fraunces one.
  const nameSize = player.name.length <= 14 ? 46 : player.name.length <= 20 ? 39 : 33;
  const words = div(
    { display: "flex", flexDirection: "column", alignItems: align === "right" ? "flex-end" : "flex-start", marginLeft: align === "right" ? 0 : 22, marginRight: align === "right" ? 22 : 0, width: 320 },
    [
      text({ fontFamily: "Anton", fontSize: nameSize, color: CARD.ink, lineHeight: 1.06, lineClamp: 2, textAlign: align === "right" ? "right" : "left", width: 320 }, String(player.name).toUpperCase()),
      text({ fontFamily: "Inter Tight", fontWeight: 400, fontSize: 21, color: CARD.inkMuted, marginTop: 6, lineClamp: 1, width: 320, textAlign: align === "right" ? "right" : "left" }, player.club || ""),
    ],
  );

  return div(
    { display: "flex", alignItems: "center", width: 480, justifyContent: align === "right" ? "flex-end" : "flex-start" },
    align === "right" ? [words, face] : [face, words],
  );
}

function cardStatRow(metric, playerA, playerB) {
  const statA = playerA.stats[metric.key];
  const statB = playerB.stats[metric.key];
  const winner = compareStat(metric, statA, statB);
  const split = splitPercent(statA.value, statB.value);
  const aW = Math.round((BAR_W * split.a) / 100);
  const bW = BAR_W - aW;

  // Same three colours the page's own bars use: the accent leads, the muted ink follows, the
  // rule grey is the track. A tie gives both sides the muted ink rather than both the accent,
  // so "in front" always means exactly one thing.
  const lead = CARD.accentFill;
  const behind = "#7A7F9E";
  const aFill = winner === "a" ? lead : behind;
  const bFill = winner === "b" ? lead : behind;

  return div({ display: "flex", flexDirection: "column", width: BAR_W, marginTop: 22 }, [
    div({ display: "flex", alignItems: "flex-end", justifyContent: "space-between", width: BAR_W, marginBottom: 8 }, [
      text({ fontFamily: "Anton", fontSize: 50, color: winner === "a" ? CARD.ink : CARD.inkMuted, width: 150 }, formatValue(metric, statA.value)),
      // A flex box with justifyContent, not textAlign: satori honours the box, and textAlign alone
      // on a grown text node leaves the label hard against its left edge.
      div({ display: "flex", justifyContent: "center", alignItems: "flex-end", width: BAR_W - 300 }, [
        text({ fontFamily: "Inter Tight", fontWeight: 600, fontSize: 19, letterSpacing: 3.4, color: CARD.inkMuted }, metric.label.toUpperCase()),
      ]),
      text({ fontFamily: "Anton", fontSize: 50, color: winner === "b" ? CARD.ink : CARD.inkMuted, width: 150, textAlign: "right" }, formatValue(metric, statB.value)),
    ]),
    div({ display: "flex", width: BAR_W, height: 10, borderRadius: 5, overflow: "hidden", backgroundColor: CARD.rule }, [
      div({ display: "flex", width: aW, height: 10, backgroundColor: aFill }, []),
      div({ display: "flex", width: bW, height: 10, backgroundColor: bFill }, []),
    ]),
  ]);
}

async function ogCard(playerA, playerB) {
  const [uriA, uriB] = await Promise.all([headPng(playerA), headPng(playerB)]);
  const rows = metrics.filter((m) => playerA.stats[m.key] && playerB.stats[m.key]).slice(0, 3);

  const tree = div({ width: CARD_W, height: CARD_H, display: "flex", flexDirection: "column", backgroundColor: CARD.bg, backgroundImage: CARD_GROUND }, [
    accentRule(CARD_W),
    div(
      {
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        flexGrow: 1, width: CARD_W, padding: CARD_PAD,
      },
      [
        div({ display: "flex", flexDirection: "column", width: BAR_W }, [
          text({ fontFamily: "Inter Tight", fontWeight: 600, fontSize: 20, letterSpacing: 4.5, color: CARD.accentInk, lineClamp: 1 },
            `PLAYER DUEL · ${competition.label.toUpperCase()} ${competition.season}`),
          div({ display: "flex", alignItems: "center", justifyContent: "space-between", width: BAR_W, marginTop: 22 }, [
            cardHeadNode(uriA, playerA, "left"),
            text({ fontFamily: "Anton", fontSize: 34, color: CARD.accentFill, marginLeft: 16, marginRight: 16 }, "V"),
            cardHeadNode(uriB, playerB, "right"),
          ]),
        ]),
        div({ display: "flex", flexDirection: "column", width: BAR_W }, rows.map((m) => cardStatRow(m, playerA, playerB))),
        div({ display: "flex", alignItems: "baseline", justifyContent: "space-between", width: BAR_W }, [
          wordmark(30),
          text({ fontFamily: "Inter Tight", fontWeight: 400, fontSize: 17, color: CARD.inkMuted },
            `${sourceNames([...new Set(rows.flatMap((m) => [...(playerA.stats[m.key].sources || []), ...(playerB.stats[m.key].sources || [])]))])} · thearchv.ca/duel`),
        ]),
      ],
    ),
  ]);

  return renderCard(tree, { width: CARD_W, height: CARD_H });
}

/* ---------- page copy ---------- */
const INDEX_LEDE =
  "Two players, the same competition and the same season, with every figure showing where it came from. Pick a pair. The page you land on is the argument, and the link is how you send it to whoever needs correcting.";
const INDEX_NOTE =
  "Nothing here is a live feed. These are settled end-of-season records, each one checked by hand against two named sources, and the sources sit under the numbers they belong to.";
const PAIR_INTRO = "Each row splits the bar between them. The orange side is the one in front.";

/* ---------- shared page CSS for this family ---------- */
function duelStyles() {
  return `<style>
    .duel-wrap { padding: 1.6rem 0 1rem; }
    .duel-eyebrow { color: var(--gold); font-size: .78rem; letter-spacing: .16em; text-transform: uppercase; margin: 0 0 .6rem; }
    .duel-scope { font-size: .82rem; color: var(--cream-faint-text); margin: 0 0 1.6rem; }
    .duel-lede { color: var(--cream-dim); font-size: 1.05rem; max-width: 42rem; margin: 0 0 1.6rem; }

    /* the two faces, name and club, either side of a gold V */
    .duel-heads { display: flex; align-items: center; justify-content: space-between; gap: .6rem; margin: 0 0 1.4rem; }
    .duel-head { display: flex; flex-direction: column; align-items: center; text-align: center; flex: 1 1 0; min-width: 0; }
    .duel-head__img, .duel-head__monogram { width: 104px; height: 104px; border-radius: 50%; object-fit: cover; border: 1px solid var(--rule); box-shadow: 0 0 0 4px #FFFFFF; }
    .duel-head__monogram { display: flex; align-items: center; justify-content: center; background: var(--bg-sunken); color: var(--accent-ink); font-family: var(--display); font-size: 2rem; font-weight: 400; }
    .duel-head__name { color: var(--cream); font-family: "Fraunces", Georgia, serif; font-weight: 600; font-size: clamp(1.05rem, 3.4vw, 1.35rem); line-height: 1.2; margin: .8rem 0 .2rem; }
    .duel-head__club { font-size: .82rem; color: var(--cream-faint-text); margin: 0; }
    .duel-head__line { font-size: .8rem; color: var(--cream-dim); margin: .5rem 0 0; max-width: 15rem; }
    .duel-v { color: var(--gold); font-family: "Fraunces", Georgia, serif; font-size: 1.5rem; flex: 0 0 auto; padding: 0 .2rem; }

    .duel-verdict { margin: 0 0 1.8rem; padding: .9rem 1.1rem; border: 1px solid var(--cream-faint); border-radius: .6rem; font-size: .95rem; color: var(--cream); background: rgba(255,255,255,.03); }

    .duel-rows { list-style: none; padding: 0; margin: 0; display: grid; gap: 1.6rem; }
    .duel-row__grid { display: grid; grid-template-columns: 1fr auto 1fr; align-items: end; gap: .6rem; }
    .duel-row__metric { text-align: center; padding: 0 .2rem; }
    .duel-row__metric-name { display: block; font-size: .74rem; letter-spacing: .12em; text-transform: uppercase; color: var(--cream-dim); }
    .duel-row__metric-calc { display: block; font-size: .64rem; letter-spacing: .08em; text-transform: uppercase; color: var(--cream-faint-text); margin-top: .2rem; }
    /* The split bar. Its three colours were cream at 12, 24 and 42 per cent, which on the navy
       ground read as a track and two fills and on the white ground read as nothing at all. They
       are now the same three the percentile bars use (scripts/shared/percentile-bar.mjs): the
       accent leads, the muted mark follows, the rule grey is the track. --ink-faint is a
       decorative token and never carries text, which is exactly what a bar fill is. */
    .duel-bar { display: flex; width: 100%; height: 10px; border-radius: 5px; overflow: hidden; background: var(--rule); margin: .7rem 0 .5rem; }
    .duel-bar__side { display: block; height: 100%; background: var(--ink-faint); }
    .duel-bar__side--win { background: var(--accent-fill); }
    .duel-bar__side--tie { background: var(--ink-faint); }
    .duel-row__flag { font-size: .78rem; color: var(--gold); margin: 0 0 .3rem; }
    .duel-row__source { font-size: .76rem; color: var(--cream-faint-text); margin: 0; }

    .duel-missing { margin: 2.2rem 0 0; padding: 1.1rem 1.25rem; border: 1px solid var(--cream-faint); border-radius: .6rem; }
    .duel-missing h2 { color: var(--cream); font-family: "Fraunces", Georgia, serif; font-weight: 600; font-size: 1.1rem; margin: 0 0 .5rem; }
    .duel-missing p { font-size: .85rem; color: var(--cream-faint-text); margin: 0 0 .5rem; }
    .duel-missing ul { margin: 0; padding-left: 1.1rem; font-size: .85rem; color: var(--cream-faint-text); }

    .duel-sources { margin: 1.6rem 0 0; font-size: .8rem; color: var(--cream-faint-text); }
    .duel-sources h2 { color: var(--cream); font-family: "Fraunces", Georgia, serif; font-weight: 600; font-size: 1.1rem; margin: 0 0 .5rem; }
    .duel-sources ul { list-style: none; padding: 0; margin: 0; display: grid; gap: .35rem; }

    /* picker */
    .duel-picker { display: flex; flex-wrap: wrap; gap: .7rem; align-items: flex-end; margin: 0 0 2rem; padding: 1.2rem 1.25rem; border: 1px solid var(--cream-faint); border-radius: .75rem; background: var(--bg-sunken); box-shadow: var(--shadow-soft); }
    .duel-picker__field { display: flex; flex-direction: column; gap: .3rem; flex: 1 1 12rem; min-width: 0; }
    .duel-picker__field label { font-size: .72rem; letter-spacing: .12em; text-transform: uppercase; color: var(--cream-faint-text); }
    .duel-picker select { font: inherit; font-size: .95rem; color: var(--cream); background: var(--navy-deep); border: 1px solid var(--gold-soft); border-radius: .45rem; padding: .55rem .6rem; width: 100%; }
    .duel-picker select:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
    .duel-picker button { font: inherit; font-size: .85rem; font-weight: 600; padding: .6rem 1.1rem; border-radius: .5rem; border: 0; background: var(--accent-ink); color: #FFFFFF; cursor: pointer; }
    .duel-picker button:hover { filter: brightness(1.06); }
    .duel-picker__hint { flex: 1 1 100%; font-size: .78rem; color: var(--cream-faint-text); margin: 0; }

    .duel-grid { list-style: none; padding: 0; margin: 0; display: grid; gap: .7rem; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); }
    .duel-grid a { display: block; padding: .85rem 1rem; border: 1px solid var(--cream-faint); border-radius: .6rem; color: var(--cream); font-size: .92rem; }
    .duel-grid a:hover { border-color: var(--gold-soft); text-decoration: none; }
    .duel-grid a:focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; }
    .duel-grid__sub { display: block; font-size: .74rem; color: var(--cream-faint-text); margin-top: .25rem; }

    @media (max-width: 34rem) {
      .duel-row__grid { grid-template-columns: 1fr auto 1fr; gap: .35rem; }
      .duel-head__img, .duel-head__monogram { width: 76px; height: 76px; }
      .duel-head__monogram { font-size: 1.5rem; }
    }
  </style>`;
}

/* ---------- pair page ---------- */
function shareScriptTag(url, title) {
  return `<script>
    (function () {
      var url = ${jsLiteral(url)};
      var title = ${jsLiteral(title)};
      var nativeBtn = document.getElementById('duel-share');
      var copyBtn = document.getElementById('duel-copy');
      if (nativeBtn && navigator.share) {
        nativeBtn.hidden = false;
        nativeBtn.addEventListener('click', function () {
          navigator.share({ title: title, url: url }).then(function () {
            if (window.posthog) posthog.capture('duel_share_native', { url: url });
          }).catch(function () {});
        });
      }
      if (copyBtn) {
        copyBtn.addEventListener('click', function () {
          var done = function () {
            copyBtn.textContent = 'Link copied';
            setTimeout(function () { copyBtn.textContent = 'Copy link'; }, 2000);
            if (window.posthog) posthog.capture('duel_share_copy', { url: url });
          };
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(done).catch(function () {});
          }
        });
      }
    })();
  </script>`;
}

function verdictLine(playerA, playerB) {
  let a = 0;
  let b = 0;
  for (const metric of metrics) {
    const winner = compareStat(metric, playerA.stats[metric.key], playerB.stats[metric.key]);
    if (winner === "a") a++;
    else if (winner === "b") b++;
  }
  const total = metrics.filter((m) => playerA.stats[m.key] && playerB.stats[m.key]).length;
  if (a === b) return `Level, ${a} rows each.`;
  const [leadName, lead] = a > b ? [playerA.name, a] : [playerB.name, b];
  if (lead === total) return `${leadName} takes all ${total} rows.`;
  return `${leadName} takes ${lead} rows of ${total}.`;
}

function renderPair({ a, b, slug }, hasCard) {
  const url = `${SITE}/duel/${slug}/`;
  const title = `${a.name} v ${b.name}`;
  const ogImage = hasCard ? `${url}og.png` : `${SITE}/og.jpg`;
  const shareScript = shareScriptTag(url, `${title} · The ARCHV`);
  const description = clampDescription(
    `${title}, ${competition.label} ${competition.season}, side by side. ${verdictLine(a, b)} Every figure sourced.`,
  );

  const pageCsp = cspMeta({
    scripts: [MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH, scriptHash(extractScriptBody(shareScript))],
    posthog: true,
    googleFonts: true,
  });

  const others = pairs
    .filter((p) => p.slug !== slug && (p.a.id === a.id || p.b.id === a.id || p.a.id === b.id || p.b.id === b.id))
    .slice(0, 6);

  return `${documentShell({
  title: clampTitle([title, `${competition.label} ${competition.season}`, "The ARCHV"]),
  // `description` is already clampDescription'd where it is built, above.
  metaDescription: description,
  description,
  socialTitle: title,
  robots: ROBOTS_INDEXABLE,
  canonical: url,
  ogUrl: url,
  ogType: "website",
  // This page's OWN card, with the stat rows and the split bars drawn on the image, when
  // satori produced one; the site-wide /og.jpg when it did not. A card failure never fails
  // the build, so both branches are live.
  ogImage,
  ogImageAlt: `${title}: ${competition.label} ${competition.season} goals, assists and goal involvements side by side.`,
  // Per-page CSP: the share row's inline script embeds THIS page's url and title, so its
  // hash is not constant across the family.
  csp: pageCsp,
  extraHead: [percentileBarStyles(), duelStyles()],
  jsonLd: {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        name: `${title} \u00b7 The ARCHV`,
        description,
        url,
        inLanguage: "en-GB",
        isPartOf: { "@type": "WebSite", name: "The ARCHV", url: `${SITE}/` },
        about: [a, b].map((p) => ({ "@type": "Person", name: p.name, nationality: p.nationality, affiliation: { "@type": "SportsTeam", name: p.club } })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "Player duels", item: `${SITE}/duel/` },
          { "@type": "ListItem", position: 3, name: title, item: url },
        ],
      },
    ],
  },
})}
<body>
  ${masthead()}
  <main class="wrap wrap--wide">
    <section class="duel-wrap">
      <p class="breadcrumb"><a href="/">The ARCHV</a> / <a href="/duel/">Player duels</a></p>
      <p class="duel-eyebrow">Player duel</p>
      <h1>${esc(title)}</h1>
      <p class="duel-scope">${esc(SCOPE_LINE)}</p>

      <div class="share" aria-label="Share this duel">
        <button class="btn btn--ghost" id="duel-share" type="button" hidden>Share</button>
        <button class="btn btn--ghost" id="duel-copy" type="button">Copy link</button>
      </div>

      <div class="duel-heads">
        ${[a, b].map((p, i) => `<div class="duel-head">
          ${headFigure(p)}
          <p class="duel-head__name">${esc(p.name)}</p>
          <p class="duel-head__club">${esc(p.club)} · ${esc(p.position)}</p>
          ${p.line ? `<p class="duel-head__line">${esc(p.line)}</p>` : ""}
        </div>${i === 0 ? '<span class="duel-v" aria-hidden="true">v</span>' : ""}`).join("\n        ")}
      </div>

      <p class="duel-verdict">${esc(verdictLine(a, b))} ${esc(PAIR_INTRO)}</p>
      <p class="duel-scope">${esc(POOL_NOTE)}</p>

      <ul class="duel-rows">
        ${metrics.map((m) => statRow(m, a, b)).filter(Boolean).join("\n        ")}
      </ul>

      ${omitted.length ? `<section class="duel-missing">
        <h2>What is not on this card</h2>
        <p>Two sources that disagree kill the number. These came off for that reason.</p>
        <ul>
          ${omitted.map((o) => `<li>${esc(o.metric)}. ${esc(o.reason)}</li>`).join("\n          ")}
        </ul>
      </section>` : ""}

      <section class="duel-sources">
        <h2>Sources</h2>
        <ul>
          ${Object.values(sources).map((s) => `<li>${esc(s.name)}, ${esc(s.detail)}. Checked ${esc(longDate(s.retrieved))}. <a href="${escAttr(s.url)}" target="_blank" rel="noopener noreferrer nofollow">Link</a></li>`).join("\n          ")}
        </ul>
      </section>

      ${others.length ? `<section class="related">
        <h2>More duels</h2>
        <ul class="duel-grid">
          ${others.map((p) => `<li><a href="${p.href}">${esc(p.a.name)} v ${esc(p.b.name)}<span class="duel-grid__sub">${esc(p.a.club)} · ${esc(p.b.club)}</span></a></li>`).join("\n          ")}
        </ul>
        <a class="related__all" href="/duel/">All duels &rarr;</a>
      </section>` : ""}
    </section>
  </main>
  ${footer()}
  ${shareScript}
</body>
</html>
`;
}

/* ---------- index page ---------- */
function pickerScriptTag(playerIds) {
  return `<script>
    (function () {
      var ids = ${jsLiteral(playerIds)};
      var one = document.getElementById('duel-p1');
      var two = document.getElementById('duel-p2');
      var go = document.getElementById('duel-go');
      var note = document.getElementById('duel-note');

      function target(a, b) {
        if (!a || !b || a === b) return null;
        if (ids.indexOf(a) < 0 || ids.indexOf(b) < 0) return null;
        return '/duel/' + [a, b].sort().join('-v-') + '/';
      }

      // /duel/?p1=x&p2=y is a first-class entry point: it resolves straight to the pre-rendered
      // pair page, which is the one that carries the share card. Anything unrecognised is left
      // alone so the visitor lands on the picker rather than a 404.
      var params = new URLSearchParams(window.location.search);
      var fromQuery = target(params.get('p1'), params.get('p2'));
      if (fromQuery) {
        window.location.replace(fromQuery);
        return;
      }
      if (params.get('p1') || params.get('p2')) {
        if (note) note.textContent = 'That pair is not in the set yet. Pick two from the list.';
      }

      function submit() {
        var href = target(one && one.value, two && two.value);
        if (!href) {
          if (note) note.textContent = 'Pick two different players.';
          return;
        }
        if (window.posthog) posthog.capture('duel_compare', { p1: one.value, p2: two.value });
        window.location.href = href;
      }

      if (go) go.addEventListener('click', submit);
      [one, two].forEach(function (el) {
        if (!el) return;
        el.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
      });
    })();
  </script>`;
}

function renderIndex(players) {
  const url = `${SITE}/duel/`;
  const script = pickerScriptTag(players.map((p) => p.id));
  const pageCsp = cspMeta({
    scripts: [MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH, scriptHash(extractScriptBody(script))],
    posthog: true,
    googleFonts: true,
  });
  const options = (selected) =>
    players
      .map((p) => `<option value="${escAttr(p.id)}"${p.id === selected ? " selected" : ""}>${esc(p.name)} (${esc(p.club)})</option>`)
      .join("\n            ");

  return `${documentShell({
  title: clampTitle(["Player duels", `${competition.label} ${competition.season}`, "The ARCHV"]),
  metaDescription: clampDescription(INDEX_LEDE),
  description: clampDescription(INDEX_LEDE),
  socialTitle: "Player duels \u00b7 The ARCHV",
  robots: ROBOTS_INDEXABLE,
  canonical: url,
  ogUrl: url,
  ogType: "website",
  ogImage: `${SITE}/og.jpg`,
  // Per-page CSP: the picker's inline script carries this build's player id list.
  csp: pageCsp,
  extraHead: [percentileBarStyles(), duelStyles()],
  jsonLd: {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: "Player duels \u00b7 The ARCHV",
        description: INDEX_LEDE,
        url,
        inLanguage: "en-GB",
        isPartOf: { "@type": "WebSite", name: "The ARCHV", url: `${SITE}/` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "Player duels", item: url },
        ],
      },
    ],
  },
})}
<body>
  ${masthead()}
  <main class="wrap wrap--wide">
    <section class="duel-wrap">
      <p class="breadcrumb"><a href="/">The ARCHV</a> / Player duels</p>
      <p class="duel-eyebrow">Player duels</p>
      <h1>Player duels</h1>
      <p class="duel-lede">${esc(INDEX_LEDE)}</p>
      <p class="duel-scope">${esc(SCOPE_LINE)}</p>

      <div class="duel-picker">
        <div class="duel-picker__field">
          <label for="duel-p1">First player</label>
          <select id="duel-p1">
            ${options(players[0].id)}
          </select>
        </div>
        <div class="duel-picker__field">
          <label for="duel-p2">Second player</label>
          <select id="duel-p2">
            ${options(players[1].id)}
          </select>
        </div>
        <button type="button" id="duel-go">Compare</button>
        <p class="duel-picker__hint" id="duel-note">${esc(INDEX_NOTE)}</p>
      </div>

      <h2 class="duel-head__name" style="text-align:left">Every pairing</h2>
      <ul class="duel-grid">
        ${pairs.map((p) => `<li><a href="${p.href}">${esc(p.a.name)} v ${esc(p.b.name)}<span class="duel-grid__sub">${esc(p.a.club)} · ${esc(p.b.club)}</span></a></li>`).join("\n        ")}
      </ul>

      ${omitted.length ? `<section class="duel-missing">
        <h2>What is not on these cards</h2>
        <p>Two sources that disagree kill the number. These came off for that reason.</p>
        <ul>
          ${omitted.map((o) => `<li>${esc(o.metric)}. ${esc(o.reason)}</li>`).join("\n          ")}
        </ul>
      </section>` : ""}

      <section class="duel-sources">
        <h2>Sources</h2>
        <ul>
          ${Object.values(sources).map((s) => `<li>${esc(s.name)}, ${esc(s.detail)}. Checked ${esc(longDate(s.retrieved))}. <a href="${escAttr(s.url)}" target="_blank" rel="noopener noreferrer nofollow">Link</a></li>`).join("\n          ")}
        </ul>
      </section>
    </section>
  </main>
  ${footer()}
  ${script}
</body>
</html>
`;
}

/* ---------- write ---------- */
const players = data.players;
mkdirSync(join(OUT, "duel"), { recursive: true });
writeFileSync(join(OUT, "duel", "index.html"), renderIndex(players));

let cards = 0;
for (const pair of pairs) {
  const dir = join(OUT, "duel", pair.slug);
  mkdirSync(dir, { recursive: true });

  let hasCard = false;
  try {
    const png = await ogCard(pair.a, pair.b);
    writeFileSync(join(dir, "og.png"), png);
    hasCard = true;
    cards++;
  } catch (err) {
    console.warn(`[build-duel-pages] og card failed for ${pair.slug}: ${err && err.message ? err.message : err}`);
  }

  writeFileSync(join(dir, "index.html"), renderPair(pair, hasCard));
}

console.log(`[build-duel-pages] provider "${providerName}": ${players.length} player(s), ${pairs.length} duel page(s), ${cards} share card(s) to ${OUT}/duel/`);
