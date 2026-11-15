/* portrait-provenance.test.mjs: the rules in check-portrait-provenance.mjs (audits gap4-1, gap4-3). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { provenanceProblems, photoKey, citedReference } from "../check-portrait-provenance.mjs";
import { appGrade, WITHDRAWN } from "../shared/app-art.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => JSON.parse(readFileSync(join(ROOT, "scripts", "data", f), "utf8"));
const commonsRow = (out, file) => ({
  out,
  identity: { method: "reference-render", reference: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${encodeURIComponent(file)}` },
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
