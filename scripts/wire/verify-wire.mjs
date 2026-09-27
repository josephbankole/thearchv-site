/* verify-wire.mjs: prove every headline and URL in a finished Wire file is byte-for-byte the
   candidate's (exact code points: no NFC, no whitespace collapse). ESPN forbids modifying
   headlines or URLs, so any difference is a failure; the desk drops the item, never repairs it.

   node scripts/wire/verify-wire.mjs --candidates c.json --final wire.json   (exit 1 on any mismatch, or when the
   file has no edition for the candidates' date) */
import { readFileSync } from "node:fs";
import { parseArgs, isMain } from "./lib/args.mjs";

export function verify(candidates, final) {
  const byId = new Map();
  for (const c of candidates.candidates || []) {
    byId.set(c.id, c);
    for (const a of c.alternates || []) byId.set(a.id, a);
  }
  const ed = (final.editions || []).find((e) => e.date === candidates.date);
  const problems = [];
  // A gate that found nothing to check has not passed (a wrong --final or candidates file). An
  // edition that exists but is empty is legitimate: the desk vetoed every pick.
  if (!ed) problems.push({ id: null, field: "edition", issue: "no-edition-for-date" });
  for (const it of ed?.items || []) {
    const c = byId.get(it.id);
    if (!c) { problems.push({ id: it.id, field: "id", issue: "not-a-candidate" }); continue; }
    if (it.headline !== c.headline) problems.push({ id: it.id, field: "headline" });
    if (it.url !== c.url) problems.push({ id: it.id, field: "url" });
  }
  return { checked: ed?.items.length || 0, problems };
}

if (isMain(import.meta.url)) {
  const args = parseArgs();
  const r = verify(JSON.parse(readFileSync(args.candidates, "utf8")), JSON.parse(readFileSync(args.final, "utf8")));
  if (r.problems.length) { console.log(JSON.stringify(r.problems, null, 2)); process.exit(1); }
  console.log(`[verify-wire] headlines ${r.checked}/${r.checked} unchanged, urls ${r.checked}/${r.checked} unchanged`);
}
