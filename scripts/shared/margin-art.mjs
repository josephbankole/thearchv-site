/* scripts/shared/margin-art.mjs — "Field lines", the side-margin drawing (founder's pick, 2026-11-21).
 *
 * One hairline drawing of the page's playing surface, split down the middle: the left half sits in
 * the left margin, the right half in the right margin, as if the reading column lay on top of it.
 * It inks itself in as the page scrolls and is finished before the footer arrives.
 *
 * ONE SOURCE, TWO CALLERS. masthead() in page-shell.mjs (the static family) and the archv-home-ssr
 * plugin in vite.config.ts (the front page) both call marginArt(sportKey). The CSS is the usual
 * two copies: src/style.css and pageStyles(). scripts/test/margin-art.test.mjs holds them together.
 *
 * NO JAVASCRIPT. The engine is a CSS scroll timeline on one registered custom property
 * (--margin-ink, 0 to 1). Each path carries its own start (--a) and span (--w), worked out here at
 * build time from where the path sits in the drawing, so the ink runs top to bottom. Nothing in
 * this file may emit a <script>: the front page's CSP hash count and every static page's CSP
 * depend on that.
 *
 * FAIL CLOSED. Both layers carry the `hidden` attribute. Only a stylesheet that knows the page's
 * column width may switch them on, so a page that links some other stylesheet (the content.css
 * family, /scores/) shows nothing rather than a drawing loose in the flow.
 *
 * Imports nothing, reads nothing (trap 0), and is plain ESM so Vite can load it from vite.config.ts.
 */

/* Drawing space: 480 wide, 900 tall. The left layer shows x 0 to 240, the right 240 to 480. */
const W = 480;
const H = 900;

/* Vertical extent of an SVG path, from its own numbers. Bezier control points and arc end points
   stand in for the true curve, which is close enough to order the ink by. */
function ySpan(d) {
  const ARGS = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
  let x = 0, y = 0, sx = 0, sy = 0, lo = Infinity, hi = -Infinity;
  const see = (v) => { if (v < lo) lo = v; if (v > hi) hi = v; };
  for (const [, cmd, rest] of d.matchAll(/([a-zA-Z])([^a-zA-Z]*)/g)) {
    const n = (rest.match(/-?\d*\.?\d+/g) || []).map(Number);
    const k = cmd.toLowerCase(), rel = cmd === k, step = ARGS[k];
    if (step === undefined) throw new Error(`margin-art: path command ${cmd} is not handled`);
    if (k === "z") { x = sx; y = sy; continue; }
    if (n.length === 0 || n.length % step) throw new Error(`margin-art: bad arguments for ${cmd} in ${d}`);
    for (let i = 0; i < n.length; i += step) {
      const p = n.slice(i, i + step);
      if (k === "h") { x = rel ? x + p[0] : p[0]; see(y); continue; }
      if (k === "v") { see(y); y = rel ? y + p[0] : p[0]; see(y); continue; }
      see(y);
      // every pair but the arc's radii and flags is a point
      const pts = k === "a" ? [[p[5], p[6]]] : p.reduce((acc, v, j) => (j % 2 ? acc[acc.length - 1].push(v) : acc.push([v]), acc), []);
      for (const [px, py] of pts) see(rel ? y + py : py);
      const [ex, ey] = pts[pts.length - 1];
      x = rel ? x + ex : ex; y = rel ? y + ey : ey;
      if (k === "m" && i === 0) { sx = x; sy = y; }
    }
  }
  return [lo, hi];
}

/* When a mark starts inking (--a) and how much of the scroll it takes (--w). Top of the drawing
   first; a tall path takes longer than a short one; everything is done by 0.98. */
function timing(y0, y1) {
  const a = 0.02 + 0.64 * (Math.max(0, y0) / H);
  const w = Math.min(0.14 + 0.5 * ((y1 - y0) / H), 0.98 - a);
  return `--a:${a.toFixed(2)};--w:${w.toFixed(2)}`;
}

const circ = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
/* ln: a stroked path. Class "s" is the softer --rule weight, "b" the bolder one. */
function ln(d, cls = "", span = null) {
  const [y0, y1] = span || ySpan(d);
  return `<path class="ln${cls ? ` ln-${cls}` : ""}" pathLength="1" style="${timing(y0, y1)}" d="${d}"/>`;
}
const rc = (x, y, w, h, c) => ln(`M${x} ${y}h${w}v${h}h${-w}z`, c);
const li = (a, b, c, d, k) => ln(`M${a} ${b}L${c} ${d}`, k);
const ci = (x, y, r, c) => ln(circ(x, y, r), c, [y - r, y + r]);
/* dot: a small filled mark. accent = true is the one place the accent appears; keep it to one or
   two per drawing (the test counts them). */
function dot(x, y, r = 3.5, accent = false) {
  return `<circle class="dot${accent ? " dot-a" : ""}" style="${timing(y, y)}" cx="${x}" cy="${y}" r="${r}"/>`;
}

/* The F1 circuit is INVENTED. It is no real track's outline and must stay that way: a real
   circuit's shape is somebody's mark. The ribbon is one wide stroke with its middle masked out, so
   the two edges of the track ink in together. */
const F1_TRACK =
  "M412 720L412 230C412 150 352 118 322 162C300 195 338 240 318 290C298 340 232 318 232 258L232 170" +
  "C232 96 150 60 104 104C58 148 104 200 112 262C120 330 48 350 48 430C48 510 132 512 142 584" +
  "C152 660 66 672 66 752C66 836 160 858 236 838L306 820C352 808 340 764 372 752C398 742 412 748 412 720Z";

const FIELDS = {
  football() {
    return rc(30, 30, 420, 840) + rc(210, 18, 60, 12, "s") + rc(108, 30, 264, 128) + rc(178, 30, 124, 46) + dot(240, 118) +
      ln("M190 158A64 64 0 0 0 290 158", "", [158, 182]) + ln("M30 44A14 14 0 0 0 44 30") + ln("M436 30A14 14 0 0 0 450 44") +
      li(30, 450, 450, 450) + ci(240, 450, 64) + dot(240, 450, 4, true) +
      rc(108, 742, 264, 128) + rc(178, 824, 124, 46) + dot(240, 782) + ln("M190 742A64 64 0 0 1 290 742", "", [718, 742]) +
      ln("M30 856A14 14 0 0 1 44 870") + ln("M436 870A14 14 0 0 1 450 856") + rc(210, 870, 60, 12, "s");
  },
  nfl() {
    let s = rc(60, 30, 360, 840) + ln("M214 30V12M266 30V12M214 21H266", "b");
    // end-zone hatching, one soft path per end
    const hatch = (y) => [0, 1, 2, 3, 4, 5].map((k) => `M${60 + k * 60} ${y + 70}L${120 + k * 60} ${y}`).join("");
    s += ln(hatch(30), "s");
    for (let k = 0; k <= 10; k++) s += li(60, 100 + 70 * k, 420, 100 + 70 * k);
    // hash marks: the four on one line share a path, so a row inks as one stroke
    for (let k = 1; k < 20; k += 2) {
      const y = 100 + 35 * k;
      s += ln(`M60 ${y}H74M196 ${y}H210M270 ${y}H284M406 ${y}H420`, "s");
    }
    s += dot(240, 450, 4, true) + ln(hatch(800), "s");
    return s + ln("M214 870V888M266 870V888M214 879H266", "b");
  },
  f1(side) {
    const id = `margin-art-f1-${side}`;
    const mask = `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">` +
      `<path d="${F1_TRACK}" fill="none" stroke="#fff" stroke-width="15"/><path d="${F1_TRACK}" fill="none" stroke="#000" stroke-width="11.5"/></mask>`;
    const [y0, y1] = ySpan(F1_TRACK);
    let s = mask + `<path class="ln ln-t" pathLength="1" mask="url(#${id})" style="${timing(y0, y1)}" d="${F1_TRACK}"/>`;
    // racing line down the middle of the ribbon, soft
    s += ln(F1_TRACK, "s");
    // pit lane and its boxes, inside the start straight
    s += ln("M412 664C396 652 388 636 388 612L388 338C388 314 396 298 412 286") +
      ln([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => `M372 ${372 + k * 24}H388`).join(""), "s") +
      ln("M372 360V600", "s");
    // start line, and the grid behind it, staggered
    s += ln("M402 560H422", "b") + ln([0, 1, 2, 3, 4, 5, 6, 7].map((k) => `M${k % 2 ? 413 : 405} ${574 + k * 11}h6`).join(""), "b") +
      dot(412, 560, 4, true);
    // grandstands
    s += rc(434, 300, 20, 120, "s") + rc(434, 440, 20, 150, "s") + rc(434, 610, 20, 70, "s") +
      rc(250, 96, 70, 16, "s") + rc(150, 866, 110, 16, "s") + rc(8, 400, 16, 70, "s");
    // run-off beyond the big stops
    s += ln("M300 132C330 84 404 94 432 150", "s") + ln("M214 96C196 44 108 28 72 76", "s") +
      ln("M24 470C22 520 60 540 96 552", "s") + ln("M40 752C36 846 120 884 200 868", "s") +
      ln("M342 842C380 834 392 800 398 776", "s");
    // kerbs: short bold strokes on the apexes
    s += ln("M326 176C318 192 322 208 330 222", "b") + ln("M246 262C248 292 276 306 300 292", "b") +
      ln("M118 118C96 136 96 160 106 180", "b") + ln("M62 428C62 462 80 484 104 496", "b") +
      ln("M80 750C82 794 116 822 160 828", "b") + ln("M346 786C352 772 362 764 376 762", "b");
    // sector marks across the track, and a north arrow in the infield
    s += ln("M223 214H239", "b") + ln("M56 690H78", "b") + ln("M300 520V470M290 482L300 468L310 482", "s") +
      dot(142, 584);
    return s;
  },
  tennis() {
    return rc(60, 60, 360, 780) + li(105, 60, 105, 840) + li(375, 60, 375, 840) + li(240, 60, 240, 74) +
      li(105, 240, 375, 240) + li(240, 240, 240, 660) + li(44, 450, 436, 450, "b") + dot(44, 450, 4, true) + dot(436, 450, 4, true) +
      li(105, 660, 375, 660) + li(240, 826, 240, 840) +
      // the chair and the two benches, soft, outside the lines
      rc(12, 436, 18, 28, "s") + rc(444, 330, 16, 70, "s") + rc(444, 500, 16, 70, "s");
  },
  golf() {
    let s = ln("M340 150C340 100 400 80 430 110C460 140 450 200 410 205C370 210 340 190 340 150Z") +
      ln("M356 150C356 118 398 104 418 124C438 144 430 184 404 188C378 192 356 178 356 150Z", "s") +
      ln("M400 140V92", "b") + ln("M400 92L424 100L400 110", "b") + dot(400, 140, 3.5, true) +
      ln("M300 222C300 208 330 204 338 216C346 228 326 240 312 236C304 234 300 230 300 222Z") +
      ln("M440 214C448 206 464 212 462 224C460 236 444 236 438 228C434 222 436 218 440 214Z") +
      ln("M80 760C40 700 50 600 80 520C110 440 60 380 90 300C120 220 220 180 300 190C360 198 400 230 390 270C380 310 300 290 240 300C170 312 170 380 160 450C150 540 170 640 150 720C140 770 110 790 80 760Z") +
      ln("M115 812C112 640 96 470 124 340C150 250 300 250 392 150", "s") +
      ln("M300 560C300 500 380 480 420 520C460 560 440 640 390 650C340 660 300 620 300 560Z") +
      ln("M330 548C344 540 356 556 370 548C384 540 396 556 410 548", "s") + ln("M330 590C344 582 356 598 370 590C384 582 396 598 410 590", "s") +
      ln("M94 800h44v28h-44z");
    for (const [x, y] of [[320, 330], [372, 372], [430, 340], [410, 420], [200, 560], [214, 640], [36, 420], [30, 300], [300, 760], [380, 790]]) {
      s += ln(`${circ(x, y, 11)}M${x} ${y - 4}V${y + 4}`, "s", [y - 11, y + 11]);
    }
    return s;
  },
  basketball() {
    return rc(20, 36, 440, 828) + rc(170, 36, 140, 167) + li(214, 71, 266, 71, "b") + ci(240, 82, 8, "b") +
      ln("M205 82A35 35 0 0 0 275 82", "", [82, 117]) + ln("M46 36V160A209 209 0 0 0 434 160V36", "", [36, 290]) + ci(240, 203, 53) +
      li(20, 450, 460, 450) + ci(240, 450, 53) + dot(240, 450, 4, true) +
      ci(240, 697, 53) + ln("M46 864V740A209 209 0 0 1 434 740V864", "", [610, 864]) + rc(170, 697, 140, 167) +
      ln("M205 818A35 35 0 0 1 275 818", "", [783, 818]) + ci(240, 818, 8, "b") + li(214, 829, 266, 829, "b");
  },
};

/** Every sport key that has a drawing. The test holds this equal to SPORTS in page-shell.mjs. */
export const MARGIN_ART_SPORTS = Object.keys(FIELDS);
/** The sport a page with no sport of its own shows. */
export const MARGIN_ART_DEFAULT = "football";

const cache = new Map();

/**
 * The two margin layers for one sport, as a string of HTML. An unknown, null or missing key gets
 * football: the front page, the football desks and every page that belongs to no one sport.
 */
export function marginArt(sportKey) {
  const key = Object.hasOwn(FIELDS, sportKey) ? sportKey : MARGIN_ART_DEFAULT;
  if (cache.has(key)) return cache.get(key);
  const layer = (side) =>
    `<div class="margin-art margin-art--${side}" data-margin-art="${key}" aria-hidden="true" hidden>` +
    `<svg viewBox="${side === "l" ? 0 : W / 2} 0 ${W / 2} ${H}" preserveAspectRatio="${side === "l" ? "xMaxYMid" : "xMinYMid"} meet" focusable="false">` +
    `${FIELDS[key](side)}</svg></div>`;
  const html = layer("l") + layer("r");
  if (/<script|<image|<text|href=|url\((?!#margin-art-)/.test(html)) throw new Error("margin-art: a drawing is paths only");
  cache.set(key, html);
  return html;
}
