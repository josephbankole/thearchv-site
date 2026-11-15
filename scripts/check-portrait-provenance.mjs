/* check-portrait-provenance.mjs: where every illustrated portrait came from, checked before build
   (audits gap4-1, gap4-2, gap4-3, 2026-11-15).

   A reference-render portrait (heads-hd.json identity.method "reference-render") is a GPT Image 2
   render made from one photo, named in identity.reference. Fourteen of them were rendered from
   official club, tour and league photos with no licence recorded, and illustrated.json cited a
   different, Commons photo for five faces, so a licence review read from it cleared the wrong
   source. This refuses the build when:

     1. a reference-render row's reference is not on an allowed host (Wikimedia Commons) and the
        row records no licence for it;
     2. a withdrawn row (heads-hd.json `withdrawn`) is still registered in illustrated.json;
     3. an illustrated.json player cites a reference photo for its heads-hd.json row that is not the
        photo heads-hd.json records (heads-hd.json is the one record of the source).

   Runs in `npm run build` straight after check-illustrated-parity.mjs, and on its own as
   `npm run check-provenance`. */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TAG = "[check-portrait-provenance]";
export const ALLOWED_HOSTS = new Set(["upload.wikimedia.org", "commons.wikimedia.org"]);

const hostOf = (u) => {
  try { return new URL(u).hostname; } catch { return null; }
};

/** One comparable key per photo: a Commons file name, however the URL spells it, else the URL. */
export function photoKey(u) {
  if (!u) return null;
  let url;
  try { url = new URL(u); } catch { return u; }
  const fold = (s) => decodeURIComponent(s).replace(/ /g, "_");
  if (url.hostname === "upload.wikimedia.org") {
    const parts = url.pathname.split("/");
    const i = parts.indexOf("thumb");
    return `commons:${fold(i >= 0 ? parts[i + 3] : parts.at(-1))}`;
  }
  if (url.hostname === "commons.wikimedia.org" && url.pathname.includes("/wiki/File:")) {
    return `commons:${fold(url.pathname.split("File:")[1])}`;
  }
  return u;
}

/** The reference URL an illustrated.json verifiedBy cites for its heads-hd.json row, or null. */
export function citedReference(verifiedBy = "") {
  const m = /heads-hd\.json \((https?:\/\/\S+?)\);/.exec(verifiedBy);
  return m ? m[1] : null;
}

export function provenanceProblems(heads, illustrated) {
  const out = [];
  const rows = new Map(heads.entries.map((e) => [e.out, e]));
  const withdrawn = new Set((heads.withdrawn ?? []).map((e) => e.out));

  for (const e of heads.entries) {
    const id = e.identity ?? {};
    if (id.method !== "reference-render") continue;
    if (!ALLOWED_HOSTS.has(hostOf(id.reference)) && !id.licence?.name) {
      out.push(`${e.out}: reference ${id.reference} is not on Wikimedia Commons and records no licence`);
    }
  }

  for (const p of illustrated.players) {
    const stem = String(p.hd ?? "").split("/").pop().replace(/\.webp$/i, "");
    if (withdrawn.has(stem)) {
      out.push(`${p.slug}: ${p.hd} is withdrawn in heads-hd.json but still registered in illustrated.json`);
      continue;
    }
    const cited = citedReference(p.verifiedBy);
    if (!cited) continue;
    const id = rows.get(stem)?.identity ?? {};
    const recorded = [photoKey(id.reference), photoKey(id.page)].filter(Boolean);
    if (!recorded.includes(photoKey(cited))) {
      out.push(`${p.slug}: verifiedBy cites ${cited}, heads-hd.json records ${id.reference ?? "nothing"}`);
    }
  }
  return out;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const read = (f) => JSON.parse(readFileSync(join(ROOT, "scripts", "data", f), "utf8"));
  const problems = provenanceProblems(read("heads-hd.json"), read("illustrated.json"));
  if (problems.length) {
    for (const p of problems) console.error(`${TAG} FAIL: ${p}`);
    process.exit(1);
  }
  console.log(`${TAG} OK`);
}
