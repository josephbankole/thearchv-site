import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalUrl, titleKey, linkAllowed, urlKey } from "../lib/canon.mjs";

test("canonicalUrl strips tracking params, www, fragment and trailing slash, and sorts the rest", () => {
  assert.equal(
    canonicalUrl("https://WWW.ESPN.com/nba/story/_/id/1/x/?utm_source=rss&b=2&ref=tw&a=1&at_medium=x&fbclid=z#top"),
    "https://espn.com/nba/story/_/id/1/x?a=1&b=2",
  );
  assert.equal(canonicalUrl("https://espn.com/a?UTM_Campaign=x"), "https://espn.com/a");
  assert.equal(urlKey("https://www.espn.com/a/?utm_medium=feed"), urlKey("https://espn.com/a"));
  assert.equal(canonicalUrl("javascript:alert(1)"), null);
  assert.equal(canonicalUrl("not a url"), null);
});

test("titleKey ignores case, curly quotes, punctuation and spacing", () => {
  assert.equal(titleKey("Sources: Bulls trade  Guard!"), titleKey("sources bulls trade guard"));
  assert.equal(titleKey("United’s keeper out"), titleKey("Uniteds keeper out"));
  assert.notEqual(titleKey("Bulls trade guard"), titleKey("Bulls sign guard"));
});

test("linkAllowed accepts only https on a source host", () => {
  const hosts = ["espn.com"];
  assert.ok(linkAllowed("https://www.espn.com/x", hosts));
  assert.ok(linkAllowed("https://espn.com/x", hosts));
  for (const bad of ["http://www.espn.com/x", "javascript:alert(1)", "//espn.com/x", "https://espn.com.evil.net/x",
    "https://evilespn.com/x", "https://espn.com@evil.net/x", "https://1.2.3.4/x", "https://espn.com:8443/x"]) {
    assert.equal(linkAllowed(bad, hosts), false, bad);
  }
});
