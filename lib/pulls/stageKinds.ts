/**
 * The hard stages a reader can leave out of the Reward Tracker's "still to claim": each
 * Originite Prime stage tagged by what kind of hard it is, at build time
 * (scripts/build/build-pull-sources.ts), from the site's stage records, which copy the
 * game's stage_table:
 *
 *   challenge  Challenge Mode: difficulty FOUR_STAR (the record's difficulty.tier
 *              'four_star'). The events' and the early main story's alike (0-1 CM).
 *   h          a main-story H stage (H11-2): stageType SUB, code H<episode>-<n>. By the
 *              code, because stage_table files the 49 of them under three diffGroups
 *              (NONE, NORMAL, TOUGH) and the record marks only the TOUGH ones.
 *   adverse    a main-story Adverse Environment stage (tough_11-01): diffGroup TOUGH, which
 *              the record carries as variant 'adverse_environment'. H stages excepted.
 *              And, since Episode 15, the main story's harder variant in its place: the
 *              six-star stage (main_17-09#s, shown "17-10 6★"), stage_table difficulty
 *              SIX_STAR (diffGroup NONE), which the record carries as difficulty.tier
 *              'six_star'. Episodes 15 to 17 have 45 of them on Global (2026-10).
 *   s          an event's S stage (NL-S-1, CW-S-1-A): an activity stage coded <EVENT>-S-<n>.
 *              stage_table has no field for these (NORMAL, diffGroup NONE), so by the code.
 *              Its Challenge Mode is both 's' and 'challenge'.
 */
export const STAGE_KINDS = ['challenge', 'h', 'adverse', 's'] as const;
export type StageKind = typeof STAGE_KINDS[number];

/** The few fields of a stage record (data/stages) the kinds are read from. */
export interface StageKindRecord {
  code?: string;
  stage_type?: string;
  variant?: { kind?: string } | null;
  difficulty?: { tier?: string } | null;
}

export function stageKindsOf(rec: StageKindRecord): StageKind[] {
  const code = rec.code ?? '';
  const h = (rec.stage_type === 'main' || rec.stage_type === 'sub') && /^H\d+-\d+$/.test(code);
  const kinds: StageKind[] = [];
  if (rec.difficulty?.tier === 'four_star') kinds.push('challenge');
  if (h) kinds.push('h');
  if (!h && (rec.variant?.kind === 'adverse_environment' || rec.difficulty?.tier === 'six_star')) kinds.push('adverse');
  if (rec.stage_type === 'activity' && /-S-\d/.test(code)) kinds.push('s');
  return kinds;
}

/** No stage left out: what a page without the Reward Tracker's toggles passes. */
export const NO_STAGE_EXCLUSIONS: ReadonlySet<StageKind> = new Set();

interface Staged { id: string; op: number; stages?: string[]; stageCodes?: string[]; stageKinds?: StageKind[][] }

/**
 * A back catalogue (a page's `counting`: unclaimedBacklog's, what each item still pays) with
 * the stages of the excluded kinds taken out of every chapter and event: their ids, their
 * codes, and their Originite Prime. `dropped` is how many each item lost, by its id.
 *
 * What an item lost depends on what it was counting. Without an import (`cleared` null) it
 * counts every stage, and loses every excluded one. With one it counts the stages the import
 * left uncleared, and loses the excluded ones among those -- unless the import cleared it all
 * and the reader unticked it, when it counts in full (unclaimedBacklog) and loses them all.
 * An item whose stages or kinds the release does not name stays whole.
 */
/* A release compiled before six-star stages were Adverse Environment (stageKindsOf) gave them
   no kind; its stage label still says what they are ("17-10 6★", build-pull-sources.ts). */
const SIX_STAR_LABEL = / 6★$/;
const kindsAt = (kinds: StageKind[], code: string | undefined): StageKind[] =>
  code && SIX_STAR_LABEL.test(code) && !kinds.includes('adverse') ? [...kinds, 'adverse'] : kinds;

export function excludeStageKinds<T extends { chapters: Staged[]; playable: Staged[] }>(
  backlog: T, excluded: ReadonlySet<StageKind>, cleared: ReadonlySet<string> | null,
): { backlog: T; dropped: Record<string, number> } {
  const dropped: Record<string, number> = {};
  if (!excluded.size) return { backlog, dropped };
  const without = <I extends Staged>(item: I): I => {
    const { stages, stageCodes, stageKinds } = item;
    if (!stages || stageKinds?.length !== stages.length) return item;
    const codes = stageCodes?.length === stages.length ? stageCodes : undefined;
    const out = stages.map((_, index) => kindsAt(stageKinds[index], codes?.[index]).some((kind) => excluded.has(kind)));
    if (!out.some(Boolean)) return item;
    const counted = cleared && stages.some((id) => !cleared.has(id))
      ? (index: number) => !cleared.has(stages[index]) : () => true;
    const lost = out.filter((gone, index) => gone && counted(index)).length;
    if (lost) dropped[item.id] = lost;
    const keep = <V>(list: V[] | undefined) => list?.filter((_, index) => !out[index]);
    return { ...item, op: Math.max(0, item.op - lost), stages: keep(stages), stageKinds: keep(stageKinds),
      ...(stageCodes?.length === stages.length ? { stageCodes: keep(stageCodes) } : {}) };
  };
  return { backlog: { ...backlog, chapters: backlog.chapters.map(without), playable: backlog.playable.map(without) }, dropped };
}
