/* build-archive-game.mjs — the daily archive game at /guess/.
 *
 * One historical player a day, four clues, five guesses, streak kept in localStorage. The clue
 * ladder is nationality and position, then the years he played, then his clubs, then the shirt he
 * is remembered in.
 *
 * WHY THIS AND NOT ANOTHER STATS TOY. The comparison product ARCHV is answering holds nothing
 * before the current season, so it can never ask you to name a player from 1994. This is the
 * archive doing work nobody else here can do, and it costs no editorial time per day.
 *
 * DATA is scripts/data/football/archive-players.json, sourced from Wikidata (CC0, no attribution
 * required, credited anyway). Nothing here is a live feed and nothing here goes stale.
 *
 * NO SERVER, AND NO CHEATING BY DESIGN. The puzzle index is derived from the date, so every
 * visitor gets the same one without a back end. The answers are in the page, because on a static
 * host they always are. They are base64'd so a casual look at the source does not spoil the week,
 * which is honest about what that does: it stops a glance, not a determined reader.
 *
 * ONE IMAGE-FREE PAGE, DELIBERATELY. There are no illustrated headshots banked for most of these
 * players, and inventing a face from text is forbidden. Type carries the whole thing instead. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SITE, esc, escAttr, clampTitle, clampDescription,
  masthead, footer, documentShell, ROBOTS_INDEXABLE,
  cspMeta, scriptHash, extractScriptBody, jsLiteral, MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH,
} from "./shared/page-shell.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.CONTENT_OUT || join(ROOT, "dist");
const URL_PATH = "/guess/";
const PAGE_URL = `${SITE}${URL_PATH}`;

const data = JSON.parse(readFileSync(join(ROOT, "scripts", "data", "football", "archive-players.json"), "utf8"));

// A game needs players and a start date. Without the first, `day % 0` is NaN, `PUZZLES[NaN]` is
// undefined and the whole IIFE dies on the first clue read; without the second, `Date.parse` is NaN
// and every day resolves to the same nothing. Either way the build prints a cheerful "wrote /guess/
// with 0 puzzle(s)", exits 0, passes verify-csp-pages, and ships a dead page with a console error.
// Fail here instead, the same way build-duel-pages.mjs refuses a one-player roster.
if (!Array.isArray(data.players) || data.players.length === 0) {
  throw new Error(
    `[build-archive-game] archive-players.json has ${data.players?.length ?? 0} player(s); the daily game needs at least one.`,
  );
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data.epoch || ""))) {
  throw new Error(
    `[build-archive-game] archive-players.json has epoch ${JSON.stringify(data.epoch)}; it must be a YYYY-MM-DD date, because the day index is counted from it.`,
  );
}

/* ---------- puzzle payload ----------
   Only what the game needs, in clue order, with the answer strings encoded. The `note` is the
   line shown once the round is over, so it is encoded too. */
const b64 = (s) => Buffer.from(String(s), "utf8").toString("base64");

const puzzles = data.players.map((p) => ({
  n: b64(p.name),
  a: p.accept.map((x) => b64(x)),
  c: [p.nationality, p.position].join(" · "),
  e: p.era,
  k: p.clubs.join(", "),
  s: String(p.shirt),
  z: b64(p.note),
}));

const LEDE =
  "One player from the archive, every day. Four clues, five guesses, and a streak that holds until midnight or does not. Every answer is a career that finished long before this season started.";

/* ---------- the game script ----------
   Everything interpolated into the script body goes through page-shell.mjs's `jsLiteral`, which
   escapes `<`, exactly as the JSON-LD block further down does and as build-duel-pages.mjs does.
   Only `n`, `a` and `z` are base64'd; the clue fields are raw Wikidata strings, so a club or era
   carrying a closing script tag would end the element early and turn the rest of the payload into
   markup INSIDE the hashed script the CSP allows. Nothing in the current 30 rows contains an angle
   bracket; the data source is external and the file is meant to grow. */
function gameScriptTag() {
  return `<script>
    (function () {
      var PUZZLES = ${jsLiteral(puzzles)};
      var EPOCH = ${jsLiteral(data.epoch)};
      var MAX_GUESSES = 5;
      var STORE = 'archv-guess-v1';

      function decode(s) {
        try { return decodeURIComponent(escape(window.atob(s))); } catch (e) { return window.atob(s); }
      }

      // The day index, in UTC, so a puzzle changes at the same instant everywhere and two people
      // arguing about it in different time zones are arguing about the same player.
      function todayKey() {
        var d = new Date();
        return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
      }
      function dayBefore(key) {
        var d = new Date(Date.parse(key + 'T00:00:00Z') - 86400000);
        return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
      }
      function dayNumber() {
        var start = Date.parse(EPOCH + 'T00:00:00Z');
        var now = Date.parse(todayKey() + 'T00:00:00Z');
        return Math.floor((now - start) / 86400000);
      }

      var day = dayNumber();
      var index = ((day % PUZZLES.length) + PUZZLES.length) % PUZZLES.length;
      var puzzle = PUZZLES[index];
      var edition = day + 1;

      var CLUES = [
        { label: 'Nationality and position', value: puzzle.c },
        { label: 'Years he played', value: puzzle.e },
        { label: 'Clubs', value: puzzle.k },
        { label: 'The shirt he is remembered in', value: puzzle.s }
      ];

      // Normalise hard enough that "Suker", "Šuker" and "davor suker" are the same answer, and
      // loose enough that a stray full stop does not cost someone their streak.
      function normalise(s) {
        return String(s || '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\\u0300-\\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, ' ')
          .trim();
      }
      var answers = puzzle.a.map(function (x) { return normalise(decode(x)); });
      function isRight(guess) {
        var g = normalise(guess);
        if (!g) return false;
        return answers.indexOf(g) >= 0;
      }

      function loadState() {
        try {
          var raw = window.localStorage.getItem(STORE);
          if (!raw) return null;
          return JSON.parse(raw);
        } catch (e) { return null; }
      }
      function saveState(state) {
        try { window.localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {}
      }

      var state = loadState() || { streak: 0, best: 0, played: 0, solved: 0 };
      var today = todayKey();
      // Records written before mid-round saving existed only ever set day on a finished round, so a
      // stored win's day IS its streak day. Migrate once, before anything else touches state.
      if (state.streakDay === undefined && state.day && state.done && state.won) state.streakDay = state.day;

      // The round is its own object, never an alias of the stored stats. Aliasing them is how a
      // page refresh quietly counts the same day twice and inflates a streak.
      var resumed = state.day === today;
      var round = {
        guesses: resumed && state.guesses ? state.guesses.slice() : [],
        clues: resumed && state.clues ? state.clues : 1,
        done: resumed ? !!state.done : false,
        won: resumed ? !!state.won : false
      };

      // Mid-round save. Without it a refresh handed the player five fresh guesses and clue 1 again,
      // because state.day was only written when a round ENDED, so resumed could never be true
      // for a round in progress. Stats stay out of here: played, solved and the streak are only
      // ever touched in finish(), so a resumed round is never counted twice.
      function persistRound() {
        state.day = today;
        state.guesses = round.guesses;
        state.clues = round.clues;
        state.done = false;
        state.won = false;
        saveState(state);
      }

      var elEdition = document.getElementById('g-edition');
      var elClues = document.getElementById('g-clues');
      var elForm = document.getElementById('g-form');
      var elInput = document.getElementById('g-input');
      var elSubmit = document.getElementById('g-submit');
      var elSkip = document.getElementById('g-skip');
      var elGuesses = document.getElementById('g-guesses');
      var elResult = document.getElementById('g-result');
      var elStreak = document.getElementById('g-streak');
      var elBest = document.getElementById('g-best');
      var elShare = document.getElementById('g-share');
      var elLeft = document.getElementById('g-left');

      function renderClues() {
        elClues.innerHTML = '';
        for (var i = 0; i < CLUES.length; i++) {
          var li = document.createElement('li');
          li.className = 'clue' + (i < round.clues ? '' : ' clue--locked');
          var label = document.createElement('span');
          label.className = 'clue__label';
          label.textContent = 'Clue ' + (i + 1) + ' · ' + CLUES[i].label;
          var value = document.createElement('span');
          value.className = 'clue__value';
          value.textContent = i < round.clues ? CLUES[i].value : 'Locked';
          li.appendChild(label);
          li.appendChild(value);
          elClues.appendChild(li);
        }
      }

      function renderGuesses() {
        elGuesses.innerHTML = '';
        for (var i = 0; i < round.guesses.length; i++) {
          var li = document.createElement('li');
          li.className = 'guess' + (round.won && i === round.guesses.length - 1 ? ' guess--right' : '');
          li.textContent = round.guesses[i];
          elGuesses.appendChild(li);
        }
        var left = MAX_GUESSES - round.guesses.length;
        elLeft.textContent = round.done ? '' : (left === 1 ? 'One guess left.' : left + ' guesses left.');
      }

      function renderStats() {
        elStreak.textContent = String(state.streak || 0);
        elBest.textContent = String(state.best || 0);
      }

      function finish(won, restoring) {
        round.done = true;
        round.won = won;
        if (!restoring) {
          state.day = today;
          state.guesses = round.guesses;
          state.done = true;
          state.won = won;
          state.clues = round.clues;
          state.played = (state.played || 0) + 1;
          if (won) {
            state.solved = (state.solved || 0) + 1;
            // A streak is consecutive days or it is not a streak. streakDay is the day of the
            // last win that counted; anything older than yesterday starts again at 1. It is a
            // separate field from day, because day now moves the moment a round is opened.
            state.streak = state.streakDay === dayBefore(today) ? (state.streak || 0) + 1 : 1;
            state.streakDay = today;
            if (state.streak > (state.best || 0)) state.best = state.streak;
          } else {
            state.streak = 0;
            state.streakDay = null;
          }
          saveState(state);
        }

        elForm.hidden = true;
        elResult.hidden = false;
        var name = decode(puzzle.n);
        var head = document.createElement('p');
        head.className = 'result__head';
        head.textContent = won
          ? 'Right. ' + name + ', on clue ' + round.clues + ' of 4.'
          : 'It was ' + name + '.';
        var note = document.createElement('p');
        note.className = 'result__note';
        note.textContent = decode(puzzle.z);
        elResult.innerHTML = '';
        elResult.appendChild(head);
        elResult.appendChild(note);
        elResult.appendChild(elShare);
        elShare.hidden = false;
        renderStats();
        if (window.posthog) posthog.capture('archive_guess_done', { won: won, clues: round.clues, guesses: round.guesses.length, edition: edition });
      }

      function shareText() {
        return 'The ARCHV · Daily Archive #' + edition + '\\n' +
          (round.won ? 'Solved on clue ' + round.clues + ' of 4.' : 'Missed it. Four clues were not enough.') +
          '\\n' + ${jsLiteral(PAGE_URL)};
      }

      function submit(guess) {
        if (round.done) return;
        var value = String(guess || '').trim();
        if (!value) return;
        round.guesses.push(value);
        if (isRight(value)) {
          renderGuesses();
          finish(true);
          return;
        }
        if (round.guesses.length >= MAX_GUESSES) {
          renderGuesses();
          finish(false);
          return;
        }
        if (round.clues < CLUES.length) round.clues++;
        persistRound();
        renderClues();
        renderGuesses();
        elInput.value = '';
        elInput.focus();
      }

      elForm.addEventListener('submit', function (e) {
        e.preventDefault();
        submit(elInput.value);
      });
      elSkip.addEventListener('click', function () {
        if (round.done) return;
        submit('(skipped)');
      });
      elShare.addEventListener('click', function () {
        var text = shareText();
        var done = function () {
          elShare.textContent = 'Result copied';
          setTimeout(function () { elShare.textContent = 'Copy result'; }, 2000);
          if (window.posthog) posthog.capture('archive_guess_share', { edition: edition });
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(function () {});
        }
      });

      elEdition.textContent = '#' + edition;
      renderClues();
      renderGuesses();
      renderStats();
      if (round.done) finish(round.won, true);
      if (window.posthog) posthog.capture('archive_guess_open', { edition: edition, resumed: resumed });
    })();
  </script>`;
}

function gameStyles() {
  return `<style>
    .game { padding: 1.6rem 0 1rem; max-width: 38rem; }
    .game__eyebrow { color: var(--gold); font-size: .78rem; letter-spacing: .16em; text-transform: uppercase; margin: 0 0 .6rem; display: flex; gap: .6rem; }
    .game__lede { color: var(--cream-dim); font-size: 1.05rem; margin: 0 0 1.8rem; }

    .clues { list-style: none; padding: 0; margin: 0 0 1.6rem; display: grid; gap: .6rem; }
    .clue { display: flex; flex-direction: column; gap: .25rem; padding: .85rem 1rem; border: 1px solid var(--rule); border-radius: .6rem; background: var(--bg); }
    /* The locked state used to be opacity .45 on the whole row. That is a legibility bug wearing
       a dimmer's clothes: the alpha multiplies through the text as well as the furniture, and it
       landed the word "Locked" at 2.15:1 on white, well under the 4.5:1 floor. The inactive
       affordance now lives on the row's own furniture — a lighter border and the sunken ground —
       and the value keeps a real text token. Measured: --ink-muted on --bg-sunken is 5.16:1. */
    .clue--locked { border-color: var(--rule-soft); background: var(--bg-sunken); }
    .clue__label { font-size: .68rem; letter-spacing: .13em; text-transform: uppercase; color: var(--accent-ink); }
    .clue--locked .clue__label { color: var(--ink-muted); }
    .clue__value { color: var(--ink); font-size: 1.02rem; line-height: 1.4; }
    .clue--locked .clue__value { color: var(--ink-muted); font-style: italic; }

    .game__form { display: flex; flex-wrap: wrap; gap: .6rem; margin: 0 0 .8rem; }
    /* An author rule that sets display beats the browser's own [hidden] rule, so hiding the form
       after the round ends has to be spelled out here or the guess box stays on screen. */
    .game__form[hidden] { display: none; }
    .game__form input { font: inherit; flex: 1 1 12rem; min-width: 0; color: var(--cream); background: var(--navy-deep); border: 1px solid var(--gold-soft); border-radius: .5rem; padding: .65rem .8rem; }
    .game__form input:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
    .game__form button { font: inherit; font-size: .85rem; font-weight: 600; padding: .65rem 1.1rem; border-radius: .5rem; border: 0; cursor: pointer; }
    .game__go { background: var(--gold); color: var(--navy-deep); }
    .game__go:hover { filter: brightness(1.06); }
    .game__skip { background: transparent; color: var(--cream-dim); border: 1px solid var(--cream-faint) !important; }
    .game__skip:hover { color: var(--gold); border-color: var(--gold-soft) !important; }
    .game__left { font-size: .8rem; color: var(--cream-faint-text); margin: 0 0 1.2rem; }

    .guesses { list-style: none; padding: 0; margin: 0 0 1.4rem; display: grid; gap: .35rem; }
    .guess { padding: .5rem .8rem; border-radius: .45rem; border: 1px solid var(--cream-faint); font-size: .9rem; color: var(--cream-dim); }
    .guess--right { border-color: var(--gold); color: var(--gold); }

    .result { margin: 0 0 1.6rem; padding: 1.2rem 1.25rem; border: 1px solid var(--rule); border-radius: .7rem; background: var(--bg-sunken); box-shadow: var(--shadow-soft); }
    .result__head { color: var(--cream); font-family: "Fraunces", Georgia, serif; font-size: 1.25rem; line-height: 1.3; margin: 0 0 .5rem; }
    .result__note { font-size: .95rem; color: var(--cream-dim); margin: 0 0 1rem; }
    .result button { font: inherit; font-size: .85rem; font-weight: 600; padding: .55rem 1rem; border-radius: .5rem; border: 1px solid var(--gold-soft); background: transparent; color: var(--cream); cursor: pointer; }
    .result button:hover { border-color: var(--gold); color: var(--gold); }

    .streaks { display: flex; gap: 2rem; margin: 1.6rem 0 0; padding-top: 1.2rem; border-top: 1px solid var(--cream-faint); }
    .streaks div { display: flex; flex-direction: column; gap: .2rem; }
    .streaks dt { font-size: .68rem; letter-spacing: .13em; text-transform: uppercase; color: var(--cream-faint-text); }
    .streaks dd { margin: 0; font-family: "Fraunces", Georgia, serif; font-size: 1.8rem; color: var(--cream); }

    .game__credit { margin: 1.6rem 0 0; font-size: .78rem; color: var(--cream-faint-text); }
    .game__noscript { padding: 1rem 1.1rem; border: 1px solid var(--cream-faint); border-radius: .6rem; font-size: .9rem; color: var(--cream-dim); }
    .visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
  </style>`;
}

const script = gameScriptTag();
const pageCsp = cspMeta({
  scripts: [MASTHEAD_SCRIPT_HASH, POSTHOG_SCRIPT_HASH, scriptHash(extractScriptBody(script))],
  posthog: true,
  googleFonts: true,
});

const html = `${documentShell({
  title: clampTitle(["The Daily Archive", "guess the player", "The ARCHV"]),
  metaDescription: clampDescription(LEDE),
  description: clampDescription(LEDE),
  socialTitle: "The Daily Archive \u00b7 The ARCHV",
  robots: ROBOTS_INDEXABLE,
  canonical: PAGE_URL,
  ogUrl: PAGE_URL,
  ogType: "website",
  // No per-page art on purpose: most of these players have no banked illustrated head and
  // inventing a face is forbidden, so the game shares the site-wide card.
  ogImage: `${SITE}/og.jpg`,
  // Per-page CSP: the puzzle payload is an inline script carrying this build's clue data,
  // so its hash is not the family constant.
  csp: pageCsp,
  extraHead: [gameStyles()],
  jsonLd: {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Game",
        name: "The Daily Archive",
        description: LEDE,
        url: PAGE_URL,
        inLanguage: "en-GB",
        genre: "Football history quiz",
        numberOfPlayers: { "@type": "QuantitativeValue", minValue: 1, maxValue: 1 },
        publisher: { "@type": "Organization", name: "The ARCHV", url: `${SITE}/` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "The Daily Archive", item: PAGE_URL },
        ],
      },
    ],
  },
})}
<body>
  ${masthead()}
  <main class="wrap">
    <section class="game">
      <p class="breadcrumb"><a href="/">The ARCHV</a> / The Daily Archive</p>
      <p class="game__eyebrow">The Daily Archive <span id="g-edition"></span></p>
      <h1>Name the player</h1>
      <p class="game__lede">${esc(LEDE)}</p>

      <noscript>
        <p class="game__noscript">The game needs JavaScript, which is off in this browser. The rest of the site does not, so the archive is still open at <a href="/desk/transfer/">the desks</a>.</p>
      </noscript>

      <ol class="clues" id="g-clues"></ol>

      <form class="game__form" id="g-form" autocomplete="off">
        <label class="visually-hidden" for="g-input">Your guess</label>
        <input id="g-input" type="text" placeholder="Name the player" aria-describedby="g-left" />
        <button type="submit" class="game__go" id="g-submit">Guess</button>
        <button type="button" class="game__skip" id="g-skip">Next clue (uses a guess)</button>
      </form>
      <p class="game__left" id="g-left"></p>

      <ul class="guesses" id="g-guesses" aria-label="Your guesses so far"></ul>

      <div class="result" id="g-result" hidden>
        <button type="button" id="g-share" hidden>Copy result</button>
      </div>

      <dl class="streaks">
        <div><dt>Current streak</dt><dd id="g-streak">0</dd></div>
        <div><dt>Best streak</dt><dd id="g-best">0</dd></div>
      </dl>

      <p class="game__credit">Player facts from ${esc(data.source.name)}, released under ${esc(data.source.licence)}. No attribution is required for that licence. It is here anyway.</p>
    </section>
  </main>
  ${footer()}
  ${script}
</body>
</html>
`;

mkdirSync(join(OUT, "guess"), { recursive: true });
writeFileSync(join(OUT, "guess", "index.html"), html);
console.log(`[build-archive-game] wrote ${URL_PATH} with ${puzzles.length} puzzle(s) to ${OUT}`);
