/* scores-script.mjs: the text of the /scores/ inline client, put together in one place (2026-10-19).

   The client is scripts/shared/scores-client.js. The pure helpers behind the lineups graphic live in
   scripts/shared/scores-pitch.js so node tests can run them (scripts/scores/test/). This splices the
   helpers into the client where its include line stands, inside the client's own function, so the
   page still carries one inline script and adds no global. build-scores-page.mjs hashes exactly the
   text returned here, and the tests read the same text, so what is tested is what ships.

   Two rules the text must keep, both checked here so a break fails the build rather than the page:
   - no "</script" anywhere, or the inline element would end early;
   - no "<!--", because verify-csp-pages.mjs strips HTML comments before hashing and would then hash
     something other than what the browser runs, and report a false mismatch. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const PITCH_INCLUDE = "  // @include scores-pitch.js\n";

export function scoresClientSource(root) {
  const client = readFileSync(join(root, "scripts", "shared", "scores-client.js"), "utf8");
  const pitch = readFileSync(join(root, "scripts", "shared", "scores-pitch.js"), "utf8");
  const parts = client.split(PITCH_INCLUDE);
  if (parts.length !== 2) {
    throw new Error(`[scores-script] scores-client.js must hold the line ${JSON.stringify(PITCH_INCLUDE)} exactly once (found ${parts.length - 1}).`);
  }
  const source = parts[0] + pitch + parts[1];
  if (/<\/script/i.test(source)) {
    throw new Error("[scores-script] the scores client contains a closing script tag; it would end the inline element early.");
  }
  if (source.includes("<!--")) {
    throw new Error("[scores-script] the scores client contains '<!--'; verify-csp-pages.mjs strips comments before hashing and would mis-hash it.");
  }
  return source;
}
