/* scripts/icons/meshes.mjs — the six sport objects, built from arithmetic.
 *
 * Each builder returns { mesh, pose, alt }. `pose` is the rest pose in degrees (yaw about the
 * object's upright axis, then a tilt toward the viewer): it is the frame the SVG poster shows,
 * the frame the canvas fades in on, and the one static frame shown under reduced motion.
 *
 * RIGHTS. Every object here is generic. No crest, logo, maker's mark, sponsor, number or livery
 * is modelled, and the racing car is nobody's chassis: it is a box-built single-seater with the
 * parts any open-wheel car has. Its body is one plain colour, the site's own accent (founder,
 * 2026-11-21: "orange body that reads better small"). Do not add a stripe, a number, a logo or a
 * second colour to the body, and do not copy a real team's scheme: that would be a livery. See
 * "Editorial and rights lines" in CLAUDE.md.
 */
import { Mesh, V, DEG, rotX, rotZ, icosphere } from "./lib.mjs";
import { SPORT_ICON_ALT } from "./markup.mjs";

const TAU = Math.PI * 2;

/* ---------- football: a Telstar, 12 ink pentagons and 20 paper hexagons ---------- */
function football() {
  const m = new Mesh("football");
  const ink = m.slot("ink"), paper = m.slot("paper"), line = m.slot("line");
  const { points: iv, faces: ifc } = icosphere(0);
  const nb = iv.map(() => new Set());
  for (const [a, b, c] of ifc) { nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b); }
  const cut = (a, b) => V.lerp(iv[a], iv[b], 1 / 3);
  const panels = [];
  iv.forEach((p, a) => {
    // the five neighbours, ordered round the vertex
    const u = V.norm(V.cross(p, Math.abs(p[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), w = V.cross(p, u);
    const ring = [...nb[a]].sort((x, y) => Math.atan2(V.dot(iv[x], w), V.dot(iv[x], u)) - Math.atan2(V.dot(iv[y], w), V.dot(iv[y], u)));
    panels.push({ pts: ring.map((b) => cut(a, b)), slot: ink });
  });
  for (const [a, b, c] of ifc) panels.push({ pts: [cut(a, b), cut(b, a), cut(b, c), cut(c, b), cut(c, a), cut(a, c)], slot: paper });

  // The seams are not drawn. Each panel is pulled in a little from its edges and an ink ball sits
  // just underneath, so the gap between two panels is the seam.
  m.begin("core", { outline: true, layer: 0 });
  m.sphere(0.992, line, 3);
  m.begin("panels", { outline: false, layer: 1 });
  const N = 2, INSET = 0.9;
  for (const { pts, slot } of panels) {
    const c = pts.reduce((s, p) => V.add(s, p), [0, 0, 0]).map((x) => x / pts.length);
    const rim = pts.map((p) => V.add(c, V.mul(V.sub(p, c), INSET)));
    const seen = new Map();
    const at = (p) => {
      const q = V.norm(p), k = q.map((x) => Math.round(x * 1e5)).join(",");
      if (!seen.has(k)) seen.set(k, m.vert(q, q, slot));
      return seen.get(k);
    };
    for (let i = 0; i < rim.length; i++) {
      const A = c, B = rim[i], C = rim[(i + 1) % rim.length];
      const g = (r, s) => at(V.add(V.add(V.mul(A, (N - r - s) / N), V.mul(B, r / N)), V.mul(C, s / N)));
      for (let r = 0; r < N; r++) for (let s = 0; s < N - r; s++) {
        m.tri(g(r, s), g(r + 1, s), g(r, s + 1));
        if (r + s < N - 1) m.tri(g(r + 1, s), g(r + 1, s + 1), g(r, s + 1));
      }
    }
  }
  m.end();
  return { mesh: m, pose: { yaw: 20, tilt: 24 } };
}

/* ---------- basketball ---------- */
function basketball() {
  const m = new Mesh("basketball");
  const orange = m.slot("orange"), line = m.slot("line");
  m.begin("ball", { layer: 0 });
  m.sphere(1, orange, 3);
  m.begin("seams", { outline: false, layer: 1 });
  const W = 0.06, n = 56;
  const circle = (f) => Array.from({ length: n }, (_, i) => f((i / n) * TAU));
  m.ribbon(circle((a) => [0, Math.cos(a), Math.sin(a)]), W, line);
  m.ribbon(circle((a) => [Math.cos(a), 0, Math.sin(a)]), W, line);
  // the two side loops: closest to the middle seam at the equator, sweeping out toward the poles
  const A = 0.5, B = 0.42, ymax = Math.sqrt((-(2 * A * B + 1) + Math.sqrt((2 * A * B + 1) ** 2 - 4 * B * B * (A * A - 1))) / (2 * B * B));
  for (const side of [1, -1]) {
    m.ribbon(circle((a) => {
      const y = ymax * Math.sin(a), x = A + B * y * y;
      return [side * x, y, Math.sqrt(Math.max(0, 1 - x * x - y * y)) * Math.sign(Math.cos(a) || 1)];
    }), W, line);
  }
  m.end();
  return { mesh: m, pose: { yaw: 28, tilt: 16 } };
}

/* ---------- tennis ball ---------- */
function tennis() {
  const m = new Mesh("tennis");
  const felt = m.slot("felt"), seam = m.slot("paper");
  m.begin("ball", { layer: 0 });
  m.sphere(1, felt, 3);
  m.begin("seam", { outline: false, layer: 1 });
  const a = 0.72, b = 0.28, c = 2 * Math.sqrt(a * b), n = 120;
  m.ribbon(Array.from({ length: n }, (_, i) => {
    const t = (i / n) * TAU;
    return [a * Math.cos(t) + b * Math.cos(3 * t), c * Math.sin(2 * t), a * Math.sin(t) - b * Math.sin(3 * t)];
  }), 0.11, seam);
  m.end();
  return { mesh: m, pose: { yaw: 30, tilt: 40 } };
}

/* ---------- golf ball: the dimples are small flat marks, not modelled dents ---------- */
function golf() {
  const m = new Mesh("golf");
  const paper = m.slot("paper"), dot = m.slot("stipple");
  m.begin("ball", { layer: 0 });
  m.sphere(1, paper, 3);
  m.begin("dimples", { outline: false, layer: 1 });
  const N = 96, R = 0.072, golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * (i + 0.5)) / N, r = Math.sqrt(1 - y * y), th = i * golden;
    const p = [Math.cos(th) * r, y, Math.sin(th) * r];
    const u = V.norm(V.cross(p, Math.abs(y) < 0.9 ? [0, 1, 0] : [1, 0, 0])), w = V.cross(p, u);
    const ids = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      const q = V.norm(V.add(p, V.add(V.mul(u, Math.cos(a) * R), V.mul(w, Math.sin(a) * R))));
      ids.push(m.vert(V.mul(q, 1.008), q, dot));
    }
    for (let k = 1; k < 5; k++) m.tri(ids[0], ids[k], ids[k + 1]);
  }
  m.end();
  return { mesh: m, pose: { yaw: 10, tilt: 18 } };
}

/* ---------- American football ---------- */
function nfl() {
  const m = new Mesh("nfl");
  const leather = m.slot("leather"), paper = m.slot("paper"), line = m.slot("line");
  const L = 1, R = 0.6, SEG = 20;
  const rad = (x) => R * Math.pow(Math.max(0, 1 - (x / L) ** 2), 0.72);
  const slope = (x) => (rad(Math.min(L, x + 1e-3)) - rad(Math.max(-L, x - 1e-3))) / 2e-3;
  const surf = (x, a, lift = 0) => {
    const r = rad(x), s = Math.max(-6, Math.min(6, slope(x)));
    const nrm = V.norm([-s, Math.cos(a), Math.sin(a)]);
    return { p: V.add([x, r * Math.cos(a), r * Math.sin(a)], V.mul(nrm, lift)), n: r < 1e-4 ? [Math.sign(x), 0, 0] : nrm };
  };
  // long axis is X, laces on +Y. Two paper bands near the points, as on a training ball.
  const bands = [[-1, -0.76, leather, 5], [-0.76, -0.64, paper, 1], [-0.64, 0.64, leather, 10], [0.64, 0.76, paper, 1], [0.76, 1, leather, 5]];
  m.begin("ball", { layer: 0 });
  for (const [x0, x1, slot, rings] of bands) {
    const rows = [];
    for (let i = 0; i <= rings; i++) {
      let t = i / rings;
      if (x0 === -1) t = 1 - (1 - t) ** 1.8; // crowd the rings toward the point
      if (x1 === 1) t = t ** 1.8;
      const x = x0 + (x1 - x0) * t, row = [];
      for (let k = 0; k < SEG; k++) { const s = surf(x, (k / SEG) * TAU); row.push(m.vert(s.p, s.n, slot)); }
      rows.push(row);
    }
    for (let i = 0; i < rings; i++) for (let k = 0; k < SEG; k++) { const j = (k + 1) % SEG; m.quad(rows[i][k], rows[i][j], rows[i + 1][j], rows[i + 1][k]); }
  }
  // four panel seams
  m.begin("seams", { outline: false, layer: 1 });
  for (let q = 0; q < 4; q++) {
    const a = q * (TAU / 4), da = 0.022, Ls = [], Rs = [];
    for (let i = 0; i <= 14; i++) {
      const x = -0.97 + (1.94 * i) / 14;
      const l = surf(x, a - da / Math.max(0.25, rad(x) / R), 0.007), r = surf(x, a + da / Math.max(0.25, rad(x) / R), 0.007);
      Ls.push(m.vert(l.p, l.n, line)); Rs.push(m.vert(r.p, r.n, line));
    }
    for (let i = 0; i < 14; i++) m.quad(Ls[i], Rs[i], Rs[i + 1], Ls[i + 1]);
  }
  // laces: one spine, five stitches, sitting on the top seam
  m.begin("laces", { outline: true, layer: 2 });
  const top = rad(0);
  m.box(-0.36, 0.36, top - 0.02, top + 0.03, -0.03, 0.03, paper);
  for (let i = -2; i <= 2; i++) {
    const x = i * 0.15, y = rad(x);
    m.begin(`stitch${i}`, { outline: true, layer: 3 });
    m.box(x - 0.032, x + 0.032, y - 0.02, y + 0.05, -0.13, 0.13, paper);
  }
  m.end();
  // bake the lie of the ball: laces rolled toward the viewer, nose up to the right
  m.transform((p) => rotZ(rotX(p, 52 * DEG), 24 * DEG));
  return { mesh: m, pose: { yaw: -18, tilt: 10 } };
}

/* ---------- single-seater racing car, generic, boxes only ---------- */
function f1() {
  const m = new Mesh("f1");
  // Body (tub and sidepods): the accent ramp, one plain colour. Wing planes and the helmet are
  // paper, endplates, pylon, halo and arms ink, tyres line.
  const body = m.slot("orange"), wing = m.slot("paper"), dark = m.slot("ink"), tyre = m.slot("line"), hub = m.slot("metal");
  // X is forward (nose at +X), Y up, Z across. Units are arbitrary; fit() scales at the end.
  // Proportions are a toy's, not a blueprint's: short, wide and big-wheeled, so it still reads
  // as a racing car when the whole icon is 72px across.
  const HW = 0.5; // half the track width, to the outside of the tyres
  const sect = (x, hw, y0, y1, taper = 0.7) => [[x, y0, -hw], [x, y1, -hw * taper], [x, y1, hw * taper], [x, y0, hw]];
  const loft = (name, sections, slot, layer = 1) => {
    for (let i = 0; i + 1 < sections.length; i++) {
      m.begin(`${name}${i}`, { layer });
      m.hexa([...sect(...sections[i + 1]), ...sect(...sections[i])], slot);
    }
  };
  m.begin("floor", { layer: 0 });
  m.box(-0.74, 0.36, 0.05, 0.09, -0.36, 0.36, dark);
  // tail, engine cover with its air intake, cockpit, nose: one run
  loft("tub", [
    [-0.9, 0.06, 0.12, 0.24], [-0.66, 0.1, 0.09, 0.36], [-0.3, 0.13, 0.09, 0.6, 0.5], [-0.12, 0.17, 0.09, 0.42],
    [0.26, 0.15, 0.09, 0.38], [0.62, 0.1, 0.1, 0.27], [1.0, 0.055, 0.1, 0.17],
  ], body);
  for (const s of [1, -1]) {
    m.begin(`pod${s}`, { layer: 1 });
    m.hexa([
      [-0.62, 0.09, s * 0.08], [-0.62, 0.25, s * 0.08], [-0.62, 0.22, s * 0.26], [-0.62, 0.09, s * 0.3],
      [0.14, 0.09, s * 0.12], [0.14, 0.36, s * 0.12], [0.14, 0.33, s * 0.4], [0.14, 0.09, s * 0.42],
    ], body);
  }
  m.begin("cockpit", { layer: 2 });
  m.box(-0.1, 0.2, 0.37, 0.405, -0.09, 0.09, tyre);
  m.begin("helmet", { layer: 3 });
  m.sphere(0.085, wing, 1, [0, 0.46, 0]);
  // halo: a hoop from behind the driver's shoulders to one centre post
  const hoop = [];
  for (let i = 0; i <= 6; i++) { const a = (-90 + 30 * i) * DEG; hoop.push([-0.12 + 0.38 * Math.cos(a), 0.45 + 0.09 * Math.cos(a), 0.16 * Math.sin(a)]); }
  for (let i = 0; i < 6; i++) { m.begin(`halo${i}`, { layer: 4 }); m.strut(hoop[i], hoop[i + 1], 0.045, dark); }
  m.begin("halopost", { layer: 4 });
  m.strut([0.26, 0.54, 0], [0.31, 0.36, 0], 0.045, dark);
  // front wing: main plane, a flap, two endplates
  m.begin("fwing", { layer: 1 }); m.box(0.8, 1.02, 0.05, 0.085, -HW, HW, wing);
  m.begin("fflap", { layer: 1 }); m.box(0.74, 0.88, 0.11, 0.14, -HW, HW, wing);
  for (const s of [1, -1]) { m.begin(`fend${s}`, { layer: 1 }); m.box(0.72, 1.02, 0.04, 0.22, s * HW - 0.02, s * HW + 0.02, dark); }
  // rear wing: one pylon, a beam, the main plane, two endplates
  m.begin("rpylon", { layer: 1 }); m.box(-0.95, -0.85, 0.2, 0.58, -0.025, 0.025, dark);
  m.begin("rbeam", { layer: 1 }); m.box(-0.98, -0.84, 0.28, 0.315, -0.34, 0.34, wing);
  m.begin("rwing", { layer: 1 }); m.box(-1.04, -0.8, 0.58, 0.64, -0.34, 0.34, wing);
  for (const s of [1, -1]) { m.begin(`rend${s}`, { layer: 1 }); m.box(-1.06, -0.76, 0.16, 0.68, s * 0.34 - 0.02, s * 0.34 + 0.02, dark); }
  // wheels and one arm each, so they are attached to something
  const wheel = (name, x, r, w, s) => {
    const zc = s * (HW - w / 2), SEG = 14, y = r;
    m.begin(`arm${name}`, { layer: 1 });
    m.strut([x, y + 0.02, s * 0.1], [x, y, zc], 0.045, dark);
    m.begin(`wheel${name}`, { layer: 1 });
    const ring = (z) => Array.from({ length: SEG }, (_, k) => { const a = (k / SEG) * TAU; return [x + r * Math.cos(a), y + r * Math.sin(a), z]; });
    const z0 = zc - w / 2, z1 = zc + w / 2, r0 = ring(z0), r1 = ring(z1);
    for (let k = 0; k < SEG; k++) { const j = (k + 1) % SEG; m.face([r0[k], r0[j], r1[j], r1[k]], tyre, [x, y, zc]); }
    m.face(r0, tyre, [x, y, zc]); m.face(r1, tyre, [x, y, zc]);
    m.begin(`hub${name}`, { layer: 5, outline: false });
    const zo = s > 0 ? z1 + 0.006 : z0 - 0.006;
    m.face(Array.from({ length: 10 }, (_, k) => { const a = (k / 10) * TAU; return [x + r * 0.48 * Math.cos(a), y + r * 0.48 * Math.sin(a), zo]; }), hub, [x, y, zc]);
  };
  for (const s of [1, -1]) { wheel(`F${s}`, 0.5, 0.2, 0.2, s); wheel(`R${s}`, -0.56, 0.22, 0.26, s); }
  m.end();
  return { mesh: m, pose: { yaw: -40, tilt: 24 }, fit: 1.12 };
}

export const BUILDERS = { football, nfl, f1, tennis, golf, basketball };
export function buildSport(key) {
  const out = BUILDERS[key]();
  out.alt = SPORT_ICON_ALT[key];
  out.mesh.end();
  out.mesh.fit(out.fit || 1);
  return out;
}
