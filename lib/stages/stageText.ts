


/**
 * A stage's description, split into its lead and the rules it states.
 *
 * The source separates them with newlines and names each rule in angle brackets --
 * "\n<Deep Water Zone>Unable to deploy on these tiles..." -- and rendering the
 * whole string as one paragraph ran them together into a wall of prose. 2,920 of
 * the 3,784 descriptions state at least one rule this way, up to eight of them.
 * A rule that shares its line with another is split too, since 864 descriptions
 * carry tags with no newline before them.
 */
export function describeStage(raw: string | null): { tag: string | null; text: string }[] {
  if (!raw?.trim()) return [];
  return raw
    .split('\n')
    .flatMap((line) => line.split(/(?=<[^>@/][^>]*>)/g))
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const named = /^<([^>]+)>\s*(.*)$/.exec(part);
      return named ? { tag: named[1], text: named[2] } : { tag: null, text: part };
    });
}

/**
 * "1 stage", "12 stages": a count with its noun in the right number. The Terminal home
 * printed "1 seasons" for a mode with one season, from a `{count} {noun}` that always
 * took the plural; every count on the stage pages goes through this now.
 */
export function countOf(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}
