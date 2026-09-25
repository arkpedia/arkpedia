/**
 * Confirmed operator group rosters for base skill calculations.
 * Mirrors the Python group_rosters.py exactly -- same confirmed data,
 * ported for use in the live site's calculation engine.
 *
 * The members are data/base-group-rosters.json, a game record the content release
 * carries: /base reads it from its props (__contentTables['base-group-rosters']) and
 * hands the Sets to every calculation through its context (`ctx.rosters`), so a new
 * member needs a data edit in arkpedia-data, not a redeploy. They used to be Sets in
 * this module, compiled into the /base chunk.
 *
 * What the members are, kept here because JSON cannot carry the notes:
 *   ELITE_OPERATOR is confirmed as this exact 7-name list, not "any 6-star operator".
 *   SOUBO_ADVENTURERS is confirmed (user confirmed the inference; see baseResources.ts
 *     / resources.py notes).
 *   A1_DETACHMENT is confirmed by the user. Deliberately does NOT include "Fang the
 *     Fire-Sharpened" herself -- a different operator from the plain "Fang" who IS a
 *     member, despite the similar name.
 *   RHINE_LAB is confirmed by the user. Deliberately does NOT include "Silence the
 *     Paradigmatic" (her alter form) -- confirmed excluded, unlike every other alter
 *     form in this list, which IS included alongside their base operator.
 */
export const BASE_ROSTER_NAMES = [
  'OPERATION_PLATFORM', 'LATERANO', 'URSUS_STUDENT_SELF_GOVERNING_GROUP', 'GLASGOW', 'KNIGHTS',
  'TEAM_RAINBOW', 'LUNGMEN_GUARD_DEPARTMENT', 'ABYSSAL_HUNTERS', 'KARLAN_TRADE', 'MINOS', 'SARGON',
  'DURIN', 'SUI', 'WANDERING_MEDIC', 'SAMI', 'ALTERNATE_OPERATOR', 'ELITE_OPERATOR',
  'SOUBO_ADVENTURERS', 'A1_DETACHMENT', 'BLACKSTEEL_WORLDWIDE', 'PINUS_SYLVESTRIS', 'RHINE_LAB',
] as const;

export type BaseRosterName = typeof BASE_ROSTER_NAMES[number];
/** data/base-group-rosters.json: each roster's member names. */
export type BaseRosterData = Record<BaseRosterName, string[]>;
/** The rosters every base calculation reads, as the page built them from its props. */
export type BaseRosters = Readonly<Record<BaseRosterName, ReadonlySet<string>>>;

/** One Set per roster. Lenient in the browser: checkBaseRosters has already refused a
 *  table with a roster missing, wherever the table was read from data/. */
export function toBaseRosters(data: Partial<Record<BaseRosterName, readonly string[]>>): BaseRosters {
  return Object.fromEntries(BASE_ROSTER_NAMES.map((name) => [name, new Set(data[name] ?? [])])) as unknown as BaseRosters;
}

/* The rosters the calculations name and the rosters the table holds must be the same
   list: a roster renamed or dropped in the data would leave its skills counting nobody,
   with nothing on screen to say so. /base's table loader runs this wherever the table
   is read from data/ -- the build's prerender and the content export -- so a release
   that disagrees fails its export. */
export function checkBaseRosters(data: unknown): BaseRosterData {
  const table = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const missing = BASE_ROSTER_NAMES.filter((name) => !Array.isArray(table[name]) || !(table[name] as unknown[]).every((member) => typeof member === 'string' && member.trim()));
  const unknown = Object.keys(table).filter((name) => !(BASE_ROSTER_NAMES as readonly string[]).includes(name));
  if (missing.length || unknown.length) {
    throw new Error(
      'baseGroupRosters: data/base-group-rosters.json and BASE_ROSTER_NAMES disagree.' +
      (missing.length ? ` Missing or not a list of names: ${missing.join(', ')}.` : '') +
      (unknown.length ? ` Not a roster any calculation reads: ${unknown.join(', ')}.` : ''),
    );
  }
  return table as BaseRosterData;
}
