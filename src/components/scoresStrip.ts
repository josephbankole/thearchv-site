// Live scores strip on the front page (2026-10-13, founder: "live scores across the top of the
// page, plus a visible link to go to the scores page").
//
// WHAT IT READS. The public archv-scores/1 feed the scores-poll Edge Function writes to Supabase
// storage (live/scores.json), the same file /scores/ reads. The selection and status logic mirrors
// scripts/shared/scores-client.js (statusText, nextDelay); that file is inlined into /scores/ under
// its own CSP hash and cannot be imported here, and this strip is a small client of its own, so the
// two are kept in step by hand. Change the status wording in one, change the other.
//
// Each item links to /scores/?match=<id>, which opens that match's details (2026-10-13, founder).
//
// WHAT IT SHOWS. Live matches first, then today's results and fixtures in the reader's local time;
// when nothing is live and nothing is on today, the next day that has fixtures. One row of text
// items (crests come from our own registry, never the feed, and img-src stays 'self' data:), built with textContent
// only, so nothing from the feed is ever parsed as markup.
//
// LOGOS (founder ruling, 21 Nov 2026). The Premier League logo is now licensed for the site, small
// and beside the words "Premier League" where a page already names the competition, behind the
// THIRD_PARTY_LOGOS switch in scripts/shared/logos.mjs (it shows on the /scores/ group heading and
// the /tables/ Premier League table title). This strip prints no competition label, so it carries
// no competition logo. CLUB CRESTS (same ruling, D-2026-11-21b): a 16px Wikimedia Commons crest
// sits in front of a team's name when scripts/data/crests.json has one for that exact name
// (src/lib/crests.ts, behind the same switch). Self-hosted, so img-src 'self' still holds. No crest
// in the registry, no image: never a guessed one.
//
// WHAT IT NEVER DOES. It never removes the "All scores" link: that link is server-rendered in
// index.html, pinned outside the scrolling track, and stays when the feed is empty, slow or down.
// The track is simply left hidden. Nothing in here may create a downward-translated element inside
// the track: a horizontal scroller must never own a vertical gesture (trap 3 in CLAUDE.md), and the
// track carries overflow-y: hidden in src/style.css for the same reason.
//
// WHEN IT REFRESHES. Every 30 seconds while a match is live (or about to be: kickoff within two
// minutes, or within fifteen minutes after it while the feed still says not started) and the tab is
// visible. Otherwise one quiet wake-up shortly before the next kickoff, and nothing if there is
// none. A hidden tab stops polling and catches up once when it becomes visible again.
//
// WHEN THE FEED STOPS. scores-poll writes scores.json (and moves generatedAt) only when its content
// changes, which during play is every minute or two. A feed that still says a match is live but has
// not changed for STALE_MS has stopped (quota, function error, cron off): its live matches lose the
// live dot, read "Feed paused" and are no longer pinned first, and the strip drops to the calm
// 60-second retry until the feed moves again. A suspended or interrupted match can sit unchanged
// for a long time legitimately, so it never counts towards that. Kept in step with
// scripts/shared/scores-client.js (feedPaused), like the status wording.
//
// A FROZEN MATCH. A match the feed still calls live more than LIVE_MAX_MS after its kickoff is a
// stuck figure even while the rest of the feed keeps moving: it loses the live dot, reads "Feed
// paused" and stops holding the strip on the 30-second poll. Same limit and rule as staleLive() in
// scripts/shared/scores-client.js and ScoresFreshness.liveMaxSinceKickoff in the app.
import { crestEl } from '../lib/crests';

const FEED = 'https://fpsfnhjxczzyqurzbqpt.supabase.co/storage/v1/object/public/live/scores.json';
const POLL_MS = 30_000;
const RETRY_MS = 60_000;
const MAX_WAKE_MS = 6 * 3_600_000;
const MAX_ITEMS = 40;
// Longer than a half-time break, so a quiet interval never reads as a stopped feed.
const STALE_MS = 25 * 60_000;
// Two halves, the break, stoppage, extra time, a shootout and room for a short delay.
const LIVE_MAX_MS = 3.5 * 3_600_000;

interface Side {
  name?: string;
  goals?: number | null;
}
interface Status {
  code?: string;
  minute?: number | null;
  extra?: number | null;
  live?: boolean;
  finished?: boolean;
  // Set here, never by the feed: the match was live when the feed stopped moving.
  paused?: boolean;
}
interface Match {
  id: number;
  kickoff?: string;
  status?: Status;
  home?: Side;
  away?: Side;
  penalties?: { home?: number | null; away?: number | null } | null;
}

const kickoffMs = (m: Match): number => Date.parse(m.kickoff ?? '');
const byKickoff = (a: Match, b: Match): number => {
  const x = kickoffMs(a);
  const y = kickoffMs(b);
  return (Number.isNaN(x) ? Infinity : x) - (Number.isNaN(y) ? Infinity : y) || a.id - b.id;
};

// A sortable local calendar day (20261013), or NaN for a match with no usable kickoff.
function localDay(ms: number): number {
  if (Number.isNaN(ms)) return NaN;
  const d = new Date(ms);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/** Which matches the strip shows, in order. Exported shape is internal; kept pure for reading. */
function pick(all: Match[], now: Date): Match[] {
  const usable = all.filter((m) => m && m.home?.name && m.away?.name);
  const today = localDay(now.getTime());
  const live = usable.filter((m) => m.status?.live).sort(byKickoff);
  const todays = usable.filter((m) => !m.status?.live && localDay(kickoffMs(m)) === today).sort(byKickoff);
  if (live.length || todays.length) return [...live, ...todays].slice(0, MAX_ITEMS);

  // Nothing live and nothing today: the next day that has a fixture still to play.
  let next = Infinity;
  for (const m of usable) {
    const day = localDay(kickoffMs(m));
    if (day > today && !m.status?.finished && day < next) next = day;
  }
  if (next === Infinity) return [];
  return usable.filter((m) => localDay(kickoffMs(m)) === next).sort(byKickoff).slice(0, MAX_ITEMS);
}

// True when the feed says a match is live but has not moved for STALE_MS. A feed with no usable
// generatedAt is taken at its word.
function feedPaused(d: { generatedAt?: unknown }, all: Match[], now: number): boolean {
  const at = Date.parse(typeof d.generatedAt === 'string' ? d.generatedAt : '');
  if (Number.isNaN(at) || now - at <= STALE_MS) return false;
  return all.some((m) => m?.status?.live && m.status.code !== 'SUSP' && m.status.code !== 'INT');
}

// True when the feed calls a match live more than LIVE_MAX_MS after its kickoff. A match with no
// usable kickoff cannot be judged and is taken at its word.
function staleLive(m: Match, now: number): boolean {
  if (!m?.status?.live) return false;
  const t = kickoffMs(m);
  return !Number.isNaN(t) && now - t > LIVE_MAX_MS;
}

// The same matches with the live flag taken off (or only from those `only` picks), so a stopped
// feed or a frozen match never shows as live.
function markPaused(all: Match[], only?: (m: Match) => boolean): Match[] {
  return all.map((m) =>
    m?.status?.live && (!only || only(m)) ? { ...m, status: { ...m.status, live: false, paused: true } } : m,
  );
}

const clock = (minute: number, extra?: number | null): string => `${minute}${extra ? `+${extra}` : ''}'`;

function statusText(m: Match): string {
  const s = m.status ?? {};
  const c = s.code;
  if (s.paused) return 'Feed paused';
  if (s.live) {
    if (c === 'HT') return 'HT';
    if (c === 'P') return 'Pens';
    if (c === 'BT') return 'Break';
    if (c === 'SUSP') return 'Halted';
    if (c === 'INT') return 'Paused';
    return s.minute != null ? clock(s.minute, s.extra) : 'Live';
  }
  if (s.finished) return c === 'AET' ? 'AET' : c === 'AWD' ? 'Awarded' : c === 'WO' ? 'W/O' : 'FT';
  if (c === 'PST') return 'Postponed';
  if (c === 'CANC') return 'Cancelled';
  if (c === 'ABD') return 'Abandoned';
  const t = new Date(m.kickoff ?? '');
  return c === 'TBD' || Number.isNaN(t.getTime())
    ? 'TBC'
    : t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function el(tag: string, cls: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// A team's name with its Commons crest in front when the registry has one (src/lib/crests.ts).
function team(name: string | undefined): HTMLElement {
  const t = el('span', 'scores-strip__team', name ?? '');
  const c = crestEl(name);
  if (c) t.prepend(c);
  return t;
}

function item(m: Match): HTMLLIElement {
  const live = !!m.status?.live;
  const li = document.createElement('li');
  li.className = live ? 'scores-strip__item is-live' : 'scores-strip__item';
  // The whole item opens the match on /scores/, which reads ?match=<id> and expands its details.
  const link = document.createElement('a');
  link.className = 'scores-strip__link';
  link.href = `/scores/?match=${encodeURIComponent(String(m.id))}`;
  li.appendChild(link);

  const a = m.home?.goals;
  const b = m.away?.goals;
  const played = a != null && b != null;

  const teams = el('span', 'scores-strip__teams');
  teams.appendChild(team(m.home?.name));
  teams.appendChild(el('b', 'scores-strip__score', played ? `${a}–${b}` : 'v'));
  teams.appendChild(team(m.away?.name));
  link.appendChild(teams);

  const status = el('span', 'scores-strip__status');
  if (live) {
    status.appendChild(el('i', 'scores-strip__dot'));
    status.appendChild(el('span', 'scores-strip__sr', 'Live '));
  }
  status.appendChild(document.createTextNode(statusText(m)));
  const p = m.penalties;
  if (p && p.home != null && p.away != null) status.appendChild(document.createTextNode(` (${p.home}-${p.away} pens)`));
  link.appendChild(status);
  return li;
}

export function initScoresStrip(): void {
  const track = document.getElementById('scores-strip-track') as HTMLElement | null;
  if (!track) return;

  let matches: Match[] = [];
  let shown = '';
  let haveData = false;
  let timer = 0;
  let pending = false;
  let paused = false;

  function render(): void {
    const chosen = pick(matches, new Date());
    // Re-render only when what is shown changed, so the row does not jump under a reader's thumb.
    const sig = JSON.stringify(chosen.map((m) => [m.id, m.status, m.home?.goals, m.away?.goals, m.penalties, m.kickoff]));
    if (sig === shown) return;
    shown = sig;
    const left = track!.scrollLeft;
    track!.textContent = '';
    for (const m of chosen) track!.appendChild(item(m));
    track!.hidden = chosen.length === 0;
    track!.scrollLeft = left;
  }

  // How long until the next look at the feed, or null for none. See the header for the rule.
  function nextDelay(): number | null {
    if (!haveData || paused) return RETRY_MS;
    const now = Date.now();
    let soon: number | null = null;
    for (const m of matches) {
      const s = m.status ?? {};
      if (s.live) return POLL_MS;
      if (s.code === 'NS') {
        const t = kickoffMs(m);
        if (Number.isNaN(t)) continue;
        if (t <= now + 120_000 && t > now - 900_000) return POLL_MS;
        if (t > now && (soon === null || t < soon)) soon = t;
      }
    }
    return soon === null ? null : Math.min(Math.max(soon - now - 120_000, 5_000), MAX_WAKE_MS);
  }

  function schedule(): void {
    window.clearTimeout(timer);
    timer = 0;
    const d = nextDelay();
    if (d != null) timer = window.setTimeout(tick, d);
  }

  function tick(): void {
    timer = 0;
    if (document.hidden) {
      pending = true;
      return;
    }
    load();
  }

  function load(): void {
    fetch(FEED, { cache: 'no-cache' })
      .then((res) => {
        if (!res.ok) throw new Error('feed');
        return res.json() as Promise<{ matches?: unknown; generatedAt?: unknown }>;
      })
      .then((d) => {
        if (!d || !Array.isArray(d.matches)) throw new Error('shape');
        const all = d.matches as Match[];
        const now = Date.now();
        paused = feedPaused(d, all, now);
        matches = paused ? markPaused(all) : markPaused(all, (m) => staleLive(m, now));
        haveData = true;
        render();
      })
      .catch(() => {
        // Keep whatever is already on screen. With no data at all the track stays hidden and the
        // pinned "All scores" link is the whole strip, which is the designed failure state.
      })
      .then(schedule);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && pending) {
      pending = false;
      load();
    }
  });

  load();
}
