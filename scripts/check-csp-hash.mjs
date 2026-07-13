/* check-csp-hash.mjs — verifies the inline bootstrap <script> in index.html still matches the
   sha256 hash allow-listed in the CSP meta tag. Runs FIRST in the build chain (see package.json
   "build"): without this, an edit to the bootstrap script ships green and the browser silently
   drops it at runtime (reduced-motion detection breaks, mobile WebGL gate breaks, the mobile
   sticky Follow bar disappears) with no build-time signal anywhere.
   Dependency-free on purpose, matching the other scripts/ generators. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INDEX_HTML = join(ROOT, "index.html");

const html = readFileSync(INDEX_HTML, "utf8");

// Isolate the one bare `<script>` tag (no attributes: not the module entry, not either
// application/ld+json block) — that is the inline bootstrap allowed via CSP hash.
const scriptMatches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if (scriptMatches.length === 0) {
  console.error("[check-csp-hash] FAIL: no bare <script>...</script> (no attributes) found in index.html — expected the inline bootstrap script.");
  process.exit(1);
}
if (scriptMatches.length > 1) {
  console.error(`[check-csp-hash] FAIL: found ${scriptMatches.length} bare <script> tags in index.html, expected exactly 1 (the inline bootstrap). Ambiguous — narrow the match before trusting this check.`);
  process.exit(1);
}
const scriptBody = scriptMatches[0][1];

const computedHash = createHash("sha256").update(scriptBody, "utf8").digest("base64");
const computedToken = `sha256-${computedHash}`;

const cspMatch = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/);
if (!cspMatch) {
  console.error("[check-csp-hash] FAIL: no Content-Security-Policy meta tag found in index.html.");
  process.exit(1);
}
const cspContent = cspMatch[1];

const shaMatch = cspContent.match(/'sha256-([^']+)'/);
if (!shaMatch) {
  console.error("[check-csp-hash] FAIL: CSP meta tag has no sha256-... source in script-src.");
  process.exit(1);
}
const cspToken = `sha256-${shaMatch[1]}`;

if (computedToken !== cspToken) {
  console.error(
    `[check-csp-hash] FAIL: inline bootstrap <script> no longer matches the CSP hash.\n` +
    `  CSP meta tag has:  ${cspToken}\n` +
    `  Script computes to: ${computedToken}\n` +
    `  The bootstrap script in index.html was edited without updating the CSP hash. Recompute\n` +
    `  the sha256 base64 digest of the exact script body and update the 'sha256-...' source in\n` +
    `  the CSP meta tag's script-src, or the browser will silently block this script at runtime.`
  );
  process.exit(1);
}

console.log(`[check-csp-hash] OK: inline bootstrap script matches CSP hash (${cspToken}).`);
