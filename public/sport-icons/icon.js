/* public/sport-icons/icon.js — the sport icons, drawn live. One file, no dependency, no build.
 *
 * WHAT IT DOES. Finds every <span data-sport-icon="..."> on the page. Each one already holds a
 * server-rendered SVG poster, and that poster is the whole experience with no JavaScript, with
 * no WebGL2 or after a lost context. When the icon is near the viewport and the browser is idle,
 * this fetches the sport's .glb, draws it on a small WebGL2 canvas at the exact pose of the
 * poster, and fades the canvas in over it. Then the object turns slowly and can be spun by hand.
 *
 * WHY IT IS HAND-WRITTEN. three.js is about 120 KB gzipped before it draws anything, and its
 * look is glossy by default. This is a toon ramp, an ink outline and a drag handler: a few
 * kilobytes, and every pointer decision is ours. It is a plain file under script-src 'self',
 * like /search/search.js, so it needs no CSP hash. The meshes are uncompressed on purpose: the
 * CSP has no 'wasm-unsafe-eval', so a Draco or meshopt decoder would fail without a sound.
 *
 * SCROLL SAFETY IS THE RULE THIS FILE IS WRITTEN ROUND (trap 3 in CLAUDE.md). A reader who puts
 * a thumb on the icon and swipes up must scroll the page, every time.
 *   - The canvas is `touch-action: pan-y` (set in CSS), so the browser keeps every vertical pan.
 *   - Nothing here calls preventDefault on a pointer or touch event. There is no wheel listener.
 *   - A touch only becomes a drag after it has moved sideways further than up or down. Until
 *     then the pointer is not captured, and a vertical start gives the gesture up for good.
 *   - It refuses to start inside .sportnav or any element that scrolls sideways.
 *   - The poster-to-canvas change is opacity only. Nothing is transformed at rest.
 *
 * REDUCED MOTION is a designed state: one still frame at the rest pose, no idle turn, no hover
 * lean, no coasting. Dragging still works, because that is the reader moving it, not us.
 */
const SEL = "[data-sport-icon]";
const IDLE = 0.25; // rad/s
const TAU_COAST = 0.6; // s, how fast a flick settles back to the idle turn
const MAX_CSS = 160;
const DEG = Math.PI / 180;

const VS = `#version 300 es
precision highp float;
in vec3 aPos; in vec3 aNor; in vec3 aHull; in float aPal;
uniform mat4 uProj; uniform mat3 uRot; uniform float uDist; uniform float uHull; uniform vec2 uPx;
out vec3 vN; flat out int vPal;
void main() {
  vec3 p = uRot * aPos;
  vec4 clip = uProj * vec4(p.xy, p.z - uDist, 1.0);
  vN = uRot * aNor;
  if (uHull > 0.5) {
    vec2 d = (uRot * aHull).xy; float l = length(d);
    if (l > 1e-4) clip.xy += (d / l) * uPx * clip.w;
  }
  vPal = int(aPal + 0.5);
  gl_Position = clip;
}`;
const FS = `#version 300 es
precision highp float;
in vec3 vN; flat in int vPal;
uniform vec3 uRamp[24]; uniform vec3 uInk; uniform vec3 uL; uniform vec2 uBands; uniform float uHull;
out vec4 o;
void main() {
  if (uHull > 0.5) { o = vec4(uInk, 1.0); return; }
  float nl = dot(normalize(vN), uL);
  float w = fwidth(nl) * 0.7 + 1e-5;
  float lit = smoothstep(uBands.x - w, uBands.x + w, nl);
  float mid = smoothstep(uBands.y - w, uBands.y + w, nl);
  o = vec4(mix(uRamp[vPal * 3 + 2], mix(uRamp[vPal * 3 + 1], uRamp[vPal * 3], lit), mid), 1.0);
}`;

const reduced = () =>
  document.documentElement.classList.contains("reduced-motion") ||
  (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

/* A canvas that rotates on drag has no business inside something that scrolls sideways. */
function insideScroller(el) {
  for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
    if (n.classList.contains("sportnav")) return true;
    const ox = getComputedStyle(n).overflowX;
    if (ox === "auto" || ox === "scroll") return true;
  }
  return false;
}

/* ---------- GLB: the least reader that reads what scripts/icons/lib.mjs writes ---------- */
function parseGlb(buf) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67 || dv.getUint32(4, true) !== 2) throw new Error("not glTF 2");
  const jl = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jl)));
  const binAt = 20 + jl + 8;
  const prim = json.meshes[0].primitives[0];
  const read = (i, Type, comps) => {
    const a = json.accessors[i], v = json.bufferViews[a.bufferView];
    const start = binAt + (v.byteOffset || 0) + (a.byteOffset || 0);
    const stride = v.byteStride || comps * Type.BYTES_PER_ELEMENT;
    if (stride === comps * Type.BYTES_PER_ELEMENT) return new Type(buf.slice(start, start + a.count * stride));
    const out = new Type(a.count * comps), src = new DataView(buf, start);
    for (let k = 0; k < a.count; k++) for (let c = 0; c < comps; c++) out[k * comps + c] = src.getUint8(k * stride + c);
    return out;
  };
  return {
    extras: json.meshes[0].extras,
    pos: read(prim.attributes.POSITION, Float32Array, 3),
    nor: read(prim.attributes.NORMAL, Float32Array, 3),
    pal: read(prim.attributes._PALETTE, Uint8Array, 1),
    idx: read(prim.indices, Uint16Array, 1),
  };
}

/* The ink line is an inverted hull: back faces pushed out along the normal. On a flat-shaded
   box every corner has three normals, so the hull would split open there. Average the normals
   of vertices that share a position and it stays closed. Done here, so the file carries none. */
function hullNormals(pos, nor) {
  const sum = new Map(), n = pos.length / 3, keys = new Array(n);
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos[i * 3] * 2e3)},${Math.round(pos[i * 3 + 1] * 2e3)},${Math.round(pos[i * 3 + 2] * 2e3)}`;
    keys[i] = k;
    const s = sum.get(k) || [0, 0, 0];
    s[0] += nor[i * 3]; s[1] += nor[i * 3 + 1]; s[2] += nor[i * 3 + 2];
    sum.set(k, s);
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const s = sum.get(keys[i]), l = Math.hypot(s[0], s[1], s[2]) || 1;
    out[i * 3] = s[0] / l; out[i * 3 + 1] = s[1] / l; out[i * 3 + 2] = s[2] / l;
  }
  return out;
}

function colour(el, name, fallback) {
  let v = getComputedStyle(el).getPropertyValue(`--${name}`).trim();
  if (!/^#[0-9a-f]{6}$/i.test(v)) v = fallback;
  return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
}

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
  return s;
}

async function start(el) {
  if (el.dataset.sportIconState) return;
  el.dataset.sportIconState = "loading";
  const res = await fetch(el.dataset.src, { credentials: "omit" });
  if (!res.ok) throw new Error(`glb ${res.status}`);
  const mesh = parseGlb(await res.arrayBuffer());
  const X = mesh.extras;

  const canvas = document.createElement("canvas");
  canvas.className = "sport-icon__canvas";
  canvas.setAttribute("aria-hidden", "true");
  const gl = canvas.getContext("webgl2", { alpha: true, antialias: true, premultipliedAlpha: true, depth: true, powerPreference: "low-power" });
  if (!gl) { el.dataset.sportIconState = "poster"; return; }

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || "link");
  gl.useProgram(prog);
  const U = (n) => gl.getUniformLocation(prog, n);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const attr = (name, data, size) => {
    const loc = gl.getAttribLocation(prog, name);
    if (loc < 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  };
  attr("aPos", mesh.pos, 3);
  attr("aNor", mesh.nor, 3);
  attr("aHull", hullNormals(mesh.pos, mesh.nor), 3);
  attr("aPal", Float32Array.from(mesh.pal), 1);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.idx, gl.STATIC_DRAW);

  // Colours come from the page's own tokens. The hex baked into the file is only the fallback.
  const ramp = new Float32Array(72);
  X.palette.forEach((p, i) => p.ramp.forEach((name, b) => ramp.set(colour(el, name, p.hex[b]), (i * 3 + b) * 3)));
  gl.uniform3fv(U("uRamp"), ramp);
  gl.uniform3fv(U("uInk"), colour(el, "ink", "#1E223D"));
  gl.uniform3fv(U("uL"), X.light);
  gl.uniform2fv(U("uBands"), X.bands);
  gl.uniform1f(U("uDist"), X.camera.dist);
  const f = 1 / Math.tan((X.camera.fov * DEG) / 2), near = 1, far = 20;
  gl.uniformMatrix4fv(U("uProj"), false, [f, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0]);
  const uRot = U("uRot"), uHull = U("uHull"), uPx = U("uPx");
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.clearColor(0, 0, 0, 0);

  const still = reduced();
  const S = { yaw: X.pose.yaw * DEG, tilt: 0, lean: [0, 0], leanTo: [0, 0], vel: 0, drag: null, seen: true, dead: false, raf: 0, last: 0, spin: false };
  let css = 0;

  function size() {
    css = Math.min(MAX_CSS, el.clientWidth || 96);
    const px = Math.max(1, Math.round(css * Math.min(2, window.devicePixelRatio || 1)));
    if (canvas.width !== px) { canvas.width = px; canvas.height = px; }
    gl.viewport(0, 0, px, px);
    const line = Math.max(1, css / 64) * (px / css); // about 1.5 CSS px at 96
    gl.uniform2f(uPx, (2 * line) / px, (2 * line) / px);
  }
  function draw() {
    if (S.dead) return;
    const y = S.yaw + S.lean[0], t = X.pose.tilt * DEG + S.tilt + S.lean[1];
    const cy = Math.cos(y), sy = Math.sin(y), ct = Math.cos(t), st = Math.sin(t);
    // Rx(tilt) * Ry(yaw), column-major
    gl.uniformMatrix3fv(uRot, false, [cy, st * sy, -ct * sy, 0, ct, st, sy, -st * cy, ct * cy]);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform1f(uHull, 0); gl.cullFace(gl.BACK);
    gl.drawElements(gl.TRIANGLES, mesh.idx.length, gl.UNSIGNED_SHORT, 0);
    gl.uniform1f(uHull, 1); gl.cullFace(gl.FRONT);
    gl.drawElements(gl.TRIANGLES, mesh.idx.length, gl.UNSIGNED_SHORT, 0);
  }
  const moving = () => S.spin || S.drag?.on || Math.abs(S.vel) > 0.01 || Math.abs(S.tilt) > 0.002 ||
    Math.abs(S.lean[0] - S.leanTo[0]) + Math.abs(S.lean[1] - S.leanTo[1]) > 0.002;
  function frame(now) {
    S.raf = 0;
    if (S.dead) return;
    const dt = Math.min(0.05, (now - S.last) / 1000 || 0.016);
    S.last = now;
    if (!S.drag?.on) {
      const target = S.spin ? IDLE : 0;
      S.vel += (target - S.vel) * (1 - Math.exp(-dt / TAU_COAST));
      S.yaw += S.vel * dt;
      S.tilt *= Math.exp(-dt / 0.9);
    }
    for (let k = 0; k < 2; k++) S.lean[k] += (S.leanTo[k] - S.lean[k]) * (1 - Math.exp(-dt / 0.18));
    draw();
    wake();
  }
  function wake() {
    if (S.raf || S.dead || !S.seen || document.hidden || !moving()) return;
    S.last = performance.now();
    S.raf = requestAnimationFrame(frame);
  }

  /* ---------- pointer. Read the header before changing a line of this. ---------- */
  const K = () => 3.6 / Math.max(48, css); // one icon-width of drag is about 200 degrees
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || S.drag) return;
    S.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, on: false, touch: e.pointerType !== "mouse", t: performance.now() };
  });
  canvas.addEventListener("pointermove", (e) => {
    const d = S.drag;
    if (!d || d.id !== e.pointerId) {
      if (e.pointerType === "mouse" && !still && !d) {
        const r = canvas.getBoundingClientRect();
        S.leanTo = [((e.clientX - r.left) / r.width - 0.5) * 16 * DEG, ((e.clientY - r.top) / r.height - 0.5) * 16 * DEG];
        wake();
      }
      return;
    }
    if (!d.on) {
      const ax = Math.abs(e.clientX - d.sx), ay = Math.abs(e.clientY - d.sy);
      if (Math.max(ax, ay) < 6) return;
      if (d.touch && ay >= ax) { S.drag = null; return; } // a vertical start belongs to the page
      d.on = true; d.x = e.clientX; d.y = e.clientY; d.t = performance.now();
      S.leanTo = [0, 0];
      try { canvas.setPointerCapture(e.pointerId); } catch { /* the pointer has already gone */ }
      el.classList.add("is-dragging");
    }
    const now = performance.now(), dx = e.clientX - d.x, dy = e.clientY - d.y, k = K();
    S.yaw += dx * k;
    if (!d.touch) S.tilt = Math.max(-0.6, Math.min(0.6, S.tilt + dy * k));
    const dt = Math.max(1, now - d.t) / 1000;
    S.vel = S.vel * 0.5 + ((dx * k) / dt) * 0.5;
    d.x = e.clientX; d.y = e.clientY; d.t = now;
    if (still) draw(); else wake();
  });
  const release = (e) => {
    const d = S.drag;
    if (!d || d.id !== e.pointerId) return;
    S.drag = null;
    el.classList.remove("is-dragging");
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* never captured */ }
    if (still) { S.vel = 0; S.tilt = 0; draw(); return; }
    if (performance.now() - d.t > 120) S.vel = 0; // held still before letting go: no flick
    S.vel = Math.max(-10, Math.min(10, S.vel));
    wake();
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("pointerleave", () => { S.leanTo = [0, 0]; wake(); });

  /* ---------- lifecycle ---------- */
  canvas.addEventListener("webglcontextlost", () => {
    S.dead = true;
    if (S.raf) cancelAnimationFrame(S.raf);
    el.classList.remove("is-live", "is-dragging");
    el.dataset.sportIconState = "poster";
    canvas.remove();
  });
  new IntersectionObserver((entries) => { S.seen = entries[entries.length - 1].isIntersecting; wake(); }).observe(el);
  document.addEventListener("visibilitychange", wake);
  if (window.ResizeObserver) new ResizeObserver(() => { if (!S.dead) { size(); draw(); } }).observe(el);

  el.appendChild(canvas);
  size();
  draw();
  // Two frames, so the first drawn frame is on screen before the fade starts.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (S.dead) return;
    el.classList.add("is-live");
    el.dataset.sportIconState = "live";
    if (!still) setTimeout(() => { S.spin = true; wake(); }, 450);
  }));
}

export function mount(el) {
  if (!el || el.dataset.sportIconMounted) return;
  el.dataset.sportIconMounted = "1";
  if (!el.dataset.src || !window.WebGL2RenderingContext || !window.IntersectionObserver || insideScroller(el)) return;
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    idle(() => start(el).catch((err) => {
      // The poster is still there, so a failure costs the reader nothing. Say why, quietly.
      console.warn("[sport-icon] staying on the poster:", err);
      el.classList.remove("is-live"); el.dataset.sportIconState = "poster";
    }), { timeout: 1500 });
  }, { rootMargin: "200px" });
  io.observe(el);
}

export function mountAll(root = document) {
  root.querySelectorAll(SEL).forEach(mount);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => mountAll());
else mountAll();
