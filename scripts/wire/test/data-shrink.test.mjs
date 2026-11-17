// Tests for scripts/check-data-shrink.sh, the deploy guard that stops a shrunken desk data file
// (wire.json, the *Days.ts feeds, answers.ts) from reaching Pages. Each test builds a throwaway
// git repo holding the guard and a few data files, makes commits, and runs the guard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'shrink-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' }).trim();
  mkdirSync(join(dir, 'scripts/data/daily'), { recursive: true });
  mkdirSync(join(dir, 'src/data'), { recursive: true });
  copyFileSync(join(SCRIPTS, 'check-data-shrink.sh'), join(dir, 'scripts/check-data-shrink.sh'));
  copyFileSync(join(SCRIPTS, 'data-files.sh'), join(dir, 'scripts/data-files.sh'));
  git('init', '-q');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'test');
  git('config', 'commit.gpgsign', 'false');
  const write = (path, body) => writeFileSync(join(dir, path), body);
  const commit = (msg) => { git('add', '-A'); git('commit', '-q', '-m', msg); return git('rev-parse', 'HEAD'); };
  const guard = (...bases) => spawnSync('bash', ['scripts/check-data-shrink.sh', ...bases], { cwd: dir, encoding: 'utf8' });
  return { dir, write, commit, guard, done: () => rmSync(dir, { recursive: true, force: true }) };
}

const days = (...dates) => `export const days = [\n${dates.map((d) => `  {\n    date: "${d}",\n  },`).join('\n')}\n];\n`;
const wire = (updatedAt, ...dates) => JSON.stringify({ updatedAt, editions: dates.map((date) => ({ date })) });
const answers = (...slugs) => `export const answers = [\n${slugs.map((s) => `  {\n    slug: "${s}",\n  },`).join('\n')}\n];\n`;

function seed(r) {
  r.write('src/data/leaguesDays.ts', days('2026-11-13', '2026-11-12', '2026-11-11'));
  r.write('scripts/data/daily/wire.json', wire('2026-11-14T08:00:00Z', '2026-11-14', '2026-11-13'));
  r.write('src/data/answers.ts', answers('a', 'b', 'c'));
  return r.commit('deployed');
}

test('a shrink blocked on one push stays blocked when a later push only touches wire.json', () => {
  const r = repo();
  try {
    const deployed = seed(r);
    r.write('src/data/leaguesDays.ts', days('2026-11-13'));
    const a = r.commit('stale merge drops leagues entries');
    const pushA = r.guard(deployed, deployed);
    assert.equal(pushA.status, 1, 'push A must fail');
    assert.match(pushA.stdout, /leaguesDays\.ts has fewer date entries/);
    r.write('scripts/data/daily/wire.json', wire('2026-11-15T08:00:00Z', '2026-11-15', '2026-11-14', '2026-11-13'));
    r.commit('Wire and tables: 2026-11-15');
    // Push B: the last successful deploy is still `deployed`; github.event.before is A.
    const res = r.guard(deployed, a);
    assert.equal(res.status, 1, 'push B must fail against the last deployed commit');
    assert.match(res.stdout, /leaguesDays\.ts has fewer date entries/);
  } finally { r.done(); }
});

test('falls back to the pre-push commit when the deployed commit is unknown', () => {
  const r = repo();
  try {
    seed(r);
    r.write('src/data/leaguesDays.ts', days('2026-11-14', '2026-11-13', '2026-11-12', '2026-11-11'));
    const before = r.commit('add a day');
    r.write('src/data/leaguesDays.ts', days('2026-11-14'));
    r.commit('drop days');
    // Assert the base the guard chose, not just the status: HEAD~1 is also `before` here, so a
    // guard that rejected every candidate and fell through to HEAD~1 would still exit 1.
    for (const first of ['', '0123456789012345678901234567890123456789']) {
      const res = r.guard(first, before);
      assert.equal(res.status, 1, res.stdout + res.stderr);
      assert.match(res.stdout, new RegExp(`Comparing data files at HEAD against ${before}\\.`));
      assert.match(res.stdout, /leaguesDays\.ts has fewer date entries/);
    }
  } finally { r.done(); }
});

test('answers.ts losing an entry fails the guard', () => {
  const r = repo();
  try {
    const deployed = seed(r);
    r.write('src/data/answers.ts', answers('a', 'c'));
    r.commit('lose an answer');
    const res = r.guard(deployed);
    assert.equal(res.status, 1);
    assert.match(res.stdout, /answers\.ts has fewer entries/);
  } finally { r.done(); }
});

test('the override needs a Data-Shrink-OK trailer; the word in prose does not skip the guard', () => {
  const r = repo();
  try {
    const deployed = seed(r);
    r.write('src/data/leaguesDays.ts', days('2026-11-13'));
    r.commit('drop days\n\nA deliberate removal can use [data-shrink-ok] or a Data-Shrink-OK trailer.');
    const prose = r.guard(deployed);
    assert.equal(prose.status, 1, 'prose mention must not bypass');
    assert.match(prose.stdout, /leaguesDays\.ts has fewer date entries/);
    r.write('README', 'x');
    r.commit('remove the bad November days\n\nData-Shrink-OK: two duplicate days removed by hand');
    const res = r.guard(deployed);
    assert.equal(res.status, 0, res.stdout + res.stderr);
    assert.match(res.stdout, /guard skipped/);
  } finally { r.done(); }
});

test('growing data passes', () => {
  const r = repo();
  try {
    const deployed = seed(r);
    r.write('src/data/leaguesDays.ts', days('2026-11-14', '2026-11-13', '2026-11-12', '2026-11-11'));
    r.write('src/data/answers.ts', answers('a', 'b', 'c', 'd'));
    r.commit('grow');
    const res = r.guard(deployed);
    assert.equal(res.status, 0, res.stdout + res.stderr);
  } finally { r.done(); }
});

test('the temp dir follows TMPDIR (macOS mktemp ignores it without a template)', () => {
  const r = repo();
  try {
    const deployed = seed(r);
    r.write('src/data/answers.ts', answers('a', 'b', 'c', 'd'));
    r.commit('grow');
    // A TMPDIR that does not exist: the guard must try to use it and stop with its own message.
    const missing = join(r.dir, 'no-such-tmp');
    const res = spawnSync('bash', ['scripts/check-data-shrink.sh', deployed],
      { cwd: r.dir, encoding: 'utf8', env: { ...process.env, TMPDIR: missing } });
    assert.equal(res.status, 2, res.stdout + res.stderr);
    assert.ok(res.stderr.includes(missing), res.stderr);
    assert.match(res.stdout, /could not create a temp dir/);
  } finally { r.done(); }
});
