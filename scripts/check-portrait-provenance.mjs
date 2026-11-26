/* check-portrait-provenance.mjs: where every illustrated portrait came from, checked before build
   (audits gap4-1, gap4-2, gap4-3, 2026-11-15).

   A reference-render portrait (heads-hd.json identity.method "reference-render") is a GPT Image 2
   render made from one photo, named in identity.reference. Fourteen of them were rendered from
   official club, tour and league photos with no licence recorded, and illustrated.json cited a
   different, Commons photo for five faces, so a licence review read from it cleared the wrong
   source. This refuses the build when:

     1. a reference-render row's reference is not on an allowed host (Wikimedia Commons) and the
        row records no licence for it, or a Commons reference records no licence name, author and
        source page, or carries a non-commercial or no-derivatives licence;
     2. a withdrawn row (heads-hd.json `withdrawn`) is still registered in illustrated.json;
     3. an illustrated.json player cites a reference photo for its heads-hd.json row that is not the
        photo heads-hd.json records (heads-hd.json is the one record of the source).

     4. (21 Nov 2026, founder ruling on free-licence photographs) a kind "photo" row is not a
        Wikimedia Commons file (file page on commons.wikimedia.org, original on
        upload.wikimedia.org), records no licence name, deed url, author or source, carries a
        non-commercial or no-derivatives licence, has a credit that is not the house line, or
        names a photo or square crop that is not on the photo shelf in public/photos/.

   Runs in `npm run build` straight after check-illustrated-parity.mjs, and on its own as
   `npm run check-provenance`. */
import { creditText, NO_CREDIT } from "./shared/photo-credit.mjs";
import { readFileSync, existsSync } from "node:fs";
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
    const lic = id.licence ?? {};
    if (!ALLOWED_HOSTS.has(hostOf(id.reference))) {
      if (!lic.name) out.push(`${e.out}: reference ${id.reference} is not on Wikimedia Commons and records no licence`);
      continue;
    }
    // gap4-2: a Commons photo is reusable only on its licence's terms, and the credit needs the
    // author and the file page, so all three are recorded. NC and ND terms rule out this use.
    for (const k of ["name", "author", "source"]) {
      if (typeof lic[k] !== "string" || lic[k].trim() === "") out.push(`${e.out}: Commons reference records no licence ${k}`);
    }
    if (/\b(NC|ND)\b/.test(lic.name ?? "")) out.push(`${e.out}: licence ${lic.name} does not allow an adapted portrait`);
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

/** Problems with the kind "photo" rows of illustrated.json. `exists` checks a site-relative path. */
export function photoRowProblems(illustrated, exists = () => true) {
  const out = [];
  for (const p of [...illustrated.players, ...(illustrated.clubs ?? [])]) {
    if (p.kind !== "photo" && !p.photo && !p.licence) continue;
    const who = p.slug;
    if (p.kind !== "photo") { out.push(`${who}: carries photo or licence fields but kind is ${p.kind ?? "unset"}`); continue; }
    const lic = p.licence ?? {};
    for (const k of ["name", "url", "author", "source", "checked"]) {
      if (typeof lic[k] !== "string" || lic[k].trim() === "") out.push(`${who}: photo records no licence ${k}`);
    }
    if (hostOf(lic.source) !== "commons.wikimedia.org" || !/\/wiki\/File:/.test(lic.source ?? "")) out.push(`${who}: licence source ${lic.source} is not a Wikimedia Commons file page`);
    if (hostOf(p.photo?.original) !== "upload.wikimedia.org") out.push(`${who}: original ${p.photo?.original} is not on upload.wikimedia.org`);
    else if (photoKey(p.photo.original) !== photoKey(lic.source)) out.push(`${who}: original ${p.photo.original} is not the file the licence source names`);
    if (/\b(NC|ND)\b|non-?commercial|no ?deriv/i.test(lic.name ?? "")) out.push(`${who}: licence ${lic.name} does not allow this use`);
    // Only CC0, CC BY and CC BY-SA (26 Nov 2026): a bare "Public domain" tag can be US-only (a US
    // government photo, a work published without notice) and not hold in Canada.
    if (!/^(CC0 1\.0|CC0|CC BY(-SA)? [234]\.0)$/.test(lic.name ?? "")) out.push(`${who}: licence ${lic.name} is not CC0, CC BY or CC BY-SA`);
    // The credit is what the licence requires and nothing more (scripts/shared/photo-credit.mjs).
    if (NO_CREDIT(lic.name)) {
      if (p.credit || lic.attribution) out.push(`${who}: a ${lic.name} photo needs no credit, so it carries none`);
    } else {
      if (typeof lic.attribution !== "string" || !lic.attribution.trim()) out.push(`${who}: ${lic.name} requires a credit, and no attribution is recorded`);
      else if (p.credit !== creditText(lic)) out.push(`${who}: credit "${p.credit}" is not the licence credit "${creditText(lic)}"`);
      if (/ [23]\.0$/.test(lic.name) && lic.title === "") out.push(`${who}: empty title`);
    }
    const ph = p.photo ?? {};
    if (!/^\/photos\/[a-z0-9-]+\.webp$/.test(ph.src ?? "")) out.push(`${who}: photo src ${ph.src} is not on the photo shelf`);
    if (!/^\/photos\/sq\/[a-z0-9-]+\.webp$/.test(ph.square ?? "")) out.push(`${who}: square ${ph.square} is not on the photo shelf`);
    for (const f of [ph.src, ph.square]) if (f && !exists(f)) out.push(`${who}: ${f} is missing from public/`);
    if (!ph.alt || /illustrat/i.test(ph.alt)) out.push(`${who}: photo alt "${ph.alt}" must say it is a photograph, not an illustration`);
    if (p.photoOnly) {
      // Someone we never drew (25 Nov 2026): no illustration fields at all, so nothing can mistake
      // the photo for a shareable file.
      for (const k of ["src", "alt", "hd"]) if (p[k]) out.push(`${who}: a photoOnly row must not carry ${k}`);
    } else if (!p.src || !p.alt) out.push(`${who}: a photo row keeps its illustration (src, alt) for share cards`);
  }
  return out;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const read = (f) => JSON.parse(readFileSync(join(ROOT, "scripts", "data", f), "utf8"));
  const illustrated = read("illustrated.json");
  const problems = [
    ...provenanceProblems(read("heads-hd.json"), illustrated),
    ...photoRowProblems(illustrated, (rel) => existsSync(join(ROOT, "public", rel.replace(/^\//, "")))),
  ];
  if (problems.length) {
    for (const p of problems) console.error(`${TAG} FAIL: ${p}`);
    process.exit(1);
  }
  console.log(`${TAG} OK (${illustrated.players.filter((p) => p.kind === "photo").length} Commons photographs)`);
}
