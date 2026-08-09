/* Build every crest-derived asset the site serves, from the one committed monogram SVG.
 *
 * Run it with `npm run crest`; it also runs first in `npm run build`, so a crest asset can
 * never drift from its source. Before this existed, `scripts/brand-assets.mjs` built the two
 * logo-badge files and NOTHING generated the five crest-badge files or any favicon: those were
 * made by hand, off-repo, and a brand change meant redoing that by hand. That gap is closed —
 * after this script, no crest asset exists that a script cannot regenerate.
 *
 * SOURCE OF TRUTH: scripts/brand/crest-monogram-{light,ink}.svg
 *   Option 02, the monogram (founder pick, 2026-08-09): one Anton A at full field height, its
 *   crossbar overprinted by an accent rule, the name moved out to the ring. Type is outlined,
 *   not live, so nothing depends on Anton being installed. The two files are the same geometry
 *   in the two colourways the brief designed: `light` is ink marks for white grounds, `ink` is
 *   paper marks on the #1E223D ground. Both are needed. On the ink ground the wordmark's
 *   THE/ARCHV colour split cannot clear AA, which is why the dark colourway exists as its own
 *   drawing rather than as a filter over the light one.
 *
 * Every element in both sources carries a `data-crest` role, and that is the whole mechanism
 * here. Two variants are cut from the same drawing by keeping or dropping roles:
 *
 *   full     everything. For 192px and up, where the ring type is legible.
 *   compact  ground, disc, accent ring, letter, crossbar. No ring type, no dots, no keyline.
 *            For 180px and down. The ring type stops being legible around 120px and the 2.5px
 *            keyline is a sixteenth of a pixel at favicon scale, so at small sizes they are not
 *            detail, they are grey. A seal is allowed to carry two amounts of information at
 *            two sizes; dropping them is the reason the mark still reads at 16px.
 *
 * GROUND: the `ground` role is the full-bleed square behind the disc. Dropped, the asset is a
 * disc on transparency, which is what every in-page crest wants so it sits on white or on the
 * sunken grey without a visible corner. Kept, the asset is an opaque square, which is what the
 * favicons and apple-touch-icon want: iOS composites a transparent touch icon onto black.
 */
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = join(__dirname, "brand");
const PUBLIC = join(ROOT, "public");
const BRAND = join(PUBLIC, "brand");

const SOURCES = {
  light: readFileSync(join(SRC, "crest-monogram-light.svg"), "utf8"),
  ink: readFileSync(join(SRC, "crest-monogram-ink.svg"), "utf8"),
};

const FULL = new Set(["ground", "disc", "keyline", "ring", "ringtype", "dot", "letter", "bar"]);
const COMPACT = new Set(["ground", "disc", "ring", "letter", "bar"]);

/** Cut a variant out of a source drawing. `keep` is the role set; `ground:false` drops the square. */
function variant(svg, { keep = FULL, ground = false, size = null } = {}) {
  const out = svg
    .split("\n")
    .filter((line) => {
      const m = line.match(/data-crest="([a-z]+)"/);
      if (!m) return true;
      const role = m[1];
      if (role === "ground") return ground;
      return keep.has(role);
    })
    .join("\n");
  if (!out.includes('data-crest="letter"')) throw new Error("crest variant lost the letter");
  // Rasterise at native resolution rather than letting sharp scale a 512px render.
  return size ? out.replace(/width="512" height="512"/, `width="${size}" height="${size}"`) : out;
}

async function png(svg, size, path) {
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(path);
  return `${path.replace(ROOT + "/", "")} (${size}px)`;
}

async function webp(svg, size, path) {
  await sharp(Buffer.from(svg)).webp({ quality: 92, alphaQuality: 100 }).toFile(path);
  return `${path.replace(ROOT + "/", "")} (${size}px)`;
}

/** Minimal ICO writer: an icon directory plus one embedded PNG per size (Vista+, every browser). */
function ico(images) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const dir = [];
  for (const { size, data } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    dir.push(e);
    offset += data.length;
  }
  return Buffer.concat([head, ...dir, ...images.map((i) => i.data)]);
}

await mkdir(BRAND, { recursive: true });
const wrote = [];

/* ---------- in-page crests: light colourway, disc on transparency ---------- */
// crest-badge* are the site's crest. Filenames and sizes are held to what shipped before so no
// cached or external reference 404s; crest-badge@512.png was a 797px hand render and is now a
// true 512, which nothing measures against (every consumer sizes it in CSS).
for (const [name, size, fmt] of [
  ["crest-badge.png", 512, png],
  ["crest-badge@192.png", 192, png],
  ["crest-badge@512.png", 512, png],
  ["crest-badge-216.webp", 216, webp],
  ["crest-badge-400.webp", 400, webp],
]) {
  wrote.push(await fmt(variant(SOURCES.light, { size }), size, join(BRAND, name)));
}

// logo-badge.png is the masthead lockup mark. logo-badge@192.png is the Organization `logo` in
// the JSON-LD on seven page families, which Google reads, so that one keeps an opaque white
// ground rather than shipping a transparent square to a consumer that may composite on anything.
wrote.push(await png(variant(SOURCES.light, { size: 512 }), 512, join(BRAND, "logo-badge.png")));
wrote.push(
  await png(variant(SOURCES.light, { ground: true, size: 192 }), 192, join(BRAND, "logo-badge@192.png")),
);

/* ---------- ink colourway, for the two surfaces that are still dark by design ---------- */
// The infogram story cards are a founder-approved navy poster format and the lab landing page
// declares its own dark :root. Both used to read crest-badge@512/@192, which are now light, so
// they get their own named files instead of the family carrying two colourways under one name.
for (const [name, size] of [
  ["crest-badge-ink@512.png", 512],
  ["crest-badge-ink@192.png", 192],
]) {
  wrote.push(await png(variant(SOURCES.ink, { size }), size, join(BRAND, name)));
}

/* ---------- favicons: ink colourway, compact, opaque square ---------- */
const faviconSvg = variant(SOURCES.ink, { keep: COMPACT, ground: true });
await writeFile(join(PUBLIC, "favicon.svg"), faviconSvg + "\n");
wrote.push("public/favicon.svg (vector, compact)");

wrote.push(
  await png(variant(SOURCES.ink, { keep: COMPACT, ground: true, size: 96 }), 96, join(PUBLIC, "favicon.png")),
);
wrote.push(
  await png(
    variant(SOURCES.ink, { keep: COMPACT, ground: true, size: 180 }),
    180,
    join(PUBLIC, "apple-touch-icon.png"),
  ),
);

const icoSizes = [16, 32, 48];
const icoImages = [];
for (const size of icoSizes) {
  const data = await sharp(Buffer.from(variant(SOURCES.ink, { keep: COMPACT, ground: true, size })))
    .png({ compressionLevel: 9 })
    .toBuffer();
  icoImages.push({ size, data });
}
await writeFile(join(PUBLIC, "favicon.ico"), ico(icoImages));
wrote.push(`public/favicon.ico (${icoSizes.join("/")}px)`);

for (const line of wrote) console.log("✓ " + line);
console.log(`✓ crest: ${wrote.length} assets from scripts/brand/crest-monogram-{light,ink}.svg`);
