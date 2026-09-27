/* f1.mjs: F1 driver and constructor standings and the next race, from the Jolpica F1 API.
   OFF BY DEFAULT. Jolpica's terms say "The API is freely available for non-commercial use" and
   the data is CC BY-NC-SA 4.0; The ARCHV is commercial, so this runs only when the founder has
   written permission from admin@jolpi.ca and sets ARCHV_JOLPICA_PERMITTED=1 for the desk.
   The Wikipedia route (design-final A4) is the planned permission-free source. */
const BASE = "https://api.jolpi.ca/ergast/f1/current";
const SOURCE = { name: "Jolpica F1", attribution: "Data: Jolpica F1, used with permission.", url: "https://github.com/jolpica/jolpica-f1", licence: "CC BY-NC-SA 4.0", licenceUrl: "https://creativecommons.org/licenses/by-nc-sa/4.0/", adapted: true };
const col = (key, label, align = "end") => ({ key, label, labelKey: `tables.col.${key}`, align });

export function fromJolpica(drivers, constructors, next, today) {
  const dl = drivers?.MRData?.StandingsTable?.StandingsLists?.[0];
  const cl = constructors?.MRData?.StandingsTable?.StandingsLists?.[0];
  const race = next?.MRData?.RaceTable?.Races?.[0];
  // Standings carry the round they follow but no date; asOf stays the fetch day and the label
  // says which race the numbers reflect.
  const after = (list) => (/^\d+$/.test(list?.round ?? "") ? `After round ${list.round}` : null);
  const dRows = (dl?.DriverStandings || []).map((d) => ({ name: `${d.Driver?.givenName ?? ""} ${d.Driver?.familyName ?? ""}`.trim(), short: d.Driver?.familyName, group: null, cells: { pos: +d.position || null, team: d.Constructors?.[0]?.name ?? "", pts: +d.points, wins: +d.wins } }));
  const cRows = (cl?.ConstructorStandings || []).map((c) => ({ name: c.Constructor?.name ?? "", group: null, cells: { pos: +c.position || null, pts: +c.points, wins: +c.wins } }));
  const blocks = [], failed = {};
  if (dRows.length >= 20) blocks.push({ id: "f1-drivers", kind: "standings", league: "f1", title: "F1 drivers' standings", asOf: today, throughLabel: after(dl), compactRows: 10, columns: [col("pos", "#"), col("name", "Driver", "start"), col("pts", "Pts")], rows: dRows, source: SOURCE, emptyText: null });
  else failed["f1-drivers"] = `driver-count ${dRows.length} < 20`;
  if (cRows.length >= 10) blocks.push({ id: "f1-constructors", kind: "standings", league: "f1", title: "F1 constructors' standings", asOf: today, throughLabel: after(cl), compactRows: 10, columns: [col("pos", "#"), col("name", "Team", "start"), col("pts", "Pts")], rows: cRows, source: SOURCE, emptyText: null });
  else failed["f1-constructors"] = `constructor-count ${cRows.length} < 10`;
  if (race) blocks.push({ id: "f1-next", kind: "event", league: "f1", title: "F1: next race", asOf: today, rows: [{ name: race.raceName, venue: race.Circuit?.circuitName, city: [race.Circuit?.Location?.locality, race.Circuit?.Location?.country].filter(Boolean).join(", "), date: race.date, round: `Round ${race.round}` }], source: SOURCE, emptyText: null });
  return { blocks, failed };
}

export async function run({ get, today, env }) {
  if (env.ARCHV_JOLPICA_PERMITTED !== "1") {
    console.log("[tables:f1] ARCHV_JOLPICA_PERMITTED not set: skipping Jolpica (non-commercial terms; needs written permission from admin@jolpi.ca)");
    return { blocks: [], failed: {}, skipped: "permission-absent" };
  }
  const d = await get(`${BASE}/driverStandings.json`, { offlineName: "jolpica-drivers.json" });
  const c = await get(`${BASE}/constructorStandings.json`, { offlineName: "jolpica-constructors.json" });
  const n = await get(`${BASE}/next.json`, { offlineName: "jolpica-next.json" });
  if (!d.ok || !c.ok) return { blocks: [], failed: { "f1-drivers": `fetch-failed:${d.status}`, "f1-constructors": `fetch-failed:${c.status}` } };
  return fromJolpica(d.json, c.json, n.ok ? n.json : null, today);
}
