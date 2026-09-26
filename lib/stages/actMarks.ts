/**
 * The game's wordmark for each act of the main story, by act number from 0: the mark's
 * file in /act-marks/, and what to call it out loud. The game does not number the first
 * act -- it marks it `initium` -- so this is not a roman-numeral function.
 *
 * null for an act this list does not know. The Score page then marks the line the way it
 * marks a story line with no emblem, by its code. It used to fall back to the first
 * entry, so an Act IV would have been drawn and announced as "Act initium".
 */
const ACT_MARKS: readonly { file: string; label: string }[] = [
  { file: 'initium', label: 'initium' },
  { file: 'i', label: 'I' },
  { file: 'ii', label: 'II' },
  { file: 'iii', label: 'III' },
];

export function actMark(act: number): { file: string; label: string } | null {
  return Number.isInteger(act) && act >= 0 ? ACT_MARKS[act] ?? null : null;
}
