// Shared by the scores-poll tests: the same dependency-free asserts as daily-push's tests, and the
// recorded API replies in fixtures/. Those are real API-Football responses captured on 2026-10-13,
// with every logo, flag and photo URL, the referee and the coach photo removed. JSON modules are
// imported rather than read from disk, so `deno test` needs no permissions.
import plSchedule from "./fixtures/schedule-premier-league.json" with { type: "json" };
import uclSchedule from "./fixtures/schedule-champions-league.json" with { type: "json" };
import wslSchedule from "./fixtures/schedule-wsl.json" with { type: "json" };
import plFinished from "./fixtures/detail-premier-league-finished.json" with { type: "json" };
import uclLive from "./fixtures/detail-champions-league-live.json" with { type: "json" };
import uclFinished from "./fixtures/detail-champions-league-finished.json" with { type: "json" };
import wslFinished from "./fixtures/detail-wsl-finished.json" with { type: "json" };
import uclFinalPens from "./fixtures/detail-champions-league-final-pens.json" with { type: "json" };

export function assert(cond: unknown, msg = "condition"): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}
export function assertEquals(actual: unknown, expected: unknown, msg = ""): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`expected ${e} got ${a}${msg ? `: ${msg}` : ""}`);
}

// deno-lint-ignore no-explicit-any
type Fx = any;
type Envelope = { response: Fx[] };

export const SCHEDULES: Record<string, Envelope> = {
  "39": plSchedule,
  "2": uclSchedule,
  "44": wslSchedule,
};

// Each details reply holds one fixture; the fake API answers an ids= call from this pool.
export const DETAIL_FIXTURES: Fx[] = [plFinished, uclLive, uclFinished, wslFinished, uclFinalPens]
  .flatMap((e: Envelope) => e.response);

export const fixtureById = (id: number): Fx => {
  const fx = DETAIL_FIXTURES.find((f) => f.fixture.id === id);
  if (!fx) throw new Error(`no fixture ${id}`);
  return structuredClone(fx);
};

// The ids the recorded replies hold, by name.
export const IDS = {
  plFinished: 1557424, // Liverpool 0-3 Manchester City, FT, a red card and five subs a side
  uclLive: 1635623, // Atletico Madrid v Manchester United, 2H when captured, a cancelled goal
  uclFinished: 1635679, // Lens 0-2 Sporting CP, FT
  wslFinished: 1607697, // Manchester City W 4-2 Arsenal W, FT
  uclFinalPens: 1544371, // PSG v Arsenal, PEN 4-3, the 2026 final (2025/26 season)
};

// A bucket in memory: what a run reads and writes. `failOn` makes the writes to some paths fail,
// and `unreadable` makes reads of some paths throw (a Storage error that is not "no such file").
export function memoryStore(
  opts: { failOn?: (path: string) => boolean; unreadable?: (path: string) => boolean } = {},
) {
  const files = new Map<string, string>();
  const reads: string[] = [];
  const writes: string[] = [];
  return {
    files,
    reads,
    writes,
    read: (path: string): Promise<string | null> => {
      reads.push(path);
      if (opts.unreadable?.(path)) return Promise.reject(new Error("storage down"));
      return Promise.resolve(files.get(path) ?? null);
    },
    write: (path: string, text: string): Promise<void> => {
      if (opts.failOn?.(path)) return Promise.reject(new Error("storage down"));
      writes.push(path);
      files.set(path, text);
      return Promise.resolve();
    },
  };
}
