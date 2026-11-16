// Test helper, never deployed: the UTC instant for a wall-clock time in Edmonton, worked out from
// the runtime's own timezone rules.
//
// Alberta stopped changing its clocks on 1 November 2026 and keeps UTC-6 all year ("Alberta
// Time"). A runtime with timezone data from before that still puts an Edmonton winter at UTC-7.
// The Supabase edge runtime has the new rule; the deno this suite was written on did not. A test
// that hard-codes a UTC instant for "07:00 Edmonton" in winter is right on one and wrong on the
// other. A test built on atEdmonton() says what it means and holds on both.

function wallClock(d: Date, timeZone: string): { day: string; hour: number; minute: number } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(d).map((part) => [part.type, part.value]),
  );
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute) };
}

/** The instant when the clock in `timeZone` reads `day` (YYYY-MM-DD) at hour:minute:second. */
export function atWallClock(timeZone: string, day: string, hour: number, minute = 0, second = 0): Date {
  // Every North American zone sits between UTC-3 and UTC-10, so one of these offsets is the one.
  for (let offset = 3; offset <= 10; offset++) {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCHours(hour + offset, minute, second, 0);
    const w = wallClock(d, timeZone);
    if (w.day === day && w.hour === hour && w.minute === minute) return d;
  }
  throw new Error(`no such time in ${timeZone}: ${day} ${hour}:${minute}`);
}

/** The instant when Edmonton's clock reads `day` at hour:minute:second. */
export function atEdmonton(day: string, hour: number, minute = 0, second = 0): Date {
  return atWallClock("America/Edmonton", day, hour, minute, second);
}
