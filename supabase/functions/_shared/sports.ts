// The sports a reader can pick in the app, by feed key, for register-push (which stores the
// reader's choice on push_tokens.sport) and daily-push (which sends each reader their sport's
// lead). Pure, no I/O, so sports_test.ts can run it under a bare `deno test`.
//
// A THIRD copy of the site's sport registry, after src/data/sports.ts and the SPORTS mirror in
// scripts/shared/page-shell.mjs. Edge Functions deploy only supabase/functions, so they cannot
// import either at run time. sports_test.ts imports src/data/sports.ts and fails if the keys
// here drift from it. Add a sport there first, then here, then deploy both functions.
//
// Football is the default everywhere: a token with no sport (every build shipped before this
// field existed), an unknown key and the app's "All" tab all get the football lead, which is
// exactly what every token got before per-sport pushes.
export const SPORT_KEYS = ["football", "nfl", "f1", "tennis", "golf", "basketball"] as const;
export type SportKey = typeof SPORT_KEYS[number];
export const DEFAULT_SPORT: SportKey = "football";

// The app's SportFilter has one case that is not a feed: "all". All stacks football first and
// carries no single feed of its own, so its push is the football lead.
const ALL_TAB = "all";

// The same shape the app's Router.isFeedKey and the push_tokens.sport check constraint use:
// lowercase a-z, digits and hyphen, 1 to 32 characters. Digits are not optional, since "f1" is
// a sport. It runs before the membership check, so nothing that could not be a feed key is
// ever compared, stored or logged.
const SPORT_SHAPE = /^[a-z0-9-]{1,32}$/;

export function isSportShape(value: string): boolean {
  return SPORT_SHAPE.test(value);
}

// Any raw value to a known sport key. Not a string, the wrong shape, "all", or a shape-valid
// key the site does not publish (say an app build that knows a sport this server does not
// yet): all of them are football. Never throws.
export function resolveSport(raw: unknown): SportKey {
  if (typeof raw !== "string") return DEFAULT_SPORT;
  const value = raw.trim();
  if (!isSportShape(value) || value === ALL_TAB) return DEFAULT_SPORT;
  return (SPORT_KEYS as readonly string[]).includes(value) ? value as SportKey : DEFAULT_SPORT;
}

// The trimmed key when `raw` is shaped like a feed key but is neither "all" nor a sport this
// server knows, else null. register-push logs it: it is usually an app build that has a sport
// the server has not been told about yet.
export function unknownSportKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!isSportShape(value) || value === ALL_TAB) return null;
  return (SPORT_KEYS as readonly string[]).includes(value) ? null : value;
}
