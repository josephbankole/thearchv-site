/* scripts/shared/content-pages.mjs — reads content/*.md into page objects.

   Lifted verbatim out of scripts/build-content.mjs on 2026-08-09 so the new section index
   generator (scripts/build-section-pages.mjs) enumerates a section's children from exactly the
   same parse the pages themselves are built from. A second copy of a frontmatter parser is a
   second answer to "what is in /finals/", and the two would eventually disagree. */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CONTENT_DIR = join(ROOT, "content");

/* ---------- frontmatter ---------- */
export function parse(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: raw };
  const data = {};
  for (const line of m[1].split("\n")) {
    const mm = line.match(/^(\w+):\s*(.*)$/);
    if (!mm) continue;
    let v = mm[2].trim();
    if (v.startsWith("[") || v.startsWith("{")) { try { v = JSON.parse(v); } catch {} }
    else if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    data[mm[1]] = v;
  }
  return { data, body: m[2].trim() };
}

function walk(dir) {
  const files = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) files.push(...walk(p));
    else if (e.endsWith(".md") && e !== "BACKLOG.md") files.push(p);
  }
  return files;
}

// Every content page with both a slug and a section, in whatever order the filesystem walk
// returns them (unchanged from the original: build-content.mjs never sorted this list).
// Returns [] when there is no content/ directory at all, which is what the caller checks.
export function loadContentPages() {
  if (!existsSync(CONTENT_DIR)) return [];
  return walk(CONTENT_DIR)
    .map((f) => { const { data, body } = parse(readFileSync(f, "utf8")); return { ...data, body }; })
    .filter((p) => p.slug && p.section);
}

export const hasContentDir = () => existsSync(CONTENT_DIR);
