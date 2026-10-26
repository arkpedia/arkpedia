import type { BacklogSources, FirstClear } from './pulls';
import type { Roster } from '@/lib/planner/roster';

/** Remaining successful-clear cost, respecting an explicit unclaim of a cleared group. */
export function stageRewardSanity(stages: readonly string[] | undefined, costs: BacklogSources['stageSanity'], cleared: ReadonlySet<string> | null): number | null {
  if (!stages) return null;
  const left = stages.filter(stage => !cleared?.has(stage));
  let total = 0;
  for (const stage of new Set(left.length ? left : stages)) {
    const cost = costs?.[stage];
    if (cost === undefined) return null;
    total += cost;
  }
  return total;
}

/** Unknown snapshots/requirements must not be presented as a locked stage. */
export function paradoxAvailability(stage: FirstClear, roster?: Roster): { ready: boolean | null; label: string } {
  if (!stage.operatorId || !stage.unlock || !roster) return { ready: null, label: 'Import your account to check availability' };
  const owned = roster[stage.name.split(' · ')[0]] ?? roster[stage.operatorId];
  const { elite, level } = stage.unlock;
  const requirement = `E${elite} Lv.${level}`;
  return !owned ? { ready: false, label: `Operator not owned · Requires ${requirement}` }
    : { ready: owned.elite > elite || owned.elite === elite && owned.level >= level, label: `Requires ${requirement}` };
}

/** One successful clear per unfinished reward stage. No retries, farming or unlock costs. */
export function remainingSanity(backlog: BacklogSources, keys: ReadonlySet<string>, events: ReadonlySet<string>, annihilationDone: boolean, cleared: ReadonlySet<string> | null) {
  const stages = new Set<string>();
  for (const [items, done] of [[backlog.chapters, keys], [backlog.playable, events]] as const) {
    for (const item of items) {
      if (done.has(item.id) || !item.op) continue;
      if (!item.stages) return null;
      const left = item.stages.filter(id => !cleared?.has(id));
      // An explicit manual unclaim of a fully cleared chapter counts it again.
      for (const id of left.length ? left : item.stages) stages.add(id);
    }
  }
  for (const [items, done] of [[backlog.resources, keys.has('daily')], [backlog.annihilation, annihilationDone]] as const) {
    if (!done) for (const item of items) if (!keys.has(item.id)) stages.add(item.id.slice(item.id.indexOf(':') + 1));
  }
  let total = 0;
  for (const id of stages) {
    const cost = backlog.stageSanity?.[id];
    if (cost === undefined) return null;
    total += cost;
  }
  return total;
}
