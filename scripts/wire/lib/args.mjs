// Tiny --flag value parser shared by the Wire CLIs.
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function parseArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

// True when the module at `metaUrl` is the script node was asked to run. Node resolves the main
// module's symlinks for import.meta.url but leaves argv[1] as typed, so both sides are compared as
// real paths: otherwise a CLI reached through a symlink (/tmp on macOS) silently does nothing.
export function isMain(metaUrl, argv1 = process.argv[1]) {
  if (!argv1) return false;
  try { return realpathSync(fileURLToPath(metaUrl)) === realpathSync(argv1); } catch { return false; }
}
