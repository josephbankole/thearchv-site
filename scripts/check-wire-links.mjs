/* check-wire-links.mjs: the Wire's guard rails, checked on the built site and on the source CSS.
   Runs after build-daily-pages.mjs and build-sport-pages.mjs (package.json "build").
   Fails the build when:
   - a Wire link lacks target="_blank" or rel="noopener noreferrer", is not https on a host a
     registered source may link to, or has a path its source's excludePaths forbid (a betting path
     above all). The sanitiser (schema.mjs) already drops such items with a log line, so this is a
     backstop that should never fire: it tests the path with the same regexes pick.mjs uses, never
     the query or fragment;
   - an <img> appears inside the Wire or tables content (no publisher thumbnails, logos or crests);
   - the wire CSS region in page-shell.mjs gains an animation, marquee or headline clamp.
   The CSS is checked in source because Vite bundles every stylesheet into one file, so a region
   cannot be scoped in dist (design-final D6). */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { linkAllowed } from "./wire/lib/canon.mjs";
import { compileFilters } from "./wire/lib/pick.mjs";
import { isMain } from "./wire/lib/args.mjs";
import { SOURCES } from "./wire/lib/schema.mjs";
import { SPORTS } from "./shared/page-shell.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = process.argv[2] || join(ROOT, "dist");
const errors = [];
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"');

/* The problems with one Wire <a ...> opening tag, as strings ([] when it is fine). */
export function wireLinkProblems(tag, sources = SOURCES) {
  const problems = [];
  const hosts = [...new Set(sources.sources.flatMap((s) => s.linkHosts || []))];
  const href = decode(tag.match(/href="([^"]*)"/)?.[1] || "");
  const rel = tag.match(/rel="([^"]*)"/)?.[1] || "";
  if (!/target="_blank"/.test(tag)) problems.push(`wire link without target="_blank": ${href}`);
  if (!/\bnoopener\b/.test(rel) || !/\bnoreferrer\b/.test(rel)) problems.push(`wire link without rel="noopener noreferrer": ${href}`);
  if (!linkAllowed(href, hosts)) { problems.push(`wire link not https on a registered source host: ${href}`); return problems; }
  const sourceId = decode(tag.match(/data-wire-source="([^"]*)"/)?.[1] || "");
  const source = sources.sources.find((s) => s.id === sourceId) || {};
  const path = new URL(href).pathname.toLowerCase();
  const bad = compileFilters(sources.defaults || {}, source).paths.find((f) => f.re.test(path));
  if (bad || /\/betting\//.test(path)) problems.push(`wire link to an excluded path (${bad ? bad.p : "/betting/"}): ${href}`);
  return problems;
}

function checkPage(label, file, regions) {
  if (!existsSync(file)) { errors.push(`${label}: missing ${file}`); return 0; }
  const html = readFileSync(file, "utf8");
  let links = 0;
  for (const m of html.matchAll(/<a\b[^>]*data-wire-source[^>]*>/g)) {
    links++;
    for (const p of wireLinkProblems(m[0])) errors.push(`${label}: ${p}`);
  }
  for (const [start, end] of regions) {
    const i = html.indexOf(start);
    if (i < 0) continue;
    const j = end ? html.indexOf(end, i) : -1;
    const stop = j < 0 ? html.indexOf("</main>", i) : j;
    const region = html.slice(i, stop < 0 ? undefined : stop);
    if (/<img\b/i.test(region)) errors.push(`${label}: <img> inside Wire or tables content`);
    if (/<marquee\b/i.test(region)) errors.push(`${label}: <marquee> inside Wire or tables content`);
  }
  return links;
}

if (isMain(import.meta.url)) {
  let links = 0;
  links += checkPage("/wire/", join(DIST, "wire", "index.html"), [["<main", "</main>"]]);
  links += checkPage("/tables/", join(DIST, "tables", "index.html"), [["<main", "</main>"]]);
  for (const s of SPORTS.filter((s) => s.urlBase)) {
    links += checkPage(`/${s.urlBase}/`, join(DIST, s.urlBase, "index.html"), [['class="wire wire--strip"', 'class="wire__more"><a href="/wire/'], ['class="tables tables--strip"', 'class="wire__more"><a href="/tables/']]);
  }

  const shell = readFileSync(join(ROOT, "scripts", "shared", "page-shell.mjs"), "utf8");
  const a = shell.indexOf("/* wire:start"), b = shell.indexOf("/* wire:end */");
  if (a < 0 || b < 0) errors.push("page-shell.mjs: wire CSS region markers missing");
  else {
    // Strip the region's own comments before scanning, so the rule can name what it forbids.
    const css = shell.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const bad of ["@keyframes", "animation", "marquee", "line-clamp", "text-overflow", "transition", "overflow-x"]) {
      if (css.includes(bad)) errors.push(`page-shell.mjs wire CSS region contains "${bad}"`);
    }
  }

  if (errors.length) {
    console.error(`[check-wire-links] FAILED:\n  ${errors.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`[check-wire-links] OK: ${links} wire link(s) checked, no images in Wire or tables content, calm CSS region.`);
}
