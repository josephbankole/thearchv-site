/* scripts/icons/poster.mjs — the SVG poster, projected from the same mesh the canvas draws.
 *
 * The poster is what a reader sees with no JavaScript, with no WebGL2, or after the context is
 * lost, and it is what the canvas fades in over. So it is not a separate drawing: it is the mesh
 * at its rest pose, through the same camera, shaded with the same three-step ramp, written out
 * as a handful of flat paths.
 *
 * How: each part is drawn back to front. Inside a part, every front-facing triangle is cut into
 * its lit, mid and shadow pieces; pieces of one colour are unioned by cancelling shared edges, and
 * what is left is the outline of that colour's region. An outlined part then gets its silhouette
 * stroked in ink, which is the poster's version of the canvas's inverted-hull line.
 */
import { V, DEG, rotX, rotY, SCENE, tokens } from "./lib.mjs";

const S = 192; // viewBox units; integer coordinates, so half a CSS pixel at 96px

export function project(mesh, pose) {
  const f = 1 / Math.tan((SCENE.camera.fov * DEG) / 2), d = SCENE.camera.dist;
  const turn = (p) => rotX(rotY(p, pose.yaw * DEG), pose.tilt * DEG);
  const view = mesh.pos.map(turn), vn = mesh.nor.map(turn);
  const scr = view.map((p) => { const w = d - p[2]; return [(0.5 + (0.5 * f * p[0]) / w) * S, (0.5 - (0.5 * f * p[1]) / w) * S]; });
  const nl = vn.map((n) => V.dot(n, SCENE.light));
  return { view, scr, nl };
}

const key = (p) => `${Math.round(p[0] * 64)},${Math.round(p[1] * 64)}`;
const area2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);

/* Cut a polygon of {p, f} to lo <= f < hi. Points on a cut are computed from the endpoint with
   the smaller f first, so two triangles sharing an edge produce the same point bit for bit. */
function clip(poly, t, keepAbove) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ia = keepAbove ? a.f >= t : a.f < t, ib = keepAbove ? b.f >= t : b.f < t;
    if (ia) out.push(a);
    if (ia !== ib) {
      const [lo, hi] = a.f <= b.f ? [a, b] : [b, a];
      const u = (t - lo.f) / (hi.f - lo.f);
      out.push({ p: [lo.p[0] + (hi.p[0] - lo.p[0]) * u, lo.p[1] + (hi.p[1] - lo.p[1]) * u], f: t });
    }
  }
  return out;
}

function loops(polys) {
  const edges = new Map(), pts = new Map();
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], ka = key(a), kb = key(b);
      if (ka === kb) continue;
      pts.set(ka, a); pts.set(kb, b);
      const rev = `${kb}>${ka}`;
      if (edges.has(rev)) edges.delete(rev); else edges.set(`${ka}>${kb}`, [ka, kb]);
    }
  }
  const from = new Map();
  for (const [a, b] of edges.values()) { if (!from.has(a)) from.set(a, []); from.get(a).push(b); }
  const out = [];
  for (const start of [...from.keys()]) {
    while (from.get(start)?.length) {
      const loop = [start]; let cur = from.get(start).pop();
      while (cur !== start && from.get(cur)?.length) { loop.push(cur); cur = from.get(cur).pop(); }
      if (loop.length >= 3) out.push(loop.map((k) => pts.get(k)));
    }
  }
  return out;
}

/* Douglas-Peucker on a closed loop. */
function simplify(loop, tol) {
  if (loop.length < 5) return loop;
  let far = 0, fi = 0;
  for (let i = 1; i < loop.length; i++) { const d = Math.hypot(loop[i][0] - loop[0][0], loop[i][1] - loop[0][1]); if (d > far) { far = d; fi = i; } }
  const dp = (pts) => {
    if (pts.length < 3) return pts;
    const a = pts[0], b = pts[pts.length - 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-9;
    let m = 0, mi = 0;
    for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs(area2(a, b, pts[i])) / L; if (d > m) { m = d; mi = i; } }
    if (m <= tol) return [a, b];
    return [...dp(pts.slice(0, mi + 1)).slice(0, -1), ...dp(pts.slice(mi))];
  };
  const A = dp(loop.slice(0, fi + 1)), B = dp([...loop.slice(fi), loop[0]]);
  return [...A.slice(0, -1), ...B.slice(0, -1)];
}

function pathData(ls, tol) {
  let d = "";
  for (const raw of ls) {
    const l = simplify(raw, tol).map((p) => [Math.round(p[0]), Math.round(p[1])]).filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
    let ar = 0;
    for (let i = 0; i < l.length; i++) { const a = l[i], b = l[(i + 1) % l.length]; ar += a[0] * b[1] - b[0] * a[1]; }
    if (l.length < 3 || Math.abs(ar) < 6) continue;
    d += `M${l[0][0]} ${l[0][1]}`;
    for (let i = 1; i < l.length; i++) {
      const dx = l[i][0] - l[i - 1][0], dy = l[i][1] - l[i - 1][1];
      d += dx === 0 ? `v${dy}` : dy === 0 ? `h${dx}` : `l${dx}${dy < 0 ? "" : " "}${dy}`;
    }
    d += "z";
  }
  return d;
}

export function posterSvg({ mesh, pose, alt }, { stroke = 6, tol = 0.55 } = {}) {
  const T = tokens();
  const { view, scr, nl } = project(mesh, pose);
  const [b0, b1] = SCENE.bands;
  const INK = T.ink;
  const parts = mesh.parts.map((part) => {
    const tris = mesh.tris.slice(part.start, part.start + part.count).filter(([a, b, c]) => area2(scr[a], scr[b], scr[c]) < 0); // y is flipped, so front faces wind negative
    let z = 0; const ids = new Set(tris.flat());
    for (const i of ids) z += view[i][2];
    return { part, tris, depth: ids.size ? z / ids.size : -9 };
  }).filter((p) => p.tris.length).sort((p, q) => p.part.layer - q.part.layer || p.depth - q.depth);

  const classes = new Map(); // style string -> class name
  const cls = (style) => { if (!classes.has(style)) classes.set(style, String.fromCharCode(97 + classes.size)); return classes.get(style); };
  let body = "", rims = "";
  for (const { part, tris } of parts) {
    const byColour = new Map();
    for (const t of tris) {
      const slot = mesh.pal[t[0]], ramp = mesh.palette[slot].ramp.map((n) => T[n]);
      const poly = t.map((i) => ({ p: scr[i], f: nl[i] }));
      const pieces = [[clip(poly, b0, true), ramp[0]], [clip(clip(poly, b0, false), b1, true), ramp[1]], [clip(poly, b1, false), ramp[2]]];
      for (const [pc, hex] of pieces) { if (pc.length >= 3) { if (!byColour.has(hex)) byColour.set(hex, []); byColour.get(hex).push(pc.map((q) => q.p)); } }
    }
    const fills = [...byColour.entries()].map(([hex, polys]) => [hex, pathData(loops(polys), tol)]).filter(([, d]) => d);
    const outline = part.outline ? pathData(loops(tris.map((t) => t.map((i) => scr[i]))), tol) : "";
    if (outline && part.rim) rims += `<path class="${cls(`fill:none;stroke:${INK}`)}" d="${outline}"/>`;
    // The canvas's ink line sits OUTSIDE the silhouette (it is a pushed-out hull). So here the
    // outline goes down first at twice the width and the fills cover its inner half.
    if (outline && !part.rim) body += `<path class="${cls(`fill:${INK};stroke:${INK}`)}" d="${outline}"/>`;
    for (const [hex, d] of fills) body += `<path class="${cls(`fill:${hex}`)}" d="${d}"/>`;
  }
  const css = [...classes.entries()].map(([style, name]) => `.${name}{${style}}`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="96" height="96" role="img" aria-label="${alt}"><title>${alt}</title><style>path{stroke-width:${stroke};stroke-linejoin:round}${css}</style>${body}${rims}</svg>\n`;
}
