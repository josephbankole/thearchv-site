/* scripts/build-sport-icons.mjs — writes the sport icon assets, or checks the committed ones.
 *
 *   node scripts/build-sport-icons.mjs           regenerate public/sport-icons/<key>.glb and .svg
 *   node scripts/build-sport-icons.mjs --check   the build-chain step: regenerate in memory and
 *                                                compare with what is committed, write nothing
 *
 * The outputs are COMMITTED, so CI needs nothing but Node and the deploy never depends on a
 * modelling tool. --check is cheap (well under a second) and is what `npm run build` runs: it
 * fails if a GLB is missing, over the size cap, structurally different from what the generators
 * produce now, or more than a hair off in position. It compares numbers with a tolerance rather
 * than bytes, because Math.sin is not promised to be bit-identical across machines.
 *
 * After changing anything under scripts/icons/, or a token colour, run `npm run sport-icons` and
 * commit public/sport-icons/.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT, toGlb, readGlb } from "./icons/lib.mjs";
import { buildSport, BUILDERS } from "./icons/meshes.mjs";
import { posterSvg } from "./icons/poster.mjs";

export const OUT_DIR = join(ROOT, "public", "sport-icons");
export const GLB_CAP = 64 * 1024;
export const SVG_CAP = 6 * 1024;
export const SPORT_ICON_KEYS = Object.keys(BUILDERS);
const TAG = "[sport-icons]";

export function generate(key) {
  const built = buildSport(key);
  const glb = toGlb(built.mesh, { pose: built.pose, alt: built.alt });
  const svg = posterSvg(built);
  return { key, glb, svg, built };
}

function main() {
  const check = process.argv.includes("--check");
  let bad = 0;
  if (!check) mkdirSync(OUT_DIR, { recursive: true });
  for (const key of SPORT_ICON_KEYS) {
    const { glb, svg, built } = generate(key);
    const gp = join(OUT_DIR, `${key}.glb`), sp = join(OUT_DIR, `${key}.svg`);
    const line = `${key.padEnd(10)} ${String(built.mesh.pos.length).padStart(5)} verts ${String(built.mesh.tris.length).padStart(5)} tris  glb ${(glb.length / 1024).toFixed(1)} KB  svg ${(svg.length / 1024).toFixed(1)} KB`;
    if (glb.length > GLB_CAP) { console.error(`${TAG} ${key}.glb is ${glb.length} bytes, over the ${GLB_CAP} cap`); bad++; }
    if (svg.length > SVG_CAP) { console.error(`${TAG} ${key}.svg is ${svg.length} bytes, over the ${SVG_CAP} cap`); bad++; }
    if (!check) { writeFileSync(gp, glb); writeFileSync(sp, svg); console.log(`${TAG} wrote ${line}`); continue; }
    if (!existsSync(gp) || !existsSync(sp)) { console.error(`${TAG} ${key}: committed file missing. Run npm run sport-icons and commit public/sport-icons/.`); bad++; continue; }
    const have = readGlb(readFileSync(gp)), want = readGlb(glb);
    let why = "";
    if (have.pos.length !== want.pos.length || have.idx.length !== want.idx.length) why = "vertex or index count differs";
    else if (JSON.stringify(have.extras) !== JSON.stringify(want.extras)) why = "extras (pose, palette or scene) differ";
    else if (have.pal.some((p, i) => p !== want.pal[i]) || have.idx.some((p, i) => p !== want.idx[i])) why = "palette slots or indices differ";
    else {
      let worst = 0;
      for (let i = 0; i < have.pos.length; i++) for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(have.pos[i][k] - want.pos[i][k]), Math.abs(have.nor[i][k] - want.nor[i][k]));
      if (worst > 1e-4) why = `geometry is ${worst.toExponential(2)} away from the generator`;
    }
    if (why) { console.error(`${TAG} ${key}.glb is stale: ${why}. Run npm run sport-icons and commit public/sport-icons/.`); bad++; }
    else console.log(`${TAG} ok    ${line}`);
  }
  if (bad) process.exit(1);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) main();
