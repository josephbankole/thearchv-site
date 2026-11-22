#!/usr/bin/env node
/* scripts/check-photo-wall.mjs: the Commons photographs stay on our own pages (21 Nov 2026).

   Founder ruling: free-licence Wikimedia Commons photographs with credit on the site and in the
   app, and never a photo on the shop side. A share card, an RSS item or a structured-data image
   leaves the site with no credit beside it, so those keep the illustration. This fails the build
   when a path on the photo shelf (/photos/, or its thumbs under /thumbs/<w>/photos/) reaches:

     - og:image or twitter:image (any page), or any JSON-LD block (any page)
     - the posters page, the shop, the storefront and posters feeds, or the 3D sport icons
     - RSS and every sitemap
     - the `image` field of any app feed (the app's share poster draws `image`; photos ride in the
       additive photo fields instead, see scripts/shared/app-art.mjs)
     - any file outside dist/photos/ and dist/thumbs/<w>/photos/ that is itself a photo copy

   The rendered PNG share cards cannot be read for a photo, so their gate is at the source:
   artPng() in scripts/shared/card-brand.mjs throws on a photo path. Runs at the end of
   `npm run build`, beside check-logos.mjs. */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = process.env.DIST || join(ROOT, "dist");
const TAG = "[check-photo-wall]";
const PHOTO = /\/(?:thumbs\/\d+\/)?photos\//;

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

export function htmlProblems(html, where) {
  const out = [];
  for (const m of html.matchAll(/<meta\b[^>]*(?:property|name)="(og:image[^"]*|twitter:image[^"]*)"[^>]*>/gi)) {
    if (PHOTO.test(m[0])) out.push(`${where}: ${m[1]} points at a photograph`);
  }
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)) {
    if (PHOTO.test(m[1])) out.push(`${where}: JSON-LD names a photograph`);
  }
  return out;
}

export function feedProblems(json, where) {
  const out = [];
  const visit = (v, path) => {
    if (Array.isArray(v)) v.forEach((x, i) => visit(x, `${path}[${i}]`));
    else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        if (k === "image" && typeof x === "string" && PHOTO.test(x)) out.push(`${where}${path}.image is a photograph`);
        visit(x, `${path}.${k}`);
      }
    }
  };
  visit(json, "");
  return out;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  if (!existsSync(DIST)) { console.error(`${TAG} FAIL: no dist/ (run after the build)`); process.exit(1); }
  const problems = [];
  const files = walk(DIST);
  const OFF_SITE = [/^posters\//, /^shop\//, /^sport-icons\//, /^feed\/(storefront|posters)\.json$/, /^feed\.xml$/, /sitemap[^/]*\.xml$/, /\.rss$/];
  for (const f of files) {
    const rel = relative(DIST, f).split("\\").join("/");
    if (/^photos\//.test(rel) || /^thumbs\/\d+\/photos\//.test(rel)) continue;
    const isText = /\.(html|json|xml|js|css|txt|svg)$/i.test(rel);
    if (!isText) continue;
    const text = readFileSync(f, "utf8");
    if (OFF_SITE.some((r) => r.test(rel)) && PHOTO.test(text)) problems.push(`${rel}: off-site or shop surface names a photograph`);
    if (rel.endsWith(".html")) problems.push(...htmlProblems(text, rel));
    if (/^feed\/.+\.json$/.test(rel)) problems.push(...feedProblems(JSON.parse(text), rel));
  }
  const shelf = files.filter((f) => /^photos\//.test(relative(DIST, f).split("\\").join("/"))).length;
  if (problems.length) {
    for (const p of problems.slice(0, 40)) console.error(`${TAG} FAIL: ${p}`);
    console.error(`${TAG} ${problems.length} problem(s)`);
    process.exit(1);
  }
  console.log(`${TAG} OK (${shelf} photo files on the shelf, none on a share, shop or off-site surface)`);
}
