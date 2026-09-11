/* check-app-heads.mjs — audit of the portraits the iOS app can be served.

   `npm run check:heads`. Not in the build chain on purpose: the feed already refuses any
   portrait that fails the gate (scripts/shared/app-art.mjs) and falls back to the crest, so a
   bad file can never reach the app. This is the human-facing report of what would be refused
   and which stories are running on the crest, so a gap is seen and fixed rather than found.

   Exit 1 when a registered `hd` path or a file in public/heads/hd/ fails the gate (missing, not
   square, not WebP, under 600px), or when public/heads/hd/ holds a file the manifest does not
   list (it went in by hand, outside normalize-heads.py). A story running on the crest is reported,
   never failed: a name with no verified master is meant to show the crest. */
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { PLAYERS } from "./shared/illustrated.mjs";
import { appGrade, appArt } from "./shared/app-art.mjs";
import { loadDayData } from "./shared/day-data.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(ROOT, "scripts", "data", "heads-hd.json"), "utf8"));
const listed = new Set(manifest.entries.map((e) => `${e.out}.webp`));
const onDisk = readdirSync(join(ROOT, "public", "heads", "hd")).filter((f) => f.endsWith(".webp"));
const failures = [];

for (const f of onDisk) {
  if (!listed.has(f)) failures.push(`public/heads/hd/${f} is not in scripts/data/heads-hd.json`);
  if (!appGrade(`/heads/hd/${f}`)) failures.push(`public/heads/hd/${f} fails the 600px square gate`);
}
for (const p of PLAYERS) {
  if (!p.hd) failures.push(`registry player ${p.slug} has no hd path`);
  else if (!appGrade(p.hd)) failures.push(`registry player ${p.slug}: ${p.hd} fails the gate`);
}

const { transferDays, worldCupDays, leaguesDays, sportDays } = await loadDayData({});
const lanes = { transfer: transferDays, worldcup: worldCupDays, leagues: leaguesDays, ...sportDays };
let total = 0, served = 0;
const crestWithFiledImage = [];
for (const [lane, days] of Object.entries(lanes)) {
  for (const e of days || []) {
    total++;
    if (appArt(e)) served++;
    else if (e.image) crestWithFiledImage.push(`${lane} ${e.date}: filed ${basename(e.image)}, no app-grade rebuild`);
  }
}

console.log(`[check-app-heads] ${onDisk.length} app-grade portraits, ${PLAYERS.length} registry players`);
console.log(`[check-app-heads] ${served}/${total} stories carry a portrait in the app; the rest show the crest`);
for (const line of crestWithFiledImage) console.log(`  crest: ${line}`);
if (failures.length) {
  for (const f of failures) console.error(`[check-app-heads] FAIL: ${f}`);
  process.exit(1);
}
console.log("[check-app-heads] OK");
