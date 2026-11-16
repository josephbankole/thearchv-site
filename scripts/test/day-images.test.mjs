/* day-images.test.mjs: the rule in check-day-images.mjs (audit gap4-12). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { stemTokens, imageMatchesEntry, imageMismatches } from "../check-day-images.mjs";

const entry = (image, body, extra = {}) => ({ date: "2026-06-19", headline: "A headline.", dek: "A dek.", body, image, ...extra });

test("stem tokens come from the file name, split on hyphens, three letters or more", () => {
  assert.deepEqual(stemTokens("/heads/hd/bruno-fernandes.webp"), ["bruno", "fernandes"]);
  assert.deepEqual(stemTokens("/heads/balogun.webp"), ["balogun"]);
  assert.deepEqual(stemTokens("/heads/hd/kimi-antonelli.webp"), ["kimi", "antonelli"]);
});

test("a portrait of someone the story never names is flagged", () => {
  const day9 = entry("/heads/balogun.webp", "An Alex Freeman header, a Matheus Cunha brace and Ismael Saibari for Morocco.");
  assert.equal(imageMatchesEntry(day9), false);
  assert.deepEqual(imageMismatches([{ lane: "world-cup", days: [day9] }]), [{ lane: "world-cup", date: "2026-06-19", image: "/heads/balogun.webp" }]);
});

test("a surname in the body, headline or dek is enough, with accents folded", () => {
  assert.equal(imageMatchesEntry(entry("/heads/balogun.webp", "Folarin Balogun scored twice.")), true);
  assert.equal(imageMatchesEntry(entry("/heads/mbappe.webp", "Kylian Mbappé's two goals.")), true);
  assert.equal(imageMatchesEntry(entry("/heads/hd/bruno-fernandes.webp", "Nothing here.", { dek: "Fernandes made two." })), true);
});

test("a token must match a whole word, not part of one", () => {
  assert.equal(imageMatchesEntry(entry("/heads/hall.webp", "The town hallway was empty.")), false);
});

test("entries without an image are not checked", () => {
  assert.deepEqual(imageMismatches([{ lane: "transfer", days: [{ date: "2026-06-01", headline: "x", dek: "y", body: "z" }] }]), []);
});
