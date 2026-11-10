/* living-answers.mjs: the one place that turns a dated entry's `evergreen` field into a link, and
   says which living story pages collect a dated page (search plan G7, 2026-11-09).

   `evergreen` used to name a glossary slug and nothing else. It now takes a family prefix:
     "transfer-request"            a glossary slug, as before (no prefix, so every old entry still works)
     "answers:<slug>"              /answers/<slug>/, from src/data/answers.ts
     "explainer:<slug>"            /explainers/<slug>/, from content/explainers/
     "united:<slug>"               /united/<slug>/, from content/united/
     "finals:<slug>"               /finals/<slug>/, from content/finals/
   An unknown family or slug stops the build, the rule the glossary link already had: a typo is a
   build error, never a silent broken link.

   storiesFor(base, date) returns every living story page whose `follows` names that dated page, so
   the page can carry a forward link at the top. The dated page keeps its URL, text and index state. */

export const ANSWERS_BASE = "/answers/";
const CONTENT_FAMILIES = { explainer: "explainers", explainers: "explainers", united: "united", finals: "finals" };

export function makeLiving({ answers = [], glossaryEntries = [], contentPages = [] }) {
  const glossary = new Map(glossaryEntries.map((g) => [g.slug, g]));
  const living = new Map(answers.map((a) => [a.slug, a]));
  const content = new Map(contentPages.map((p) => [`${p.section}:${p.slug}`, p]));

  const seen = new Set();
  for (const a of answers) {
    if (seen.has(a.slug)) throw new Error(`[living-answers] src/data/answers.ts: slug "${a.slug}" appears twice`);
    seen.add(a.slug);
  }

  function evergreenTarget(ref, where) {
    if (!ref) return null;
    const m = /^([a-z]+):(.+)$/.exec(ref);
    if (!m) {
      const g = glossary.get(ref);
      if (!g) throw new Error(`[living-answers] ${where}: evergreen slug "${ref}" is not in scripts/glossary-data.mjs`);
      return { href: `/glossary/${g.slug}/`, title: g.title };
    }
    const [, family, slug] = m;
    if (family === "answers") {
      const a = living.get(slug);
      if (!a) throw new Error(`[living-answers] ${where}: evergreen "${ref}" is not in src/data/answers.ts`);
      return { href: `${ANSWERS_BASE}${a.slug}/`, title: a.title };
    }
    if (family === "glossary") return evergreenTarget(slug, where);
    const section = CONTENT_FAMILIES[family];
    if (!section) throw new Error(`[living-answers] ${where}: evergreen family "${family}" is not one of glossary, answers, explainer, united, finals`);
    const p = content.get(`${section}:${slug}`);
    if (!p) throw new Error(`[living-answers] ${where}: evergreen "${ref}" is not a page in content/${section}/`);
    return { href: `/${section}/${p.slug}/`, title: p.title };
  }

  const byPage = new Map();
  for (const a of answers) {
    for (const f of a.follows || []) {
      for (const d of f.dates) {
        const key = `${f.lane}${d}/`;
        if (!byPage.has(key)) byPage.set(key, []);
        byPage.get(key).push(a);
      }
    }
  }
  const storiesFor = (base, date) => byPage.get(`${base}${date}/`) || [];

  return { evergreenTarget, storiesFor, followedPages: () => [...byPage.keys()] };
}

// tests-by-assertion, run at module load so a regression fails the build.
(function selfTest() {
  const L = makeLiving({
    answers: [{ slug: "s", title: "S story", follows: [{ lane: "/desk/transfer/", dates: ["2026-01-02"] }] }],
    glossaryEntries: [{ slug: "g", title: "G term" }],
    contentPages: [{ section: "explainers", slug: "e", title: "E page" }, { section: "united", slug: "u", title: "U page" }],
  });
  const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`living-answers self-test: ${m}: ${JSON.stringify(a)}`); };
  eq(L.evergreenTarget("g", "t"), { href: "/glossary/g/", title: "G term" }, "bare slug is a glossary slug");
  eq(L.evergreenTarget("answers:s", "t").href, "/answers/s/", "answers family");
  eq(L.evergreenTarget("explainer:e", "t").href, "/explainers/e/", "explainer family");
  eq(L.evergreenTarget("united:u", "t").href, "/united/u/", "united family");
  eq(L.evergreenTarget(undefined, "t"), null, "no evergreen");
  for (const bad of ["nope", "answers:nope", "finals:nope", "weird:x"]) {
    let threw = false;
    try { L.evergreenTarget(bad, "t"); } catch { threw = true; }
    if (!threw) throw new Error(`living-answers self-test: "${bad}" should stop the build`);
  }
  eq(L.storiesFor("/desk/transfer/", "2026-01-02").map((a) => a.slug), ["s"], "storiesFor finds the follower");
  eq(L.storiesFor("/desk/transfer/", "2026-01-03"), [], "storiesFor misses cleanly");
})();
