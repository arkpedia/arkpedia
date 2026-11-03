/** Searches the base optimizer page runs side by side, one Worker each: at most this many, one per spare core,
 * so the page keeps a core for itself. */
export const MAX_STARTS = 4;

/** How many searches to run for a device: `main` plain starts (each annealing from its own seed over the same
 * first plans) and whether the formations search runs beside them. A phone or tablet (coarse pointer) gets one
 * plain search: extra starts buy robustness against a poor seed, not a higher score, and a minute of several
 * Workers there is heat and battery. The formations search needs Fiammetta and a core of its own. */
export function searchStarts(cores: number, coarsePointer: boolean, fiammetta: boolean): { main: number; formations: boolean } {
  const formations = fiammetta && cores >= 4;
  const total = coarsePointer ? (formations ? 2 : 1) : Math.max(1, Math.min(MAX_STARTS, Math.floor(cores) - 1));
  return { main: Math.max(1, total - (formations ? 1 : 0)), formations };
}
