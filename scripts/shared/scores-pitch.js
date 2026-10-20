  // ----- scores-pitch.js: the pure helpers behind the lineups graphic on /scores/ (2026-10-19).
  // scores-script.mjs (called by build-scores-page.mjs) splices this file into scores-client.js where
  // the include line stands, so it runs inside the client's own function and adds no global. No DOM and no I/O here: the node tests in
  // scripts/scores/test/ run these functions through vm. Function declarations only, every name
  // starting with "pitch", so nothing can clash with a name in the client.
  //
  // Data shape (archv-match/1): a lineup is { formation, coach, startXI, subs, colors? }, a player
  // { name, number, pos, id?, grid? }, a rating { name, number, minutes, rating, id? }. id, grid and
  // colors were added on 2026-10-19 and are missing from older files, so every helper copes without them.

  // A colour as "#rrggbb" (lowercase), or null. Accepts six hex digits with or without "#", nothing else,
  // so a value from the feed can never become a URL or a piece of CSS.
  function pitchHex(v) {
    return typeof v === 'string' && /^#?[0-9a-f]{6}$/i.test(v) ? '#' + v.replace(/^#/, '').toLowerCase() : null;
  }

  // WCAG relative luminance and contrast ratio of two "#rrggbb" colours.
  function pitchLum(hex) {
    var n = parseInt(hex.slice(1), 16);
    var c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (x) {
      x = x / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function pitchContrast(a, b) {
    var x = pitchLum(a), y = pitchLum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }

  // The colours for one shirt: { fill, number, halo, stroke, neutral }. `colors` is the lineup's colors
  // (or missing), `keeper` picks the goalkeeper's shirt, `home` picks the neutral style, and `pal` holds
  // the page's own colours: { ground, dark, light, edge } (the pitch, ink, white and the muted ink).
  // - No usable shirt from the API: a neutral one. Home is ink with a paper number; away is white with
  //   an ink number and a muted-ink outline. A keeper with no shirt of their own is neutral too, rather
  //   than borrowing the outfield colours.
  // - The number is small text (about 10.5px bold), so it needs 4.5:1 on the shirt (WCAG AA). A number
  //   colour that is missing or below that becomes ink or white, whichever is higher; when even that is
  //   below 4.5:1 (a mid-tone shirt), `halo` is the other one, drawn as an outline round the digits.
  // - A shirt below 1.4:1 on the pitch is outlined in the muted ink, so it does not vanish.
  function pitchKit(colors, keeper, home, pal) {
    var c = colors && typeof colors === 'object' ? colors : null;
    var k = c ? (keeper ? c.goalkeeper : c.player) : null;
    var fill = k && typeof k === 'object' ? pitchHex(k.primary) : null;
    if (!fill) {
      return home
        ? { fill: pal.dark, number: pal.ground, halo: null, stroke: pal.dark, neutral: true }
        : { fill: pal.light, number: pal.dark, halo: null, stroke: pal.edge, neutral: true };
    }
    var num = pitchHex(k.number), halo = null;
    if (!num || pitchContrast(num, fill) < 4.5) {
      num = pitchContrast(pal.dark, fill) >= pitchContrast(pal.light, fill) ? pal.dark : pal.light;
      if (pitchContrast(num, fill) < 4.5) halo = num === pal.dark ? pal.light : pal.dark;
    }
    var stroke = pitchHex(k.border) || fill;
    if (pitchContrast(fill, pal.ground) < 1.4) stroke = pal.edge;
    return { fill: fill, number: num, halo: halo, stroke: stroke, neutral: false };
  }

  // "4-2-3-1" as [4, 2, 3, 1], or null for anything that is not dash-separated whole numbers.
  function pitchFormation(s) {
    if (typeof s !== 'string' || !/^\d+(-\d+)+$/.test(s)) return null;
    var out = s.split('-').map(Number);
    for (var i = 0; i < out.length; i++) if (!(out[i] > 0)) return null;
    return out;
  }

  // The starters as rows, back to front: rows[0] is the goalkeeper, and each row runs from the team's
  // left to its right. { rows, how } or null when no layout can be trusted (the page then lists names).
  //  1. 'grid': every starter has a distinct "row:col" from the API. Grouped by row, sorted by column.
  //  2. 'formation': the formation's lines add up to the outfield players and the first starter is the
  //     goalkeeper. The API lists the goalkeeper first and then each line from its highest column (the
  //     team's right) down, so the outfield players are cut into lines by the formation and each line
  //     reversed. This is what lays out the files written before grid was stored.
  // Positions alone (G, D, M, F) are not enough: two midfield lines share a letter, and run together
  // they put players on the wrong side of the pitch. Without a grid or a formation, null.
  function pitchRows(lineup) {
    var xi = lineup && Array.isArray(lineup.startXI) ? lineup.startXI.filter(function (p) { return p && p.name; }) : [];
    if (!xi.length) return null;
    var i, rows = [], seen = {}, byRow = {}, ok = true;

    for (i = 0; i < xi.length && ok; i++) {
      var g = typeof xi[i].grid === 'string' ? /^([1-9]\d?):([1-9]\d?)$/.exec(xi[i].grid) : null;
      if (!g || seen[xi[i].grid]) { ok = false; break; }
      seen[xi[i].grid] = 1;
      var r = +g[1];
      (byRow[r] = byRow[r] || []).push({ col: +g[2], p: xi[i] });
    }
    if (ok) {
      Object.keys(byRow).map(Number).sort(function (a, b) { return a - b; }).forEach(function (r) {
        rows.push(byRow[r].sort(function (a, b) { return a.col - b.col; }).map(function (x) { return x.p; }));
      });
      return { rows: rows, how: 'grid' };
    }

    var counts = pitchFormation(lineup.formation);
    var sum = counts ? counts.reduce(function (a, b) { return a + b; }, 0) : -1;
    if (counts && sum === xi.length - 1 && xi[0].pos === 'G') {
      rows = [[xi[0]]];
      var at = 1;
      counts.forEach(function (n) {
        rows.push(xi.slice(at, at + n).reverse());
        at += n;
      });
      return { rows: rows, how: 'formation' };
    }
    return null;
  }

  // A name for comparing: accents off, lower case, single spaces.
  function pitchFold(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  // The rating behind one lineup player, or null. API-Football names a player one way in the lineup and
  // another in the ratings ("R. Araujo" and "Ronald Araújo"), so names are the last resort: the player
  // id first (files from 2026-10-19), then the shirt number, then the exact name. A rating whose id is
  // known and different is never taken by number or name, because it is someone else.
  // Last, for ratings the API sent with player id 0 and no shirt number (seen on WSL players, where
  // "J. Rose" in the lineup is "Jade Rose" in the ratings): a lineup name "X. Surname" takes the one
  // such rating whose first name starts with X and which has Surname as whole words. Two candidates,
  // or none, and the player goes unrated.
  function pitchRating(player, ratings) {
    if (!player || !Array.isArray(ratings)) return null;
    var list = ratings.filter(function (r) { return r && typeof r.rating === 'number' && isFinite(r.rating); });
    var pid = player.id > 0 ? player.id : null;
    var other = function (r) { return pid !== null && r.id > 0 && r.id !== pid; };
    var i, j;
    if (pid !== null) for (i = 0; i < list.length; i++) if (list[i].id === pid) return list[i].rating;
    if (player.number != null) {
      for (i = 0; i < list.length; i++) if (list[i].number === player.number && !other(list[i])) return list[i].rating;
    }
    for (i = 0; i < list.length; i++) if (list[i].name === player.name && !other(list[i])) return list[i].rating;

    var short = typeof player.name === 'string' ? /^(\S)\. (\S.*)$/.exec(pitchFold(player.name)) : null;
    if (!short) return null;
    var sur = short[2].split(' '), hits = 0, hit = null;
    for (i = 0; i < list.length; i++) {
      if (list[i].id > 0 || list[i].number != null || typeof list[i].name !== 'string') continue;
      var w = pitchFold(list[i].name).split(' ');
      if (w.length <= sur.length || w[0].charAt(0) !== short[1]) continue;
      for (j = 1; j + sur.length <= w.length; j++) {
        if (w.slice(j, j + sur.length).join(' ') === short[2]) { hits++; hit = list[i].rating; break; }
      }
    }
    return hits === 1 ? hit : null;
  }

  // A rating to one decimal, as the summary panel already shows it.
  function pitchOneDp(r) {
    return (Math.round(r * 10) / 10).toFixed(1);
  }

  // The two halves of a team-stats split bar, as percentages of the pair: [home, away], or null when
  // either side is missing or not a number, or both are 0. Takes counts (12), percentages ("55%") and
  // expected goals ("1.17").
  function pitchShare(a, b) {
    var x = typeof a === 'number' ? a : typeof a === 'string' ? parseFloat(a) : NaN;
    var y = typeof b === 'number' ? b : typeof b === 'string' ? parseFloat(b) : NaN;
    if (!isFinite(x) || !isFinite(y) || x < 0 || y < 0 || x + y <= 0) return null;
    return [100 * x / (x + y), 100 * y / (x + y)];
  }
