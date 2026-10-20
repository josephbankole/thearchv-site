(function () {
  // Live scores client for /scores/. Inlined into the page by scripts/build-scores-page.mjs (the
  // CSP hash is computed from this exact text). Reads public JSON files and builds the DOM with
  // textContent only, so nothing from the feed is ever parsed as markup. scores.json is the live
  // window (yesterday to tomorrow); days/index.json and days/<date>.json are the history behind the
  // date menu, and ?date=YYYY-MM-DD in the address shows one past day.
  //
  // PANELS (2026-10-19). An open match with lineups or stats shows three panels side by side in a
  // scroll-snap track: Summary (goals, cards, top three ratings), Lineups (a pitch with a shirt per
  // player) and Team stats. A swipe moves between them; the tab row above does the same for mouse and
  // keyboard and follows the swipe. Rules that keep this working:
  // - The list and every open panel are rebuilt on each feed change, so the panel a reader is on
  //   (panelOf), the track's last height (heightOf) and the focused tab are put back after each rebuild,
  //   all in one pass, so the page does not jump. A rebuild waits while a finger is on a track.
  // - Nothing new carries data-id: the row toggle and ?match= look elements up by it.
  // - The track never carries a transform (trap 3 in the repo CLAUDE.md); its CSS is in
  //   build-scores-page.mjs.
  // - Never write a closing script tag or an HTML comment opener in this file or in scores-pitch.js;
  //   scores-script.mjs refuses both.
  var BASE = 'https://fpsfnhjxczzyqurzbqpt.supabase.co/storage/v1/object/public/live/';
  var POLL = 30000;
  var ORDER = ['premier-league', 'champions-league', 'wsl'];
  var NAMES = { 'premier-league': 'Premier League', 'champions-league': 'Champions League', 'wsl': "Women's Super League" };
  // Goals and cards only. Substitutions, VAR notes and missed penalties stay out.
  var SHOWN = { 'goal': 1, 'own-goal': 1, 'penalty-goal': 1, 'yellow': 1, 'red': 1, 'second-yellow': 1 };
  var EMPTY = 'No matches to show right now.';
  var EMPTY_DAY = 'No matches were recorded for this day.';
  var DOWN = 'Scores are not available right now. Try again in a moment.';
  var DOWN_DAY = 'That day is not available right now. Try again in a moment.';
  var LIVE_LABEL = 'Live and recent';
  var TZ = 'America/Edmonton'; // the editorial day: the feed files matches under the Edmonton date
  // The three panels, in swipe order. Lineups, Team stats and the lineup wording are the app's own
  // (thearchv-app Localizable.strings), so the two read the same.
  var TABS = ['Summary', 'Lineups', 'Team stats'];
  var PANEL_KEYS = { lineups: 1, stats: 2 }; // ?panel= on a ?match= link
  var NO_LINEUPS = 'Lineups are not available for this match.';
  var NO_STATS = 'Team stats are not available for this match.';
  var RATINGS_SOURCE = 'Ratings come from API-Football, not from The ARCHV.'; // D-2026-10-13a
  // Team stats rows: the app's order and labels, then the three the feed added on 2026-10-19.
  var STAT_ROWS = [
    ['possession', 'Possession'], ['shots', 'Shots'], ['shotsOnTarget', 'Shots on target'],
    ['corners', 'Corners'], ['fouls', 'Fouls'], ['offsides', 'Offsides'], ['yellow', 'Yellow cards'],
    ['red', 'Red cards'], ['xg', 'Expected goals'], ['saves', 'Saves'], ['passes', 'Passes'],
    ['passAccuracy', 'Pass accuracy']
  ];
  // A plain T-shirt on a 40 by 40 grid: no crest, no trim, no pattern, filled with the team's colour.
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var SHIRT = 'M14 4Q20 10 26 4L32 6L38 13L33 18L30 15.5V37H10V15.5L7 18L2 13L8 6Z';

  // @include scores-pitch.js

  var root = document.getElementById('scores');
  var stamp = document.getElementById('scores-updated');
  var nav = document.getElementById('scores-nav');
  var pick = document.getElementById('scores-date');
  var prevBtn = document.getElementById('scores-prev');
  var nextBtn = document.getElementById('scores-next');
  var liveBtn = document.getElementById('scores-live');
  var tzNote = document.getElementById('scores-tz');
  var announcer = document.getElementById('scores-status');
  if (!root) return;

  var matches = [], byId = {}, sig = '', haveData = false;
  var open = {}, details = {};
  // Per open match: the panel on show, the track's height when it last settled, and the live track.
  var panelOf = {}, heightOf = {}, tracks = {};
  // A finger on a track holds rebuilds back (touchedAt is when it went down, 0 when lifted and settled).
  var touchedAt = 0, touchTimer = 0, staleList = false, stalePanels = {};
  var pal = null;
  var timer = 0, pending = false;
  var live = null; // the last good scores.json
  var view = ''; // '' is the live window; otherwise the YYYY-MM-DD history day on show
  var days = []; // days/index.json, newest first: [{ date, count }]
  var dayCache = {};

  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function note(text) {
    var p = h('p', 'scores__note', text);
    root.textContent = '';
    root.appendChild(p);
  }

  function hm(d) { return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }
  function dayKey(d) { return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }
  function dayLabel(d) {
    var n = new Date();
    var k = dayKey(d);
    if (k === dayKey(n)) return 'Today';
    if (k === dayKey(new Date(n.getFullYear(), n.getMonth(), n.getDate() - 1))) return 'Yesterday';
    if (k === dayKey(new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1))) return 'Tomorrow';
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function clock(minute, extra) { return minute + (extra ? '+' + extra : '') + "'"; }

  // ----- history days. A day is a YYYY-MM-DD string on the Edmonton calendar, handled as plain
  // text or in UTC so the reader's own time zone never shifts it.
  function isDay(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var d = new Date(s + 'T00:00:00Z');
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }
  function edmontonToday() {
    var parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    var v = {};
    parts.forEach(function (p) { v[p.type] = p.value; });
    return v.year + '-' + v.month + '-' + v.day;
  }
  function addDay(s, n) {
    var p = s.split('-');
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)).toISOString().slice(0, 10);
  }
  function dayText(s) {
    var p = s.split('-');
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).toLocaleDateString('en-GB', {
      timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
    });
  }
  // The live window starts yesterday, so the history the live view does not already hold is older.
  function windowStart() { return addDay(edmontonToday(), -1); }
  // The day to step back to from the one on show: from the live view, the newest day before the
  // window; from a day, the next older one in the index. null when there is none.
  function earlier(cur) {
    var i, from = cur || windowStart();
    for (i = 0; i < days.length; i++) if (days[i].date < from) return days[i].date;
    return null;
  }
  // The day to step forward to: the next newer one in the index, or the live view once the next
  // one would be inside the live window. null on the live view itself.
  function later(cur) {
    if (!cur) return null;
    for (var i = days.length - 1; i >= 0; i--) {
      if (days[i].date > cur) return days[i].date < windowStart() ? days[i].date : '';
    }
    return '';
  }

  function statusText(m) {
    var s = m.status || {};
    var c = s.code;
    if (s.live) {
      if (c === 'HT') return 'HT';
      if (c === 'P') return 'Pens';
      if (c === 'BT') return 'Break';
      if (c === 'SUSP') return 'Halted';
      if (c === 'INT') return 'Paused';
      return s.minute != null ? clock(s.minute, s.extra) : 'Live';
    }
    if (s.finished) return c === 'AET' ? 'AET' : c === 'AWD' ? 'Awarded' : c === 'WO' ? 'W/O' : 'FT';
    if (c === 'PST') return 'Postponed';
    if (c === 'CANC') return 'Cancelled';
    var t = new Date(m.kickoff);
    return c === 'TBD' || isNaN(t.getTime()) ? 'TBC' : hm(t);
  }

  function scoreText(m) {
    var a = m.home && m.home.goals, b = m.away && m.away.goals;
    return a == null || b == null ? 'v' : a + ' – ' + b;
  }

  function row(m) {
    var live = !!(m.status && m.status.live);
    var canOpen = live || !!(m.status && m.status.finished);
    var el = h(canOpen ? 'button' : 'div', 'scores__row' + (live ? ' is-live' : ''));
    el.setAttribute('data-id', m.id);
    if (canOpen) {
      el.type = 'button';
      el.setAttribute('aria-expanded', open[m.id] ? 'true' : 'false');
      el.setAttribute('aria-controls', 'm-' + m.id);
    }
    var st = h('span', 'scores__status');
    if (live) st.appendChild(h('span', 'scores__dot'));
    st.appendChild(document.createTextNode(statusText(m)));
    var mid = h('span', 'scores__score', scoreText(m));
    var p = m.penalties;
    if (p && p.home != null && p.away != null) mid.appendChild(h('span', 'scores__pens', p.home + '-' + p.away + ' pens'));
    el.appendChild(st);
    el.appendChild(h('span', 'scores__home', m.home.name));
    el.appendChild(mid);
    el.appendChild(h('span', 'scores__away', m.away.name));
    el.appendChild(h('span', 'scores__caret'));
    return el;
  }

  function render() {
    var f = document.activeElement;
    var fid = f && f.getAttribute ? f.getAttribute('data-id') : null;
    // A focused tab or panel inside an open match, put back by its id after the rebuild.
    var fel = f && f.id && /^[tp]-\d+-\d$/.test(f.id) ? f.id : null;
    staleList = false;
    stalePanels = {};
    tracks = {};
    byId = {};
    if (!matches.length) { note(view ? EMPTY_DAY : EMPTY); return; }

    var groups = {}, keys = [];
    matches.forEach(function (m) {
      var k = (m.competition && m.competition.key) || 'other';
      if (!groups[k]) { groups[k] = { name: (m.competition && m.competition.name) || 'Other', items: [] }; keys.push(k); }
      groups[k].items.push(m);
      byId[m.id] = m;
    });
    keys.sort(function (a, b) {
      var x = ORDER.indexOf(a), y = ORDER.indexOf(b);
      return (x < 0 ? 99 : x) - (y < 0 ? 99 : y);
    });

    var frag = document.createDocumentFragment();
    keys.forEach(function (k) {
      var g = groups[k];
      g.items.sort(function (a, b) { return Date.parse(a.kickoff) - Date.parse(b.kickoff) || a.id - b.id; });
      var sec = h('section', 'scores__group');
      var hid = 'g-' + k;
      sec.setAttribute('aria-labelledby', hid);
      var title = h('h2', null, NAMES[k] || g.name);
      title.id = hid;
      sec.appendChild(title);
      var list = null, lastDay = '';
      g.items.forEach(function (m) {
        var d = new Date(m.kickoff);
        var dk = isNaN(d.getTime()) ? '' : dayKey(d);
        if (!list || dk !== lastDay) {
          if (dk) sec.appendChild(h('h3', 'scores__day', dayLabel(d)));
          list = h('ul', 'scores__list');
          sec.appendChild(list);
          lastDay = dk;
        }
        var li = h('li', 'scores__item');
        li.appendChild(row(m));
        if (open[m.id]) {
          var panel = h('div', 'scores__detail');
          panel.id = 'm-' + m.id;
          li.appendChild(panel);
        } else if (li.firstChild.tagName === 'BUTTON') {
          var closed = h('div', 'scores__detail');
          closed.id = 'm-' + m.id;
          closed.hidden = true;
          li.appendChild(closed);
        }
        list.appendChild(li);
      });
      frag.appendChild(sec);
    });
    root.textContent = '';
    root.appendChild(frag);
    // Build every open panel first and measure afterwards: measuring forces layout, and a layout
    // taken while later panels are still empty could shorten the page and move the reader.
    var built = [];
    Object.keys(open).forEach(function (id) {
      if (!open[id]) return;
      var t = paint(id, true);
      if (t) built.push(t);
    });
    built.forEach(settle);
    if (fid) {
      // preventScroll: a reader further down the open match must not be pulled back up to its row.
      var again = root.querySelector('button[data-id="' + fid + '"]');
      if (again) { try { again.focus({ preventScroll: true }); } catch (x) { again.focus(); } }
    } else if (fel) {
      refocus(fel);
    }
  }

  function refocus(elId) {
    var e = elId && document.getElementById(elId);
    if (!e) return;
    try { e.focus({ preventScroll: true }); } catch (x) { e.focus(); }
  }

  function eventLine(e) {
    var minute = clock(e.minute, e.extra);
    var name = e.player || 'Unknown';
    var cell = h('span', 'scores__ev scores__ev--' + e.side);
    if (e.type === 'yellow' || e.type === 'red' || e.type === 'second-yellow') {
      var label = e.type === 'yellow' ? 'Yellow' : e.type === 'red' ? 'Red' : '2nd yellow';
      cell.appendChild(h('span', 'scores__card' + (e.type === 'yellow' ? '' : ' scores__card--red'), label));
      cell.appendChild(document.createTextNode(' ' + name));
    } else {
      var tag = e.type === 'penalty-goal' ? ' (pen)' : e.type === 'own-goal' ? ' (og)' : '';
      cell.appendChild(h('strong', null, name));
      if (tag) cell.appendChild(document.createTextNode(tag));
    }
    var li = h('li', 'scores__evrow');
    var left = e.side === 'home' ? cell : h('span', 'scores__ev');
    var right = e.side === 'home' ? h('span', 'scores__ev') : cell;
    li.appendChild(left);
    li.appendChild(h('span', 'scores__min', minute));
    li.appendChild(right);
    return li;
  }

  function topRated(list) {
    return (list || [])
      .filter(function (r) { return r && typeof r.rating === 'number' && r.name; })
      .sort(function (a, b) { return b.rating - a.rating; })
      .slice(0, 3);
  }

  // Draws an open match's details into its panel. With lineups or stats in the file, that is the tab
  // row and the three-panel track; without either, the summary alone, as before the panels. Returns
  // the track's state, or null. `later` leaves the measuring to the caller (render() batches it).
  function paint(id, later) {
    var panel = document.getElementById('m-' + id);
    var m = byId[id];
    if (!panel || panel.hidden || !m) return null;
    var rec = details[id];
    var ae = document.activeElement;
    var back = ae && ae.id && panel.contains(ae) ? ae.id : null;
    delete tracks[id];
    panel.textContent = '';
    if (!rec) { panel.appendChild(h('p', 'scores__note', 'Loading match details.')); return null; }
    if (!rec.d) { panel.appendChild(h('p', 'scores__note', 'Match details are not available right now.')); return null; }

    var d = rec.d;
    var hasLineups = !!(d.lineups && d.lineups.home && d.lineups.away &&
      Array.isArray(d.lineups.home.startXI) && Array.isArray(d.lineups.away.startXI));
    var hasStats = !!(d.stats && d.stats.home && d.stats.away);
    if (!hasLineups && !hasStats) { summary(m, d, panel); return null; }

    var t = { id: id, idx: panelOf[id] || 0, goal: null, raf: 0, tabs: [], panes: [] };
    var list = h('div', 'scores__tabs');
    list.setAttribute('role', 'tablist');
    list.setAttribute('aria-label', 'Match details');
    var track = h('div', 'scores__track');
    t.track = track;
    // The last settled height goes on first, so the page keeps its length through the rebuild.
    if (heightOf[id]) track.style.height = heightOf[id] + 'px';
    TABS.forEach(function (label, i) {
      var tab = h('button', 'scores__tab', label);
      tab.type = 'button';
      tab.id = 't-' + id + '-' + i;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', 'p-' + id + '-' + i);
      tab.addEventListener('click', function () { choose(t, i, false); });
      list.appendChild(tab);
      t.tabs.push(tab);
      var pane = h('div', 'scores__panel');
      pane.id = 'p-' + id + '-' + i;
      pane.setAttribute('role', 'tabpanel');
      pane.setAttribute('aria-labelledby', tab.id);
      track.appendChild(pane);
      t.panes.push(pane);
    });
    summary(m, d, t.panes[0]);
    if (!hasLineups || !lineups(m, d, t.panes[1])) t.panes[1].appendChild(h('p', 'scores__note', NO_LINEUPS));
    if (!hasStats || !stats(m, d.stats, t.panes[2])) t.panes[2].appendChild(h('p', 'scores__note', NO_STATS));

    list.addEventListener('keydown', function (ev) {
      var n = t.tabs.length;
      var i = t.tabs.indexOf(document.activeElement);
      if (i < 0) i = t.idx;
      if (ev.key === 'ArrowRight') i = (i + 1) % n;
      else if (ev.key === 'ArrowLeft') i = (i + n - 1) % n;
      else if (ev.key === 'Home') i = 0;
      else if (ev.key === 'End') i = n - 1;
      else return;
      ev.preventDefault();
      choose(t, i, true);
    });
    track.addEventListener('scroll', function () {
      if (!t.raf) t.raf = requestAnimationFrame(function () { t.raf = 0; follow(t); });
    }, { passive: true });
    // A hand on the track takes over from a tab's scroll.
    ['pointerdown', 'wheel'].forEach(function (type) {
      track.addEventListener(type, function () { t.goal = null; }, { passive: true });
    });
    mark(t, t.idx);
    panel.appendChild(list);
    panel.appendChild(track);
    tracks[id] = t;
    if (!later) {
      settle(t);
      refocus(back);
    }
    return t;
  }

  // ----- the track: which panel is on show, and how tall the track is.
  function mark(t, idx) {
    var was = -1;
    t.panes.forEach(function (p, i) { if (p.contains(document.activeElement)) was = i; });
    t.idx = idx;
    panelOf[t.id] = idx;
    t.tabs.forEach(function (tab, i) {
      tab.setAttribute('aria-selected', i === idx ? 'true' : 'false');
      tab.tabIndex = i === idx ? 0 : -1;
    });
    t.panes.forEach(function (p, i) {
      if (i === idx) { p.tabIndex = 0; p.removeAttribute('aria-hidden'); }
      else { p.removeAttribute('tabindex'); p.setAttribute('aria-hidden', 'true'); }
    });
    // Focus on the panel going out moves to the one coming in, or the browser drops it to the page.
    if (was >= 0 && was !== idx) refocus(t.panes[idx].id);
  }
  // The track is as tall as the panel on show, so a short summary leaves no gap under it. Between two
  // panels, mid-swipe, it is as tall as the taller one so neither is cut off.
  function fit(t, a, b) {
    var px = Math.max(t.panes[a].offsetHeight, t.panes[b].offsetHeight);
    if (!px) return;
    t.track.style.height = px + 'px';
    if (a === b) heightOf[t.id] = px;
  }
  // After a rebuild or a resize: straight to the panel on show, with no animation.
  function settle(t) {
    var w = t.track.clientWidth;
    if (w) t.track.scrollLeft = t.idx * w;
    fit(t, t.idx, t.idx);
  }
  // On scroll: keep the height right and the tabs in step with where the track has come to rest.
  function follow(t) {
    var w = t.track.clientWidth;
    if (!w) return;
    var last = t.panes.length - 1;
    var pos = Math.min(Math.max(t.track.scrollLeft / w, 0), last);
    var near = Math.round(pos);
    var still = Math.abs(pos - near) < 0.02;
    if (still) fit(t, near, near);
    else fit(t, Math.floor(pos), Math.ceil(pos));
    // A tab's scroll is passing through: the tabs wait until it has come to rest on its panel.
    if (t.goal !== null && (!still || near !== t.goal)) return;
    t.goal = null;
    if (near !== t.idx) mark(t, near);
  }
  function reduced() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }
  // A tab (click or arrow key): select it now, then scroll there; instantly under reduced motion.
  function choose(t, i, focusTab) {
    mark(t, i);
    if (focusTab) t.tabs[i].focus();
    var left = i * t.track.clientWidth;
    if (Math.abs(t.track.scrollLeft - left) < 1) { t.goal = null; fit(t, i, i); return; }
    t.goal = i;
    try { t.track.scrollTo({ left: left, behavior: reduced() ? 'auto' : 'smooth' }); } catch (e) { t.track.scrollLeft = left; }
  }

  // ----- panel 1: goals and cards, then API-Football's top three ratings a side (unchanged).
  function summary(m, d, panel) {
    var evs = (d.events || []).filter(function (e) { return e && SHOWN[e.type] && e.minute != null; });
    if (evs.length) {
      var ul = h('ul', 'scores__events');
      evs.forEach(function (e) { ul.appendChild(eventLine(e)); });
      panel.appendChild(ul);
    } else {
      panel.appendChild(h('p', 'scores__note', 'No goals or cards.'));
    }

    var r = d.ratings || {};
    var sides = [['home', m.home.name], ['away', m.away.name]].map(function (x) { return [x[1], topRated(r[x[0]])]; });
    if (sides[0][1].length || sides[1][1].length) {
      var box = h('div', 'scores__ratings');
      box.appendChild(h('h4', null, 'API-Football ratings, top three per side'));
      var cols = h('div', 'scores__cols');
      sides.forEach(function (s) {
        var col = h('div', 'scores__col');
        col.appendChild(h('p', 'scores__team', s[0]));
        var ol = h('ul', 'scores__rate');
        s[1].forEach(function (p) {
          var li = h('li');
          li.appendChild(h('span', null, p.name));
          li.appendChild(h('span', 'scores__num', (Math.round(p.rating * 10) / 10).toFixed(1)));
          ol.appendChild(li);
        });
        col.appendChild(ol);
        cols.appendChild(col);
      });
      box.appendChild(cols);
      panel.appendChild(box);
    }
  }

  // ----- panel 2: the lineups on one pitch, away at the top and home at the bottom.
  // The page's own colours for neutral shirts and the contrast checks, read from its tokens.
  function palette() {
    if (pal) return pal;
    var cs = null;
    try { cs = window.getComputedStyle(document.documentElement); } catch (e) { cs = null; }
    function token(name, fallback) { return (cs && pitchHex(cs.getPropertyValue(name).trim())) || fallback; }
    pal = { ground: token('--bg', '#f4f1ea'), dark: token('--ink', '#1e223d'), light: '#ffffff', edge: token('--ink-muted', '#4c5176') };
    return pal;
  }
  // One shirt: the plain outline, filled and edged from `kit`, with the shirt number on it.
  function shirt(kit, number) {
    var s = document.createElementNS(SVG_NS, 'svg');
    s.setAttribute('class', 'pitch__shirt');
    s.setAttribute('viewBox', '0 0 40 40');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    var p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', SHIRT);
    p.style.fill = kit.fill;
    p.style.stroke = kit.stroke;
    s.appendChild(p);
    if (number != null) {
      var n = document.createElementNS(SVG_NS, 'text');
      n.setAttribute('x', '20');
      n.setAttribute('y', '29');
      n.setAttribute('text-anchor', 'middle');
      n.style.fill = kit.number;
      if (kit.halo) { // neither ink nor white reaches 4.5:1 on this shirt: outline the digits
        n.setAttribute('class', 'pitch__halo');
        n.style.stroke = kit.halo;
      }
      n.textContent = String(number);
      s.appendChild(n);
    }
    return s;
  }
  // What a screen reader hears for one player.
  function who(p, rating) {
    var s = (p.number != null ? 'Number ' + p.number + ', ' : '') + p.name;
    return rating != null ? s + ', rating ' + pitchOneDp(rating) : s;
  }
  function best(list) {
    var top = null;
    (list || []).forEach(function (r) { if (r && typeof r.rating === 'number' && (top === null || r.rating > top)) top = r.rating; });
    return top;
  }
  // Team name, formation and coach, at that team's end of the pitch.
  function caption(m, side, lu) {
    var p = h('p', 'pitch__team pitch__team--' + side);
    var name = h('strong', null, m[side].name);
    name.id = 'lu-' + m.id + '-' + side;
    p.appendChild(name);
    if (lu.formation) {
      var f = h('span', 'pitch__meta');
      f.appendChild(h('span', 'scores__sr', 'Formation '));
      f.appendChild(document.createTextNode(lu.formation));
      p.appendChild(document.createTextNode(' '));
      p.appendChild(f);
    }
    if (lu.coach) {
      p.appendChild(document.createTextNode(' '));
      p.appendChild(h('span', 'pitch__meta', 'Coach: ' + lu.coach));
    }
    return p;
  }
  // Two columns of names (home, away) with numbers and ratings: the substitutes, or the starters when
  // a lineup cannot be laid out on the pitch.
  function squad(m, d, key, heading) {
    var L = d.lineups, R = d.ratings || {}, any = false;
    var box = h('div', 'pitch__bench');
    box.appendChild(h('h4', null, heading));
    var cols = h('div', 'scores__cols');
    ['home', 'away'].forEach(function (side) {
      var col = h('div', 'scores__col');
      col.appendChild(h('p', 'scores__team', m[side].name));
      var ul = h('ul', 'pitch__list');
      (L[side][key] || []).forEach(function (p) {
        if (!p || !p.name) return;
        any = true;
        var r = pitchRating(p, R[side]);
        var li = h('li');
        var seen = [h('span', 'pitch__no', p.number != null ? String(p.number) : ''), h('span', null, p.name)];
        if (r != null) seen.push(h('span', 'scores__num', pitchOneDp(r)));
        seen.forEach(function (e) { e.setAttribute('aria-hidden', 'true'); li.appendChild(e); });
        li.appendChild(h('span', 'scores__sr', who(p, r)));
        ul.appendChild(li);
      });
      col.appendChild(ul);
      cols.appendChild(col);
    });
    box.appendChild(cols);
    return any ? box : null;
  }
  // Returns false when there is nothing to draw, so the caller says lineups are not available.
  function lineups(m, d, into) {
    var L = d.lineups, R = d.ratings || {}, P = palette();
    var laid = { home: pitchRows(L.home), away: pitchRows(L.away) };
    var rated = !!(best(R.home) !== null || best(R.away) !== null);
    if (laid.home && laid.away) {
      into.appendChild(caption(m, 'away', L.away));
      var pitch = h('div', 'pitch');
      var marks = h('div', 'pitch__marks');
      marks.setAttribute('aria-hidden', 'true');
      ['pitch__line', 'pitch__circle', 'pitch__box pitch__box--top', 'pitch__box pitch__box--bottom',
        'pitch__goal pitch__goal--top', 'pitch__goal pitch__goal--bottom'].forEach(function (c) { marks.appendChild(h('span', c)); });
      pitch.appendChild(marks);
      // Rows run keeper first and left to right in the DOM for both teams, so a screen reader hears
      // them the same way; the CSS turns the home half and the away rows round to face each other.
      ['away', 'home'].forEach(function (side) {
        var top = best(R[side]);
        var half = h('div', 'pitch__half pitch__half--' + side);
        half.setAttribute('role', 'group');
        half.setAttribute('aria-labelledby', 'lu-' + m.id + '-' + side);
        laid[side].rows.forEach(function (row, ri) {
          var ul = h('ul', 'pitch__row');
          row.forEach(function (p) {
            var r = pitchRating(p, R[side]);
            var kit = pitchKit(L[side].colors, p.pos === 'G' || ri === 0, side === 'home', P);
            var li = h('li', 'pitch__p');
            var fig = h('span', 'pitch__kit');
            fig.setAttribute('aria-hidden', 'true');
            fig.appendChild(shirt(kit, p.number));
            if (r != null) fig.appendChild(h('span', 'pitch__rate' + (r === top ? ' is-top' : ''), pitchOneDp(r)));
            li.appendChild(fig);
            var nm = h('span', 'pitch__name', p.name);
            nm.setAttribute('aria-hidden', 'true');
            li.appendChild(nm);
            li.appendChild(h('span', 'scores__sr', who(p, r)));
            ul.appendChild(li);
          });
          half.appendChild(ul);
        });
        pitch.appendChild(half);
      });
      into.appendChild(pitch);
      into.appendChild(caption(m, 'home', L.home));
    } else {
      var xi = squad(m, d, 'startXI', 'Starting XI');
      if (!xi) return false;
      into.appendChild(xi);
    }
    var subs = squad(m, d, 'subs', 'Substitutes');
    if (subs) into.appendChild(subs);
    if (rated) into.appendChild(h('p', 'pitch__src', RATINGS_SOURCE));
    return true;
  }

  // ----- panel 3: team stats, home and away either side of the label, with a split bar under it.
  // Returns false when no row has a figure.
  function stats(m, S, into) {
    var table = h('table', 'stats');
    table.appendChild(h('caption', 'scores__sr', 'Team stats'));
    var cg = h('colgroup');
    cg.appendChild(h('col', 'stats__side'));
    cg.appendChild(h('col'));
    cg.appendChild(h('col', 'stats__side'));
    table.appendChild(cg);
    var head = h('thead'), hr = h('tr');
    var th1 = h('th', null, m.home.name), th2 = h('th', null, m.away.name);
    th1.scope = 'col';
    th2.scope = 'col';
    hr.appendChild(th1);
    hr.appendChild(h('td'));
    hr.appendChild(th2);
    head.appendChild(hr);
    table.appendChild(head);
    var body = h('tbody'), rows = 0;
    STAT_ROWS.forEach(function (s) {
      var a = S.home[s[0]], b = S.away[s[0]];
      if (a == null && b == null) return;
      rows++;
      var tr = h('tr');
      tr.appendChild(h('td', null, a == null ? '-' : String(a)));
      var th = h('th', null, s[1]);
      th.scope = 'row';
      var share = pitchShare(a, b);
      if (share) {
        var bar = h('span', 'stats__bar');
        bar.setAttribute('aria-hidden', 'true');
        var hb = h('span', 'stats__home'), ab = h('span', 'stats__away');
        hb.style.width = share[0].toFixed(1) + '%';
        ab.style.width = share[1].toFixed(1) + '%';
        bar.appendChild(hb);
        bar.appendChild(ab);
        th.appendChild(bar);
      }
      tr.appendChild(th);
      tr.appendChild(h('td', null, b == null ? '-' : String(b)));
      body.appendChild(tr);
    });
    if (!rows) return false;
    table.appendChild(body);
    into.appendChild(table);
    return true;
  }

  function loadDetail(m) {
    if (!/^match\/\d+\.json$/.test(m.detail || '')) { details[m.id] = { d: null }; paint(m.id); return; }
    var wasLive = !!(m.status && m.status.live);
    var was = details[m.id] && details[m.id].d ? JSON.stringify(details[m.id].d) : null;
    fetch(BASE + m.detail, { cache: 'no-cache' })
      .then(function (res) { if (!res.ok) throw new Error('detail'); return res.json(); })
      .then(function (d) { details[m.id] = { d: d, live: wasLive }; })
      .catch(function () { if (!details[m.id]) details[m.id] = { d: null }; })
      .then(function () {
        // The same file again is not drawn again, so a reader on the pitch is left alone.
        var now = details[m.id] && details[m.id].d ? JSON.stringify(details[m.id].d) : null;
        if (was !== null && now === was && !stalePanels[m.id]) return;
        if (busy()) { stalePanels[m.id] = 1; return; }
        delete stalePanels[m.id];
        paint(m.id);
      });
  }

  // ----- a finger on a track: rebuilds wait until it lifts and the swipe has come to rest.
  function busy() { return touchedAt > 0 && Date.now() - touchedAt < 10000; }
  root.addEventListener('touchstart', function (ev) {
    var t = ev.target;
    if (t && t.closest && t.closest('.scores__track')) { touchedAt = Date.now(); clearTimeout(touchTimer); }
  }, { passive: true });
  function lifted() {
    if (!touchedAt) return;
    clearTimeout(touchTimer);
    touchTimer = setTimeout(function () {
      touchedAt = 0;
      if (staleList) { render(); return; }
      var ids = Object.keys(stalePanels);
      stalePanels = {};
      ids.forEach(function (id) { paint(id); });
    }, 700);
  }
  document.addEventListener('touchend', lifted, { passive: true });
  document.addEventListener('touchcancel', lifted, { passive: true });

  // A new width moves every open track back onto its panel and refits its height.
  var resizing = 0;
  window.addEventListener('resize', function () {
    if (resizing) return;
    resizing = requestAnimationFrame(function () {
      resizing = 0;
      Object.keys(tracks).forEach(function (id) { if (tracks[id].track.isConnected) settle(tracks[id]); });
    });
  });

  function refreshOpen() {
    Object.keys(open).forEach(function (id) {
      var m = byId[id];
      if (!open[id] || !m) return;
      var rec = details[id];
      if (!rec || !rec.d || (m.status && m.status.live) || rec.live) loadDetail(m);
    });
  }

  root.addEventListener('click', function (ev) {
    // Clicks inside an open match (the tabs) belong to the panels, never to the row toggle.
    if (ev.target && ev.target.closest && ev.target.closest('.scores__detail')) return;
    var b = ev.target && ev.target.closest ? ev.target.closest('button[data-id]') : null;
    if (!b) return;
    var id = b.getAttribute('data-id');
    var on = !open[id];
    open[id] = on;
    b.setAttribute('aria-expanded', on ? 'true' : 'false');
    var panel = document.getElementById('m-' + id);
    if (!panel) return;
    panel.hidden = !on;
    if (!on) return;
    paint(id);
    var m = byId[id];
    var rec = details[id];
    if (m && (!rec || !rec.d || (m.status && m.status.live) || rec.live)) loadDetail(m);
  });

  // How long until the next look at the feed. Every 30 seconds while a match is live, or is due to
  // be (kicks off within two minutes, or kicked off up to three hours ago and the feed still says
  // not started). Otherwise one wake-up shortly before the next kickoff, and nothing if there is none.
  function nextDelay() {
    if (!haveData) return 60000; // the feed has not loaded yet: one calm retry a minute
    var now = Date.now(), soon = null;
    for (var i = 0; i < matches.length; i++) {
      var s = matches[i].status || {};
      if (s.live) return POLL;
      if (s.code === 'NS') {
        var t = Date.parse(matches[i].kickoff);
        if (isNaN(t)) continue;
        if (t <= now + 120000 && t > now - 10800000) return POLL;
        if (t > now && (soon === null || t < soon)) soon = t;
      }
    }
    return soon === null ? null : Math.min(soon - now - 120000, 6 * 3600000);
  }
  function schedule() {
    clearTimeout(timer);
    var d = view ? null : nextDelay();
    timer = d == null ? 0 : setTimeout(tick, d);
  }
  function tick() {
    timer = 0;
    if (view) return;
    if (document.hidden) { pending = true; return; }
    load();
  }
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && pending && !view) { pending = false; load(); }
  });

  function setStamp(generatedAt) {
    if (!stamp) return;
    var t = generatedAt ? new Date(generatedAt) : null;
    stamp.textContent = t && !isNaN(t.getTime()) ? 'Updated ' + hm(t) : '';
  }

  function apply(d) {
    haveData = true;
    live = d;
    if (view) return; // a past day is on show; the live window waits in `live`
    var s = JSON.stringify(d.matches);
    if (s !== sig || staleList) {
      sig = s;
      matches = d.matches;
      if (busy()) staleList = true; // drawn when the finger lifts
      else render();
    }
    setStamp(d.generatedAt);
    refreshOpen();
    openWanted();
  }

  // ?match=<id>, from the front-page scores strip: once that match is on screen, open its details
  // (when it has any) and bring it into view. Runs once; later polls leave the reader alone.
  // &panel=lineups or &panel=stats opens that panel instead of the summary.
  var want = '', wantPanel = 0;
  try {
    var q = new URLSearchParams(location.search);
    want = q.get('match') || '';
    var pk = q.get('panel');
    wantPanel = Object.prototype.hasOwnProperty.call(PANEL_KEYS, pk) ? PANEL_KEYS[pk] : 0; // not ?panel=constructor
  } catch (e) { want = ''; }
  if (!/^\d+$/.test(want)) want = '';
  function openWanted() {
    if (!want || view || !byId[want]) return;
    var id = want;
    want = '';
    var el = root.querySelector('[data-id="' + id + '"]');
    if (!el) return;
    if (wantPanel) panelOf[id] = wantPanel;
    if (el.tagName === 'BUTTON' && !open[id]) el.click();
    try { el.scrollIntoView({ block: 'center' }); } catch (e) { el.scrollIntoView(); }
    if (el.focus) el.focus({ preventScroll: true });
  }

  function load() {
    fetch(BASE + 'scores.json', { cache: 'no-cache' })
      .then(function (res) { if (!res.ok) throw new Error('feed'); return res.json(); })
      .then(function (d) {
        if (!d || !Array.isArray(d.matches)) throw new Error('shape');
        apply(d);
      })
      .catch(function () { if (!haveData && !view) note(DOWN); })
      .then(schedule);
  }

  // ----- history: the date menu, the previous and next buttons, and the address.
  function option(value, text) {
    var o = document.createElement('option');
    o.value = value;
    o.textContent = text;
    return o;
  }
  function syncNav() {
    if (!nav) return;
    // Nothing to browse (no index, or not yet loaded) and no past day on show: no controls.
    if (!days.length && !view) { nav.hidden = true; return; }
    nav.hidden = false;
    pick.textContent = '';
    pick.appendChild(option('', LIVE_LABEL));
    var listed = false;
    days.forEach(function (e) {
      if (e.date === view) listed = true;
      pick.appendChild(option(e.date, dayText(e.date)));
    });
    if (view && !listed) pick.appendChild(option(view, dayText(view)));
    pick.value = view;
    prevBtn.disabled = earlier(view) === null;
    nextBtn.disabled = later(view) === null;
    liveBtn.hidden = !view;
    tzNote.hidden = !view;
  }
  function announce() {
    if (announcer) announcer.textContent = view ? 'Showing matches on ' + dayText(view) : 'Showing live and recent matches';
  }

  function showDay(date, d) {
    if (view !== date) return; // the reader has moved on
    matches = d.matches;
    sig = '';
    render();
    if (stamp) stamp.textContent = 'Matches on ' + dayText(date);
  }
  function loadDay(date) {
    if (dayCache[date]) { showDay(date, dayCache[date]); return; }
    note('Loading matches.');
    if (stamp) stamp.textContent = 'Matches on ' + dayText(date);
    fetch(BASE + 'days/' + date + '.json', { cache: 'no-cache' })
      .then(function (res) {
        if (res.status === 404) return { matches: [] }; // no file: nothing was played that day
        if (!res.ok) throw new Error('day');
        return res.json();
      })
      .then(function (d) {
        if (!d || !Array.isArray(d.matches)) throw new Error('shape');
        if (date < windowStart()) dayCache[date] = d; // a settled day; a recent one can still change
        showDay(date, d);
      })
      .catch(function () { if (view === date) note(DOWN_DAY); });
  }

  function loadIndex() {
    fetch(BASE + 'days/index.json', { cache: 'no-cache' })
      .then(function (res) { if (!res.ok) throw new Error('index'); return res.json(); })
      .then(function (d) {
        if (!d || !Array.isArray(d.days)) throw new Error('shape');
        days = d.days
          .filter(function (e) { return e && isDay(e.date); })
          .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
        syncNav();
      })
      .catch(function () { /* no history yet: the controls stay hidden */ });
  }

  // Puts `view` on screen. The live window is redrawn from what is held and then refreshed; a
  // past day is fetched once and never polled.
  function enter() {
    clearTimeout(timer);
    timer = 0;
    open = {};
    panelOf = {};
    heightOf = {};
    tracks = {};
    staleList = false;
    stalePanels = {};
    syncNav();
    announce();
    if (view) { loadDay(view); return; }
    if (live) {
      matches = live.matches;
      sig = JSON.stringify(live.matches);
      render();
      setStamp(live.generatedAt);
    } else {
      note('Loading scores.');
      if (stamp) stamp.textContent = '';
    }
    load();
  }
  function go(date, push) {
    if (date === view) return;
    view = date;
    if (push) {
      try { history.pushState(null, '', date ? '?date=' + date : location.pathname); } catch (e) { /* no history API: the view still changes */ }
    }
    if (!date) loadIndex();
    enter();
  }
  function fromAddress() {
    var d = '';
    try { d = new URLSearchParams(location.search).get('date') || ''; } catch (e) { d = ''; }
    return isDay(d) ? d : '';
  }

  if (nav) {
    prevBtn.addEventListener('click', function () { var t = earlier(view); if (t !== null) go(t, true); });
    nextBtn.addEventListener('click', function () { var t = later(view); if (t !== null) go(t, true); });
    pick.addEventListener('change', function () { go(pick.value, true); });
    liveBtn.addEventListener('click', function () { go('', true); });
  }
  window.addEventListener('popstate', function () {
    var d = fromAddress();
    if (d === view) return;
    view = d;
    if (!d) loadIndex();
    enter();
  });

  view = fromAddress();
  loadIndex();
  if (view) enter();
  else load();
})();
