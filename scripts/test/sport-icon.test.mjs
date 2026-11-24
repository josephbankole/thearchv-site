/* sport-icon.test.mjs — the sport icons' contract, checked against the COMMITTED assets.
 *
 * Runs in `npm run test:home` (so inside `npm run build`). It reads public/ and the source
 * files, never dist, so it holds before a build as well as after one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { ROOT, readGlb, tokens, RAMPS, TOKEN_NAMES } from "../icons/lib.mjs";
import { SPORT_ICON_ALT, SPORT_GLYPHS, sportGlyph, ICON_ONLY } from "../icons/markup.mjs";
import { GLB_CAP, SVG_CAP, SPORT_ICON_KEYS, generate } from "../build-sport-icons.mjs";
import { SPORTS, sportIcon, sportNav, shopTab, SHOP_URL } from "../shared/page-shell.mjs";

const DIR = join(ROOT, "public", "sport-icons");
const KEYS = SPORTS.map((s) => s.key);
const read = (f) => readFileSync(join(DIR, f));
const TOKEN_HEX = new Set(Object.values(tokens()));
const ICON_ONLY_HEX = new Set(Object.values(ICON_ONLY));

test("every sport in SPORTS has a generator, an alt line and a tab glyph, and nothing extra", () => {
  assert.deepEqual([...SPORT_ICON_KEYS].sort(), [...KEYS].sort());
  assert.deepEqual(Object.keys(SPORT_ICON_ALT).sort(), [...KEYS].sort());
  assert.deepEqual(Object.keys(SPORT_GLYPHS).sort(), [...KEYS].sort());
});

test("src/data/sports.ts lists the same keys", () => {
  const ts = readFileSync(join(ROOT, "src", "data", "sports.ts"), "utf8");
  const keys = [...ts.matchAll(/\{ key: '([a-z0-9]+)'/g)].map((m) => m[1]);
  assert.deepEqual(keys.sort(), [...KEYS].sort());
});

for (const key of KEYS) {
  test(`${key}.glb is committed, standard, small and matches its generator`, () => {
    assert.ok(existsSync(join(DIR, `${key}.glb`)), "missing: run npm run sport-icons");
    const buf = read(`${key}.glb`);
    assert.ok(buf.length <= GLB_CAP, `${buf.length} bytes is over the ${GLB_CAP} cap`);
    const g = readGlb(buf);
    const j = g.json;
    assert.equal(j.asset.version, "2.0");
    assert.equal(j.meshes.length, 1, "one mesh");
    assert.equal(j.meshes[0].primitives.length, 1, "one primitive");
    assert.equal(j.images, undefined, "no textures");
    assert.equal(j.textures, undefined, "no textures");
    assert.equal(j.extensionsUsed, undefined, "no extensions: the CSP has no wasm, and USDZ conversion wants plain glTF");
    assert.equal(j.extensionsRequired, undefined);
    const prim = j.meshes[0].primitives[0];
    assert.deepEqual(Object.keys(prim.attributes).sort(), ["COLOR_0", "NORMAL", "POSITION", "_PALETTE"]);
    assert.equal(j.accessors[prim.indices].componentType, 5123, "uint16 indices");
    assert.ok(g.pos.length > 0 && g.pos.length < 65536);
    assert.equal(g.idx.length % 3, 0);
    assert.ok(g.idx.every((i) => i < g.pos.length), "an index points past the vertices");
    // unit-ish: the runtime camera assumes the object sits inside a sphere of about radius 1
    const far = Math.max(...g.pos.map((p) => Math.hypot(...p)));
    assert.ok(far > 0.9 && far < 1.2, `bounding radius ${far}`);
    for (const n of g.nor) assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-3, "a normal is not unit length");
    // palette: token names only, baked hex equal to the live token, every vertex in a known slot
    const X = g.extras;
    assert.equal(X.sport, key);
    assert.equal(X.alt, SPORT_ICON_ALT[key]);
    assert.ok(X.palette.length >= 1 && X.palette.length <= 8, "the shader holds eight slots");
    const T = tokens();
    for (const p of X.palette) {
      assert.deepEqual(p.ramp, RAMPS[p.name]);
      p.ramp.forEach((name, i) => {
        // Token names only, bar the founder-approved optic yellow felt, on the tennis ball alone.
        const iconOnly = key === "tennis" && p.name === "felt" && Object.hasOwn(ICON_ONLY, name);
        assert.ok(TOKEN_NAMES.includes(name) || iconOnly, `${key}: ${name} is not a core token`);
        assert.equal(p.hex[i], iconOnly ? ICON_ONLY[name] : T[name], `${key}: baked ${name} is stale. Run npm run sport-icons.`);
      });
    }
    assert.ok(g.pal.every((s) => s < X.palette.length));
    g.col.forEach((c, i) => {
      const hex = "#" + c.slice(0, 3).map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
      assert.equal(hex, X.palette[g.pal[i]].hex[0], "COLOR_0 is not the slot's lit token");
    });
    // and it is what the generator makes today
    const want = readGlb(generate(key).glb);
    assert.equal(g.pos.length, want.pos.length, "stale: run npm run sport-icons");
    assert.deepEqual(g.idx, want.idx, "stale: run npm run sport-icons");
    assert.deepEqual(X, want.extras, "stale: run npm run sport-icons");
  });

  test(`${key}.svg poster is committed, small, sized, labelled and in palette`, () => {
    assert.ok(existsSync(join(DIR, `${key}.svg`)), "missing: run npm run sport-icons");
    const svg = read(`${key}.svg`).toString("utf8");
    assert.ok(svg.length <= SVG_CAP, `${svg.length} bytes is over the ${SVG_CAP} cap`);
    assert.match(svg, /^<svg [^>]*viewBox="0 0 192 192"[^>]*width="96"[^>]*height="96"/);
    assert.ok(svg.includes(`<title>${SPORT_ICON_ALT[key]}</title>`));
    assert.ok(!/<script|<image|<text|href=|url\(/.test(svg), "a poster is paths only: no script, image, text or link");
    for (const [hex] of svg.matchAll(/#[0-9A-Fa-f]{6}\b/g)) assert.ok(TOKEN_HEX.has(hex.toUpperCase()) || (key === "tennis" && ICON_ONLY_HEX.has(hex.toUpperCase())), `${hex} is not a token colour`);
  });
}

test("sportIcon() writes a poster with width, height and alt, and one self-hosted module", () => {
  for (const key of KEYS) {
    const html = sportIcon(key);
    const img = html.match(/<img [^>]*>/)[0];
    assert.match(img, /\swidth="96"/);
    assert.match(img, /\sheight="96"/);
    assert.ok(img.includes(`alt="${SPORT_ICON_ALT[key]}"`));
    assert.match(img, new RegExp(`src="/sport-icons/${key}\\.svg\\?v=[0-9a-f]{10}"`));
    assert.match(html, new RegExp(`data-src="/sport-icons/${key}\\.glb\\?v=[0-9a-f]{10}"`));
    const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length, 1);
    assert.match(scripts[0][1], /type="module" src="\/sport-icons\/icon\.js\?v=[0-9a-f]{10}"/);
    assert.equal(scripts[0][2], "", "no inline script body: an inline body would need a CSP hash");
    assert.ok(!/canvas/.test(html), "the canvas is made by the module, never server-rendered");
  }
  assert.throws(() => sportIcon("curling"));
});

test("alt lines and glyphs are plain: no brand, no em dash", () => {
  for (const key of KEYS) {
    assert.ok(SPORT_ICON_ALT[key].length > 5);
    assert.ok(!/[—–#]/.test(SPORT_ICON_ALT[key]));
    assert.ok(!/<text|<image|href/.test(SPORT_GLYPHS[key]), "a glyph is strokes only");
    const own = [...sportGlyph(key).matchAll(/#[0-9a-f]{3,6}\b/gi)].map((m) => m[0]);
    assert.deepEqual(own, key === "tennis" ? [ICON_ONLY["icon-tennis-felt"]] : [], "a glyph takes the link's colour; only the tennis felt has its own");
  }
});

test("the tab bar carries a static glyph per sport and never a canvas or an icon mount", () => {
  for (const home of [false, true]) {
    const nav = sportNav("football", { home });
    for (const key of KEYS) assert.ok(nav.includes(sportGlyph(key)), `${key} glyph missing`);
    assert.ok(!/canvas|data-sport-icon/.test(nav));
  }
});

test("index.html is in step: the same six glyphs in the tab bar, the football mount outside the scroller", () => {
  const html = readFileSync(join(ROOT, "index.html"), "utf8").replace(/<!--[\s\S]*?-->/g, "");
  const nav = html.match(/<nav class="sportnav"[\s\S]*?<\/nav>/)[0];
  for (const s of SPORTS) assert.ok(nav.includes(`${sportGlyph(s.key)}${s.shortLabel}</a>`), `${s.key} tab is out of step with sportNav()`);
  assert.ok(!/data-sport-icon/.test(nav));
  const mount = sportIcon("football", { size: 40, modifier: "sport-icon--strip", script: false, versioned: false });
  assert.ok(html.includes(mount), "the homepage football mount is out of step with sportIcon()");
  assert.equal(html.match(/data-sport-icon=/g).length, 1, "one live icon on the homepage");
  const track = html.match(/<ul class="scores-strip__track"[\s\S]*?<\/ul>/)[0];
  assert.ok(!/data-sport-icon/.test(track), "never inside the scrolling track");
});

test("the Shop tab ends the row in both copies, is never current and carries no transform", () => {
  const tab = shopTab();
  assert.ok(tab.includes(`href="${SHOP_URL}"`) && !/aria-current|target=/.test(tab));
  for (const key of [...SPORTS.map((s) => s.key), "nope"]) {
    for (const home of [false, true]) {
      const row = sportNav(key, { home }).match(/<div class="sportnav__row">([\s\S]*?)<\/div>/)[1].trim();
      assert.ok(row.endsWith(tab), `${key}: the Shop tab is not last`);
    }
  }
  const html = readFileSync(join(ROOT, "index.html"), "utf8").replace(/<!--[\s\S]*?-->/g, "");
  const row = html.match(/<div class="sportnav__row">([\s\S]*?)<\/div>/)[1].trim();
  assert.ok(row.endsWith(tab), "index.html's Shop tab is out of step with shopTab()");
  const shell = readFileSync(join(ROOT, "scripts", "shared", "page-shell.mjs"), "utf8");
  const home = readFileSync(join(ROOT, "src", "style.css"), "utf8");
  for (const css of [shell, home]) for (const rule of css.match(/\.sportnav__link--shop[^{]*\{[^}]*\}/g)) assert.ok(!/transform|margin|padding|height/.test(rule), rule);
});

test("the runtime keeps its scroll promises", () => {
  const src = read("icon.js").toString("utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(statSync(join(DIR, "icon.js")).size < 24 * 1024, "icon.js has grown past 24 KB");
  assert.ok(!/preventDefault/.test(code), "never preventDefault: a vertical swipe on the icon must scroll the page");
  assert.ok(!/["'`](wheel|touchstart|touchmove|touchend|mousewheel)["'`]/.test(code), "no wheel or touch listeners");
  assert.ok(!/\bimport\s+[^(]/.test(code), "no static imports: it is one self-contained file");
  assert.ok(!/https?:\/\//.test(code), "nothing off-site");
  assert.ok(/setPointerCapture/.test(code) && /d\.touch && ay >= ax/.test(code), "capture only after horizontal intent");
  assert.ok(/webglcontextlost/.test(code) && /visibilitychange/.test(code) && /IntersectionObserver/.test(code));
  assert.ok(/reduced-motion/.test(code) && /prefers-reduced-motion/.test(code));
});

test("both style copies give the canvas touch-action: pan-y and keep the tab-bar guard", () => {
  const shell = readFileSync(join(ROOT, "scripts", "shared", "page-shell.mjs"), "utf8");
  const home = readFileSync(join(ROOT, "src", "style.css"), "utf8");
  for (const css of [shell, home]) {
    const rule = css.match(/\n\s*\.sport-icon__canvas \{[^}]*\}/)[0];
    assert.match(rule, /touch-action: pan-y pinch-zoom;/);
    assert.ok(!/transform/.test(css.match(/\.sport-icon \{[^}]*\}/)[0]));
    assert.match(css, /\.sportnav \{[^}]*overflow-y: hidden/);
  }
});

test("the optic yellow felt is the tennis icon's alone: in no stylesheet, no token block and no other ramp", () => {
  assert.deepEqual(Object.keys(ICON_ONLY), RAMPS.felt, "the only icon-only colours are the three felt steps");
  for (const [name, ramp] of Object.entries(RAMPS)) if (name !== "felt") for (const step of ramp) assert.ok(TOKEN_NAMES.includes(step), `${name}: ${step} is not a core token`);
  for (const key of KEYS) if (key !== "tennis") assert.ok(!generate(key).built.mesh.palette.some((p) => p.name === "felt"), `${key} uses the felt ramp`);
  for (const file of ["src/style.css", "scripts/shared/page-shell.mjs", "public/sport-icons/icon.js"]) {
    const text = readFileSync(join(ROOT, file), "utf8").toUpperCase();
    for (const [name, hex] of Object.entries(ICON_ONLY)) {
      assert.ok(!text.includes(hex), `${hex} must not be written into ${file}`);
      assert.ok(!text.includes(`--${name}`.toUpperCase()), `--${name} must not become a custom property (${file})`);
    }
  }
});
