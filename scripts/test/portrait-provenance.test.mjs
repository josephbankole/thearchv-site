/* portrait-provenance.test.mjs: the rules in check-portrait-provenance.mjs (audits gap4-1, gap4-2, gap4-3). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { provenanceProblems, photoKey, citedReference } from "../check-portrait-provenance.mjs";
import { appGrade, WITHDRAWN } from "../shared/app-art.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => JSON.parse(readFileSync(join(ROOT, "scripts", "data", f), "utf8"));
const LIC = { name: "CC BY 4.0", author: "A. Photographer", source: "https://commons.wikimedia.org/wiki/File:X.jpg" };
const commonsRow = (out, file, licence = LIC) => ({
  out,
  identity: { method: "reference-render", reference: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${encodeURIComponent(file)}`, licence },
});
const player = (slug, stem, cite) => ({
  slug,
  hd: `/heads/hd/${stem}.webp`,
  verifiedBy: cite ? `Rendered from the reference photo recorded for '${stem}' in scripts/data/heads-hd.json (${cite}); likeness checked.` : "Banked portrait.",
});

test("the registry as committed passes", () => {
  assert.deepEqual(provenanceProblems(read("heads-hd.json"), read("illustrated.json")), []);
});

test("a reference off Commons with no licence fails; with a recorded licence it passes", () => {
  const row = { out: "x", identity: { method: "reference-render", reference: "https://club.example/photo.jpg" } };
  assert.equal(provenanceProblems({ entries: [row] }, { players: [] }).length, 1);
  const licensed = { ...row, identity: { ...row.identity, licence: { name: "Bought, invoice 12" } } };
  assert.deepEqual(provenanceProblems({ entries: [licensed] }, { players: [] }), []);
});

test("a withdrawn portrait still in illustrated.json fails", () => {
  const heads = { entries: [], withdrawn: [{ out: "amad" }] };
  assert.equal(provenanceProblems(heads, { players: [player("amad-diallo", "amad")] }).length, 1);
});

test("verifiedBy citing a different photo from heads-hd.json fails, the same photo in any spelling passes", () => {
  const heads = { entries: [commonsRow("raum", "Raum (cropped).jpg")] };
  const same = player("david-raum", "raum", "https://commons.wikimedia.org/wiki/File:Raum_(cropped).jpg");
  const other = player("david-raum", "raum", "https://commons.wikimedia.org/wiki/File:Someone_else.jpg");
  assert.deepEqual(provenanceProblems(heads, { players: [same] }), []);
  assert.equal(provenanceProblems(heads, { players: [other] }).length, 1);
});

test("photoKey folds Commons spellings and citedReference keeps parentheses", () => {
  assert.equal(photoKey("https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/A_%28b%29.jpg/800px-A_%28b%29.jpg"), "commons:A_(b).jpg");
  assert.equal(photoKey("https://commons.wikimedia.org/wiki/File:A (b).jpg"), "commons:A_(b).jpg");
  assert.equal(citedReference("in scripts/data/heads-hd.json (https://x.org/File:A_(b)_(c).jpg); likeness"), "https://x.org/File:A_(b)_(c).jpg");
});

test("the app never serves a withdrawn portrait, file on disk or not", () => {
  assert.ok(WITHDRAWN.size > 0);
  for (const stem of WITHDRAWN) assert.equal(appGrade(`/heads/hd/${stem}.webp`), false, stem);
});

test("a Commons reference needs its licence, author and source page, and no NC or ND terms", () => {
  assert.deepEqual(provenanceProblems({ entries: [commonsRow("a", "A.jpg")] }, { players: [] }), []);
  assert.equal(provenanceProblems({ entries: [commonsRow("a", "A.jpg", null)] }, { players: [] }).length, 3);
  assert.equal(provenanceProblems({ entries: [commonsRow("a", "A.jpg", { ...LIC, author: "" })] }, { players: [] }).length, 1);
  assert.equal(provenanceProblems({ entries: [commonsRow("a", "A.jpg", { ...LIC, name: "CC BY-NC-SA 4.0" })] }, { players: [] }).length, 1);
  assert.equal(provenanceProblems({ entries: [commonsRow("a", "A.jpg", { ...LIC, name: "CC BY-ND 2.0" })] }, { players: [] }).length, 1);
});

test("a photo row is a Commons file with its licence, credit and files, never NC or ND (21 Nov 2026)", async () => {
  const { photoRowProblems } = await import("../check-portrait-provenance.mjs");
  const row = {
    slug: "x", name: "X", src: "/heads/hd/x.webp", alt: "Illustrated ARCHV portrait of X", kind: "photo",
    credit: "Photo: A / Studio, CC BY-SA 4.0, cropped",
    licence: { name: "CC BY-SA 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0", author: "A", attribution: "A / Studio", source: "https://commons.wikimedia.org/wiki/File:X_(1).jpg", checked: "2026-11-21" },
    photo: { src: "/photos/x.webp", square: "/photos/sq/x.webp", alt: "X, photographed 2026", original: "https://upload.wikimedia.org/wikipedia/commons/a/ab/X_%281%29.jpg" },
  };
  const run = (r, exists) => photoRowProblems({ players: [r] }, exists);
  assert.deepEqual(run(row), []);
  // NC fails twice: not an allowed licence, and NC/ND terms.
  assert.equal(run({ ...row, licence: { ...row.licence, name: "CC BY-NC-SA 4.0" }, credit: "Photo: A / Studio, CC BY-NC-SA 4.0, cropped" }).length, 2);
  assert.equal(run({ ...row, licence: { ...row.licence, source: "https://www.manutd.com/x" } }).length, 2);
  assert.equal(run({ ...row, photo: { ...row.photo, original: "https://example.com/X.jpg" } }).length, 1);
  assert.equal(run({ ...row, credit: "Photo: A" }).length, 1);
  // Only what the licence requires (26 Nov 2026): CC0 carries no credit; a credit on it fails.
  const cc0 = { ...row, credit: undefined, licence: { name: "CC0", url: "https://creativecommons.org/publicdomain/zero/1.0/", author: "A", source: row.licence.source, checked: "2026-11-26" } };
  assert.deepEqual(run(cc0), []);
  assert.equal(run({ ...cc0, credit: "Photo: A, CC0, cropped" }).length, 1);
  // A US-only public-domain tag is refused.
  assert.equal(run({ ...cc0, licence: { ...cc0.licence, name: "Public domain" } }).length, 1);
  // CC 2.0/3.0 with a title: the title leads the credit.
  const t = { ...row, licence: { ...row.licence, name: "CC BY 2.0", title: "Match day", copyright: "©Agency" }, credit: "Photo: “Match day” by A / Studio, ©Agency, CC BY 2.0, cropped" };
  assert.deepEqual(run(t), []);
  assert.equal(run({ ...row, photo: { ...row.photo, alt: "Illustrated ARCHV portrait of X" } }).length, 1);
  assert.equal(run(row, () => false).length, 2, "missing files fail");
  assert.equal(run({ ...row, kind: "illustration" }).length, 1, "photo fields on an illustration row fail");
});
