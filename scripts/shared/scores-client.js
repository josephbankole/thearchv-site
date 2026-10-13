(function () {
  // Live scores client for /scores/. Inlined into the page by scripts/build-scores-page.mjs (the
  // CSP hash is computed from this exact text). Reads two public JSON files and builds the DOM
  // with textContent only, so nothing from the feed is ever parsed as markup.
  var BASE = 'https://fpsfnhjxczzyqurzbqpt.supabase.co/storage/v1/object/public/live/';
  var POLL = 30000;
  var ORDER = ['premier-league', 'champions-league', 'wsl'];
  var NAMES = { 'premier-league': 'Premier League', 'champions-league': 'Champions League', 'wsl': "Women's Super League" };
  // Goals and cards only. Substitutions, VAR notes and missed penalties stay out.
  var SHOWN = { 'goal': 1, 'own-goal': 1, 'penalty-goal': 1, 'yellow': 1, 'red': 1, 'second-yellow': 1 };
  var EMPTY = 'No matches to show right now.';
  var DOWN = 'Scores are not available right now. Try again in a moment.';

  var root = document.getElementById('scores');
  var stamp = document.getElementById('scores-updated');
  if (!root) return;

  var matches = [], byId = {}, sig = '', haveData = false;
  var open = {}, details = {};
  var timer = 0, pending = false;

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
    if (canOpen) {
      el.type = 'button';
      el.setAttribute('data-id', m.id);
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
    byId = {};
    if (!matches.length) { note(EMPTY); return; }

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
    Object.keys(open).forEach(function (id) { if (open[id]) paint(id); });
    if (fid) {
      var again = root.querySelector('button[data-id="' + fid + '"]');
      if (again) again.focus();
    }
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

  function paint(id) {
    var panel = document.getElementById('m-' + id);
    var m = byId[id];
    if (!panel || panel.hidden || !m) return;
    var rec = details[id];
    panel.textContent = '';
    if (!rec) { panel.appendChild(h('p', 'scores__note', 'Loading match details.')); return; }
    if (!rec.d) { panel.appendChild(h('p', 'scores__note', 'Match details are not available right now.')); return; }

    var evs = (rec.d.events || []).filter(function (e) { return e && SHOWN[e.type] && e.minute != null; });
    if (evs.length) {
      var ul = h('ul', 'scores__events');
      evs.forEach(function (e) { ul.appendChild(eventLine(e)); });
      panel.appendChild(ul);
    } else {
      panel.appendChild(h('p', 'scores__note', 'No goals or cards.'));
    }

    var r = rec.d.ratings || {};
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

  function loadDetail(m) {
    if (!/^match\/\d+\.json$/.test(m.detail || '')) { details[m.id] = { d: null }; paint(m.id); return; }
    var wasLive = !!(m.status && m.status.live);
    fetch(BASE + m.detail, { cache: 'no-cache' })
      .then(function (res) { if (!res.ok) throw new Error('detail'); return res.json(); })
      .then(function (d) { details[m.id] = { d: d, live: wasLive }; })
      .catch(function () { if (!details[m.id]) details[m.id] = { d: null }; })
      .then(function () { paint(m.id); });
  }

  function refreshOpen() {
    Object.keys(open).forEach(function (id) {
      var m = byId[id];
      if (!open[id] || !m) return;
      var rec = details[id];
      if (!rec || !rec.d || (m.status && m.status.live) || rec.live) loadDetail(m);
    });
  }

  root.addEventListener('click', function (ev) {
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
    var d = nextDelay();
    timer = d == null ? 0 : setTimeout(tick, d);
  }
  function tick() {
    timer = 0;
    if (document.hidden) { pending = true; return; }
    load();
  }
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && pending) { pending = false; load(); }
  });

  function apply(d) {
    haveData = true;
    var s = JSON.stringify(d.matches);
    if (s !== sig) { sig = s; matches = d.matches; render(); }
    var t = d.generatedAt ? new Date(d.generatedAt) : null;
    if (stamp) stamp.textContent = t && !isNaN(t.getTime()) ? 'Updated ' + hm(t) : '';
    refreshOpen();
  }

  function load() {
    fetch(BASE + 'scores.json', { cache: 'no-cache' })
      .then(function (res) { if (!res.ok) throw new Error('feed'); return res.json(); })
      .then(function (d) {
        if (!d || !Array.isArray(d.matches)) throw new Error('shape');
        apply(d);
      })
      .catch(function () { if (!haveData) note(DOWN); })
      .then(schedule);
  }

  load();
})();
