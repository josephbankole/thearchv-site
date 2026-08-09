/* public/search/search.js — the whole of site search, client side.
 *
 * WHY IT LOOKS LIKE THIS. thearchv.ca is static files on GitHub Pages: no server, no database,
 * nothing to query. So the index is built at build time (scripts/build-search.mjs writes
 * /search-index.json) and the matching happens here, in the reader's browser, over a few tens of
 * kilobytes of JSON. No third-party search service, no API key, nothing that can start charging
 * or go down independently of the site.
 *
 * IT IS A PLAIN FILE, NOT AN INLINE SCRIPT, AND THAT IS THE POINT. Every page on this site ships
 * a strict CSP with script-src 'self' plus an exact sha256 per inline block. An inline search
 * client would need its own hash on a page whose content changes with the index; a file under
 * 'self' needs nothing. See scripts/verify-csp-pages.mjs, which checks /search/ like every other
 * page family. It is copied verbatim from public/ by Vite; the page loads it with a ?v= built
 * from its own contents so a change is never served stale.
 *
 * No framework, no dependencies, no build step of its own.
 */
(function () {
  'use strict';

  var root = document.getElementById('search');
  if (!root) return;

  var form = document.getElementById('search-form');
  var input = document.getElementById('search-q');
  var status = document.getElementById('search-status');
  var results = document.getElementById('search-results');
  var browse = document.getElementById('search-browse');
  if (!form || !input || !status || !results) return;

  var INDEX_URL = root.getAttribute('data-index') || '/search-index.json';
  var MAX_RESULTS = 40;

  var docs = null;      // the loaded index, decorated with lowercase haystacks
  var loading = null;   // in-flight promise, so ten keystrokes cause one fetch
  var lastQuery = null;

  /* ---------- tokens ----------
     Lowercase, strip anything that is not a letter, a digit or a space, collapse the rest.
     Accents are folded so "Mbappe" finds "Mbappé": the index normalises the same way, and a
     reader typing a name on a phone keyboard should not have to produce the diacritic. */
  function fold(s) {
    var out = String(s == null ? '' : s).toLowerCase();
    if (out.normalize) out = out.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return out.replace(/[^a-z0-9\s]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /* A length-preserving fold, used only to locate matches for highlighting. One character in,
     one character out: lowercase, then every character that is not a-z or 0-9 becomes a space.
     It cannot strip accents (that changes length), so an accented word simply goes unhighlighted
     rather than highlighting the wrong span. Offsets from this string index the original text
     exactly, which is the only reason it exists. */
  function foldFlat(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, ' ');
  }

  function tokens(s) {
    var f = fold(s);
    return f ? f.split(' ') : [];
  }

  /* ---------- scoring ----------
     Every query token has to appear somewhere in the document, so a two-word query narrows
     rather than widens. Where it appears decides the score: a whole word in the title beats a
     prefix in the title, which beats the standfirst, which beats the desk name. The date is the
     tie-breaker, newest first, because this is an archive that files daily and two entries can
     legitimately be about the same thing.

     Deliberately not a fuzzy match. On a corpus this size a spelling-tolerant matcher mostly
     produces confident wrong answers, and "no results" is a more useful thing to be told. */
  function score(doc, qTokens) {
    var total = 0;
    for (var i = 0; i < qTokens.length; i++) {
      var t = qTokens[i];
      var hit = 0;
      if (doc._tw.indexOf(t) !== -1) hit = 10;
      else if (doc._t.indexOf(t) !== -1) hit = 6;
      else if (doc._dw.indexOf(t) !== -1) hit = 4;
      else if (doc._d.indexOf(t) !== -1) hit = 2;
      else if (doc._l.indexOf(t) !== -1) hit = 2;
      if (!hit) return 0; // every token must land somewhere
      total += hit;
    }
    return total;
  }

  function prepare(raw) {
    return (raw.docs || []).map(function (d) {
      var t = fold(d.title);
      var dek = fold(d.dek);
      return {
        title: d.title,
        dek: d.dek,
        url: d.url,
        lane: d.lane,
        date: d.date || '',
        _t: t,
        _tw: ' ' + t + ' ',
        _d: dek,
        _dw: ' ' + dek + ' ',
        // The lane name and the date share one haystack. The date is in it because the page says
        // a reader can search by year, and a claim on the page has to be true of the code.
        _l: fold(d.lane + ' ' + (d.date || ''))
      };
    });
  }

  function load() {
    if (docs) return Promise.resolve(docs);
    if (loading) return loading;
    loading = fetch(INDEX_URL, { credentials: 'same-origin' })
      .then(function (r) {
        if (!r.ok) throw new Error('index ' + r.status);
        return r.json();
      })
      .then(function (raw) {
        docs = prepare(raw);
        return docs;
      });
    return loading;
  }

  /* ---------- rendering ----------
     Built with createElement and textContent throughout. The index is our own build output, but
     a search page that assembled result markup by string concatenation would be one bad entry
     away from putting a headline into the DOM as markup, so it never does. <mark> is added by
     splitting the text node around matches, not by writing HTML. */
  function markInto(el, text, qTokens) {
    var folded = foldFlat(text);
    // A case-folding that changed length would put every offset out by one, so the guard stays
    // even though foldFlat is written to be 1:1.
    if (!qTokens.length || !folded || folded.length !== text.length) {
      el.appendChild(document.createTextNode(text));
      return;
    }
    var ranges = [];
    for (var i = 0; i < qTokens.length; i++) {
      var t = qTokens[i];
      var from = 0;
      var at;
      while ((at = folded.indexOf(t, from)) !== -1) {
        ranges.push([at, at + t.length]);
        from = at + t.length;
      }
    }
    if (!ranges.length) {
      el.appendChild(document.createTextNode(text));
      return;
    }
    ranges.sort(function (a, b) { return a[0] - b[0]; });
    var merged = [ranges[0]];
    for (var j = 1; j < ranges.length; j++) {
      var last = merged[merged.length - 1];
      if (ranges[j][0] <= last[1]) last[1] = Math.max(last[1], ranges[j][1]);
      else merged.push(ranges[j]);
    }
    var cursor = 0;
    for (var k = 0; k < merged.length; k++) {
      if (merged[k][0] > cursor) el.appendChild(document.createTextNode(text.slice(cursor, merged[k][0])));
      var mark = document.createElement('mark');
      mark.textContent = text.slice(merged[k][0], merged[k][1]);
      el.appendChild(mark);
      cursor = merged[k][1];
    }
    if (cursor < text.length) el.appendChild(document.createTextNode(text.slice(cursor)));
  }

  /* "9 Aug 2026", the same short form the front-page cards use. The index carries the ISO date
     because that is what sorts and what the year search matches; a result row printing
     2026-08-09 at a reader would be the one place on the site that does. Formatted by hand
     rather than through toLocaleDateString, which would apply the reader's own timezone to a
     date-only value and slide it a day for anyone behind UTC. */
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function shortDate(iso) {
    var parts = String(iso).split('-');
    var month = MONTHS[parseInt(parts[1], 10) - 1];
    if (parts.length < 3 || !month) return iso;
    return parseInt(parts[2], 10) + ' ' + month + ' ' + parts[0];
  }

  function row(doc, qTokens) {
    var li = document.createElement('li');
    li.className = 'sresult';

    var a = document.createElement('a');
    a.className = 'sresult__link';
    a.href = doc.url;

    var kicker = document.createElement('span');
    kicker.className = 'sresult__kicker';
    kicker.textContent = doc.date ? doc.lane + ' \u00b7 ' + shortDate(doc.date) : doc.lane;
    a.appendChild(kicker);

    var h = document.createElement('span');
    h.className = 'sresult__headline';
    markInto(h, doc.title, qTokens);
    a.appendChild(h);

    if (doc.dek) {
      var d = document.createElement('span');
      d.className = 'sresult__dek';
      markInto(d, doc.dek, qTokens);
      a.appendChild(d);
    }

    li.appendChild(a);
    return li;
  }

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function show(query) {
    var qTokens = tokens(query);
    clear(results);

    if (!qTokens.length) {
      status.textContent = '';
      if (browse) browse.hidden = false;
      return;
    }
    if (browse) browse.hidden = true;

    var hits = [];
    for (var i = 0; i < docs.length; i++) {
      var s = score(docs[i], qTokens);
      if (s > 0) hits.push({ doc: docs[i], s: s });
    }
    hits.sort(function (a, b) {
      if (b.s !== a.s) return b.s - a.s;
      if (a.doc.date === b.doc.date) return a.doc.title < b.doc.title ? -1 : 1;
      return a.doc.date < b.doc.date ? 1 : -1;
    });

    if (!hits.length) {
      status.textContent = 'Nothing in the archive matches “' + query + '”. Try one word, or a surname.';
      return;
    }

    var shown = Math.min(hits.length, MAX_RESULTS);
    status.textContent =
      hits.length === 1
        ? '1 result for “' + query + '”.'
        : hits.length > MAX_RESULTS
          ? hits.length + ' results for “' + query + '”. The closest ' + shown + ' are below.'
          : hits.length + ' results for “' + query + '”.';

    var frag = document.createDocumentFragment();
    for (var j = 0; j < shown; j++) frag.appendChild(row(hits[j].doc, qTokens));
    results.appendChild(frag);
  }

  function run(query, pushUrl) {
    if (query === lastQuery) return;
    lastQuery = query;
    if (pushUrl && window.history && window.history.replaceState) {
      var next = query ? '/search/?q=' + encodeURIComponent(query) : '/search/';
      window.history.replaceState(null, '', next);
    }
    if (!query) {
      if (docs) show('');
      else { clear(results); status.textContent = ''; if (browse) browse.hidden = false; }
      return;
    }
    load().then(
      function () { if (lastQuery === query) show(query); },
      function () {
        status.textContent = 'The search index did not load. Reload the page, or browse the desks below.';
        if (browse) browse.hidden = false;
      }
    );
  }

  var timer = null;
  input.addEventListener('input', function () {
    var value = input.value;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { run(value.trim(), true); }, 140);
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (timer) clearTimeout(timer);
    lastQuery = null;
    run(input.value.trim(), true);
  });

  // Deep links. /search/?q=... is a real, shareable URL: GitHub Pages serves the same page for
  // any query string, and the client reads it on load. Also fetch the index eagerly once the
  // page is idle, so the first keystroke does not wait on a network round trip.
  var initial = '';
  try {
    var m = window.location.search.match(/[?&]q=([^&]*)/);
    if (m) initial = decodeURIComponent(m[1].replace(/\+/g, ' ')).trim();
  } catch (e) { initial = ''; }

  if (initial) {
    input.value = initial;
    run(initial, false);
  } else if (window.requestIdleCallback) {
    window.requestIdleCallback(function () { load().catch(function () {}); });
  } else {
    setTimeout(function () { load().catch(function () {}); }, 1200);
  }

  // The page exists to be typed into, so the caret starts in the field. preventScroll keeps a
  // deep link from jumping the masthead off the top of the viewport on the way in.
  input.focus({ preventScroll: true });
})();
