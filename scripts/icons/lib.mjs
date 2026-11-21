/* scripts/icons/lib.mjs — the shared kit behind the sport icons.
 *
 * One mesh per sport is generated here, in plain Node, with no dependency and no Blender. The
 * same mesh feeds three things, so they cannot drift apart:
 *   public/sport-icons/<key>.glb   standard binary glTF 2.0, drawn by /sport-icons/icon.js
 *   public/sport-icons/<key>.svg   the poster, projected from the same triangles at the rest pose
 *   (later) a USDZ for the iOS app, converted from the same .glb
 *
 * THE GLB IS DELIBERATELY PLAIN. One mesh, one primitive, float32 POSITION and NORMAL, an
 * unsigned-byte COLOR_0 holding real token colours (so any viewer or converter shows the right
 * thing), a custom _PALETTE attribute holding the palette slot per vertex (what the web runtime
 * reads), uint16 indices, no textures, no Draco, no meshopt. The site's CSP has no
 * 'wasm-unsafe-eval', so a compressed mesh would fail silently in the browser.
 *
 * COLOUR. A palette slot is a three-step toon ramp of token NAMES (lit, mid, shadow). The hex
 * values are read out of the :root block in scripts/shared/page-shell.mjs at generation time and
 * baked in as a fallback; the runtime reads the live CSS custom properties first. Nothing here
 * invents a colour. scripts/test/sport-icon.test.mjs holds that line.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, "..", "..");

/* ---------- tokens ---------- */
export const TOKEN_NAMES = ["bg", "bg-sunken", "ink", "ink-soft", "ink-muted", "accent-fill", "accent-ink", "rule", "rule-soft"];
let tokenCache = null;
export function tokens() {
  if (tokenCache) return tokenCache;
  const src = readFileSync(join(ROOT, "scripts", "shared", "page-shell.mjs"), "utf8");
  const out = {};
  for (const name of TOKEN_NAMES) {
    const m = src.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})\\b`));
    if (!m) throw new Error(`[sport-icons] token --${name} not found in page-shell.mjs`);
    out[name] = m[1].toUpperCase();
  }
  tokenCache = out;
  return out;
}
export const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/* The ramps. [lit, mid, shadow], token names only. Tennis felt and American football leather have
   no token of their own (optic yellow and brown would each be a sixth hue), so they borrow:
   felt is the sunken paper step, leather is --accent-ink. That substitution is a founder call. */
export const RAMPS = {
  paper: ["bg", "bg-sunken", "rule"],
  felt: ["bg-sunken", "rule", "ink-muted"],
  ink: ["ink-soft", "ink", "ink"],
  line: ["ink", "ink", "ink"],
  orange: ["accent-fill", "accent-fill", "accent-ink"],
  leather: ["accent-ink", "accent-ink", "ink"],
  spot: ["accent-fill", "accent-fill", "accent-ink"],
  stipple: ["ink-muted", "ink-soft", "ink"],
  metal: ["rule", "rule", "ink-muted"],
};

/* The one lighting and camera set-up, written into every GLB so the runtime and the poster read
   the same numbers. Light is in VIEW space (it does not turn with the object). */
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
export const SCENE = {
  light: norm([-0.5, 0.72, 0.6]).map((n) => Math.round(n * 1e4) / 1e4),
  bands: [0.28, -0.22], // n.l >= bands[0] is lit, >= bands[1] is mid, below is shadow
  camera: { fov: 24, dist: 5.5 },
};

/* ---------- vectors ---------- */
export const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm,
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};
export const rotX = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]; };
export const rotY = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; };
export const rotZ = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]]; };
export const DEG = Math.PI / 180;

/* ---------- mesh builder ---------- */
export class Mesh {
  constructor(key) {
    this.key = key;
    this.pos = []; this.nor = []; this.pal = []; this.tris = [];
    this.palette = []; // [{ name, ramp }]
    this.parts = []; // [{ name, start, count, outline, layer }]
    this.part = null;
  }
  slot(name) {
    let i = this.palette.findIndex((p) => p.name === name);
    if (i < 0) {
      if (!RAMPS[name]) throw new Error(`unknown ramp ${name}`);
      this.palette.push({ name, ramp: RAMPS[name] });
      i = this.palette.length - 1;
    }
    return i;
  }
  /* A part is a convex-ish piece: the poster draws parts back to front and inks each one's
     silhouette when outline is true. The GLB does not carry parts; it is one primitive. */
  begin(name, { outline = true, layer = 0 } = {}) {
    this.end();
    this.part = { name, start: this.tris.length, count: 0, outline, layer };
  }
  end() {
    if (this.part) { this.part.count = this.tris.length - this.part.start; if (this.part.count) this.parts.push(this.part); this.part = null; }
  }
  vert(p, n, slot) {
    this.pos.push(p); this.nor.push(V.norm(n)); this.pal.push(slot);
    return this.pos.length - 1;
  }
  /* Winding is fixed here, not trusted from the caller: a triangle faces the way its vertex
     normals point. Every shape in this kit is convex or a decal lying on one, so that holds. */
  tri(a, b, c) {
    const g = V.cross(V.sub(this.pos[b], this.pos[a]), V.sub(this.pos[c], this.pos[a]));
    if (V.len(g) < 1e-12) return;
    const n = V.add(V.add(this.nor[a], this.nor[b]), this.nor[c]);
    this.tris.push(V.dot(g, n) >= 0 ? [a, b, c] : [a, c, b]);
  }
  quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }

  /* Flat-shaded polygon (convex, in order). Its own vertices, one face normal. */
  face(points, slot, outwardFrom) {
    let n = [0, 0, 0];
    for (let i = 1; i + 1 < points.length; i++) n = V.add(n, V.cross(V.sub(points[i], points[0]), V.sub(points[i + 1], points[0])));
    n = V.norm(n);
    if (outwardFrom) {
      const c = points.reduce((s, p) => V.add(s, p), [0, 0, 0]).map((x) => x / points.length);
      if (V.dot(n, V.sub(c, outwardFrom)) < 0) n = V.mul(n, -1);
    }
    const ids = points.map((p) => this.vert(p, n, slot));
    for (let i = 1; i + 1 < ids.length; i++) this.tri(ids[0], ids[i], ids[i + 1]);
  }
  /* Six-faced solid from eight corners: [x-][x+] each as (y-z-, y+z-, y+z+, y-z+). */
  hexa(c, slot) {
    const centre = c.reduce((s, p) => V.add(s, p), [0, 0, 0]).map((x) => x / 8);
    const F = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [3, 2, 6, 7], [0, 3, 7, 4], [1, 2, 6, 5]];
    for (const f of F) this.face(f.map((i) => c[i]), slot, centre);
  }
  box(x0, x1, y0, y1, z0, z1, slot) {
    this.hexa([[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], slot);
  }
  /* A box strung between two points, square in section. For halo tubes and suspension arms. */
  strut(a, b, w, slot) {
    const d = V.norm(V.sub(b, a));
    const up = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const s = V.mul(V.norm(V.cross(d, up)), w / 2), t = V.mul(V.norm(V.cross(d, s)), w / 2);
    const ring = (p) => [V.sub(V.sub(p, s), t), V.sub(V.add(p, t), s), V.add(V.add(p, s), t), V.sub(V.add(p, s), t)];
    this.hexa([...ring(a), ...ring(b)], slot);
  }
  sphere(r, slot, subdiv, centre = [0, 0, 0]) {
    const { points, faces } = icosphere(subdiv);
    const ids = points.map((p) => this.vert(V.add(centre, V.mul(p, r)), p, slot));
    for (const f of faces) this.tri(ids[f[0]], ids[f[1]], ids[f[2]]);
  }
  /* A flat band lying just above a unit sphere along a closed curve. Radial normals, so it takes
     the ball's own shading and never reads as a raised tube. */
  ribbon(curve, width, slot, r = 1.008) {
    const n = curve.length, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const p = V.norm(curve[i]);
      const t = V.norm(V.sub(curve[(i + 1) % n], curve[(i + n - 1) % n]));
      const s = V.mul(V.norm(V.cross(p, t)), width / 2);
      const l = V.norm(V.add(p, s)), rr = V.norm(V.sub(p, s));
      L.push(this.vert(V.mul(l, r), l, slot)); R.push(this.vert(V.mul(rr, r), rr, slot));
    }
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; this.quad(L[i], R[i], R[j], L[j]); }
  }
  /* Bake a transform into the geometry (positions and normals). */
  transform(fn) {
    this.pos = this.pos.map(fn);
    this.nor = this.nor.map((n) => V.norm(fn(n)));
  }
  /* Centre on the bounding box and scale so the farthest vertex sits at `radius`. */
  fit(radius = 1) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const p of this.pos) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
    const c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    let far = 0;
    for (const p of this.pos) far = Math.max(far, V.len(V.sub(p, c)));
    const s = radius / far;
    this.pos = this.pos.map((p) => V.mul(V.sub(p, c), s));
  }
}

export function icosphere(subdiv) {
  const t = (1 + Math.sqrt(5)) / 2;
  let points = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(V.norm);
  let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let s = 0; s < subdiv; s++) {
    const mid = new Map(), next = [];
    const m = (a, b) => {
      const k = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (!mid.has(k)) { points.push(V.norm(V.add(points[a], points[b]))); mid.set(k, points.length - 1); }
      return mid.get(k);
    };
    for (const [a, b, c] of faces) { const ab = m(a, b), bc = m(b, c), ca = m(c, a); next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
    faces = next;
  }
  return { points, faces };
}

/* ---------- GLB ---------- */
const pad4 = (n) => (n + 3) & ~3;
export function toGlb(mesh, meta) {
  mesh.end();
  const T = tokens();
  const n = mesh.pos.length;
  if (n > 65535) throw new Error(`${mesh.key}: ${n} vertices will not index as uint16`);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Uint8Array(n * 4), pal = new Uint8Array(n * 4);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const palette = mesh.palette.map((p) => ({ name: p.name, ramp: p.ramp, hex: p.ramp.map((t) => T[t]) }));
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      pos[i * 3 + k] = mesh.pos[i][k]; nor[i * 3 + k] = mesh.nor[i][k];
      const f = pos[i * 3 + k]; lo[k] = Math.min(lo[k], f); hi[k] = Math.max(hi[k], f);
    }
    const rgb = hexToRgb(palette[mesh.pal[i]].hex[0]);
    col.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
    pal[i * 4] = mesh.pal[i];
  }
  const idx = new Uint16Array(mesh.tris.length * 3);
  mesh.tris.forEach((t, i) => idx.set(t, i * 3));

  const chunks = [pos, nor, col, pal, idx].map((a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  const views = []; let off = 0;
  for (const c of chunks) { views.push({ byteOffset: off, byteLength: c.length }); off = pad4(off + c.length); }
  const bin = Buffer.alloc(off);
  chunks.forEach((c, i) => c.copy(bin, views[i].byteOffset));

  const json = {
    asset: { version: "2.0", generator: "thearchv scripts/build-sport-icons.mjs" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: mesh.key }],
    materials: [{ name: "toon", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 } }],
    meshes: [{
      name: mesh.key,
      primitives: [{ attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2, _PALETTE: 3 }, indices: 4, material: 0, mode: 4 }],
      extras: { sport: mesh.key, ...SCENE, ...meta, palette },
    }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, ...views[0], target: 34962 },
      { buffer: 0, ...views[1], target: 34962 },
      { buffer: 0, ...views[2], byteStride: 4, target: 34962 },
      { buffer: 0, ...views[3], byteStride: 4, target: 34962 },
      { buffer: 0, ...views[4], target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: n, type: "VEC3", min: lo, max: hi },
      { bufferView: 1, componentType: 5126, count: n, type: "VEC3" },
      { bufferView: 2, componentType: 5121, normalized: true, count: n, type: "VEC4" },
      { bufferView: 3, componentType: 5121, count: n, type: "SCALAR" },
      { bufferView: 4, componentType: 5123, count: idx.length, type: "SCALAR" },
    ],
  };
  let js = Buffer.from(JSON.stringify(json), "utf8");
  js = Buffer.concat([js, Buffer.alloc(pad4(js.length) - js.length, 0x20)]);
  const head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const h1 = Buffer.alloc(8); h1.writeUInt32LE(js.length, 0); h1.writeUInt32LE(0x4e4f534a, 4);
  const h2 = Buffer.alloc(8); h2.writeUInt32LE(bin.length, 0); h2.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, h1, js, h2, bin]);
}

/* Minimal reader, the mirror of the one in public/sport-icons/icon.js. Used by the tests and the
   --check step, so what is asserted is what the browser will parse. */
export function readGlb(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67 || buf.readUInt32LE(4) !== 2) throw new Error("not a glTF 2.0 binary");
  if (buf.readUInt32LE(8) !== buf.length) throw new Error("GLB length field disagrees with the file");
  const jl = buf.readUInt32LE(12);
  if (buf.readUInt32LE(16) !== 0x4e4f534a) throw new Error("first chunk is not JSON");
  const json = JSON.parse(buf.subarray(20, 20 + jl).toString("utf8"));
  const bo = 20 + jl;
  if (buf.readUInt32LE(bo + 4) !== 0x004e4942) throw new Error("second chunk is not BIN");
  const bin = buf.subarray(bo + 8, bo + 8 + buf.readUInt32LE(bo));
  const prim = json.meshes[0].primitives[0];
  const acc = (i) => {
    const a = json.accessors[i], v = json.bufferViews[a.bufferView];
    const comps = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type];
    const size = { 5126: 4, 5121: 1, 5123: 2 }[a.componentType];
    const stride = v.byteStride || comps * size;
    const out = [];
    for (let k = 0; k < a.count; k++) {
      const row = [];
      for (let c = 0; c < comps; c++) {
        const o = (v.byteOffset || 0) + (a.byteOffset || 0) + k * stride + c * size;
        row.push(a.componentType === 5126 ? bin.readFloatLE(o) : a.componentType === 5123 ? bin.readUInt16LE(o) : bin.readUInt8(o));
      }
      out.push(comps === 1 ? row[0] : row);
    }
    return out;
  };
  return {
    json,
    extras: json.meshes[0].extras,
    pos: acc(prim.attributes.POSITION),
    nor: acc(prim.attributes.NORMAL),
    col: acc(prim.attributes.COLOR_0),
    pal: acc(prim.attributes._PALETTE),
    idx: acc(prim.indices),
  };
}
