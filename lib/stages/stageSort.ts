import { filterType, StageSummary, TYPE_ORDER } from './stageTypes';

/**
 * The order the stage list reads in.
 *
 * Shared rather than living in the loader because the rail now sorts the index
 * it fetches at runtime, and it has to land in the same order the build used --
 * sorting on the raw `stageType` string instead put `activity` first, so the
 * list opened on event stages with no main story anywhere in view.
 */
/**
 * Which band of an event a stage code belongs to: the TR stage that teaches the
 * event's gimmick, then the normal run, then the story stages, then EX, then S.
 *
 * The source's own `order` is the event map's layout instead, and it interleaves
 * them -- Guide Ahead came out GA-EX-1, GA-ST-1, GA-1, GA-2, GA-EX-2, GA-3,
 * GA-EX-3, GA-TR-1, GA-4. Banding first and falling back to `order` within a band
 * keeps the game's ordering where it is the only thing to go on: a main-story
 * chapter's codes carry no middle segment at all (1-7, and TR-8 for a tutorial
 * stage, which is a prefix and a number like any other), so every one of them
 * lands in the plain band and nothing there moves.
 */
const PLAIN_BAND = 1;
const OTHER_BAND = 5;
const CODE_BAND: Record<string, number> = { TR: 0, ST: 2, EX: 3, S: 4 };

/**
 * The band a code belongs to, and the letters and number it carries.
 *
 * The letters are not always a segment of their own: Vector Breakthrough runs
 * VEC-01..VEC-12 beside VEC-A..VEC-D and VEC-SP01..VEC-SP16, all with one dash and
 * all sharing the same `order` -- VEC-01, VEC-A and VEC-SP01 are each order 0 --
 * so the three families interleaved into one another. A code is read as a prefix,
 * optional letters and an optional number, which covers both "GA-EX-1" and
 * "VEC-SP01" and leaves "1-7" and "TR-8" as plain stages.
 */
function readCode(code: string | null): { band: number; token: string; num: number } {
  const parts = /^[A-Za-z0-9]+-([A-Za-z]*)-?(\d*)$/.exec(code || '');
  if (!parts) return { band: PLAIN_BAND, token: '', num: 0 };
  const token = parts[1].toUpperCase();
  const num = parts[2] ? parseInt(parts[2], 10) : 0;
  if (!token) return { band: PLAIN_BAND, token: '', num };
  // Letters this table does not know (SP, MO, A..D) sort after the ones it does,
  // grouped by their own letters, rather than mixing into the normal stages.
  return { band: CODE_BAND[token] ?? OTHER_BAND, token, num };
}

export function compareStageSummaries(a: StageSummary, b: StageSummary): number {
  // Folded, so an interlude sorts inside its chapter rather than ahead of
  // everything on an indexOf of -1.
  const typeDiff = TYPE_ORDER.indexOf(filterType(a.stageType)) - TYPE_ORDER.indexOf(filterType(b.stageType));
  if (typeDiff !== 0) return typeDiff;
  const contentDiff = (a.contentLabel || '').localeCompare(b.contentLabel || '', undefined, { numeric: true });
  if (contentDiff !== 0) return contentDiff;
  const left = readCode(a.code);
  const right = readCode(b.code);
  if (left.band !== right.band) return left.band - right.band;
  // Within the catch-all band the source's own order is not to be trusted -- the
  // three Vector Breakthrough families all start at 0 -- so the letters and the
  // number decide.
  if (left.band === OTHER_BAND) {
    if (left.token !== right.token) return left.token.localeCompare(right.token);
    if (left.num !== right.num) return left.num - right.num;
  }
  if ((a.order ?? 0) !== (b.order ?? 0)) return (a.order ?? 0) - (b.order ?? 0);
  return (a.code || '').localeCompare(b.code || '', undefined, { numeric: true });
}
