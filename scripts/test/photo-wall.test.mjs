/* photo-wall.test.mjs: the helpers behind check-photo-wall.mjs (21 Nov 2026). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlProblems, feedProblems } from "../check-photo-wall.mjs";
import { isPhotoPath, artPng } from "../shared/card-brand.mjs";
import { entryArt, shareArt } from "../shared/illustrated.mjs";
import { PLAYERS } from "../shared/illustrated.mjs";

test("og, twitter and JSON-LD images may not be photographs", () => {
  assert.deepEqual(htmlProblems('<meta property="og:image" content="https://thearchv.ca/desk/x/og.png">', "a"), []);
  assert.equal(htmlProblems('<meta property="og:image" content="https://thearchv.ca/photos/x.webp">', "a").length, 1);
  assert.equal(htmlProblems('<meta name="twitter:image" content="/thumbs/320/photos/sq/x.webp">', "a").length, 1);
  assert.equal(htmlProblems('<script type="application/ld+json">{"image":"/photos/x.webp"}</script>', "a").length, 1);
  assert.deepEqual(htmlProblems('<img src="/photos/sq/x.webp" alt="X, photographed 2026">', "a"), [], "on-page photos are fine");
});

test("a feed's image field never carries a photo; the photo fields may", () => {
  assert.deepEqual(feedProblems({ days: [{ image: "/heads/hd/x.webp", photo: "/photos/x.webp" }] }, "f"), []);
  assert.equal(feedProblems({ days: [{ image: "/photos/x.webp" }] }, "f").length, 1);
});

test("share cards refuse a photograph at the converter", async () => {
  assert.equal(isPhotoPath("/r/public/photos/sq/x.webp"), true);
  assert.equal(isPhotoPath("/r/public/heads/hd/x.webp"), false);
  const p = PLAYERS.find((r) => r.kind === "photo");
  if (!p) return;
  await assert.rejects(() => artPng(new URL(`../../public${p.photo.src}`, import.meta.url).pathname));
  const art = entryArt({ headline: `${p.name} again`, dek: "" });
  assert.equal(art.kind, "photo");
  assert.equal(shareArt(art).src.startsWith("/photos/"), false, "the share art is the illustration");
});
