import { activeBaseSkills } from './activeBaseSkills';
import { skillEffectEntry, type SkillCondition, type SkillCountSource } from './baseSkillEffects';
import type { BaseRosterName } from './baseGroupRosters';
import type { OwnedOperator } from './baseOptimizer';
import type { SimulationBase } from './baseSimulation';

/** Counts the calculator takes over every placed operator, whatever room they are in (lib/base/calculateBase.ts):
 *  a seat in the Reception Room or Office raises them as much as a Factory seat does. */
const PLACEMENT_COUNT = /^base\.(roster|rosterOthers|faction|facilitiesWithRoster|workFacilitiesWithRoster|workersOfRoster):(.+)$/;

/** The counts a Dormitory bed does not raise: workers outside the dorms, work facilities, an operator at work.
 *  (A facility with a roster member counts a Dormitory too, but a Reception seat adds a facility a bed cannot.) */
const WORK_SEAT_COUNT = new Set(['workersOfRoster', 'workFacilitiesWithRoster', 'facilitiesWithRoster', 'name']);

const remembered = new WeakMap<Record<string, OwnedOperator>, WeakMap<SimulationBase, Record<string, ReadonlySet<string>>>>();

/**
 * The owned operators whose seat anywhere in the base raises a count another owned operator's skill reads: a Rhine
 * Lab operator for Nasti's Costly Construction (per Rhine Lab operator in the base), an Elite Operator for Terra's
 * Ark (per facility with one), a Sui member for a Trading Post's per-Sui-facility orders. The Reception Room and
 * Office take only operators with a skill for the room, and these, since what they add shows in the other rooms'
 * output, not the room's own speed.
 * Read from the skill table, so a new skill of this kind needs no change here.
 *
 * `workSeat`: only the counts a Dormitory bed does not raise. Nasti's "in the Base" counts a Rhine Lab operator
 * resting in a dorm as much as one in the Reception Room, so that seat pays only for an operator with no bed in the
 * plan. The search scores crews without their dorms (planGenome.ts `snapshotValue`) and cannot tell the two apart,
 * and on a large roster the whole set is long (92 of the maxed catalogue), so the search takes the work-seat set;
 * the completion, which judges every seat by the full simulation, takes them all.
 */
export function countFeeders(base: Pick<SimulationBase, 'operators' | 'rosters' | 'skillSlots' | 'facilities'>, roster: Record<string, OwnedOperator>, options: { workSeat?: boolean } = {}): ReadonlySet<string> {
  const scope = options.workSeat ? 'work' : 'any';
  let byBase = remembered.get(roster);
  if (!byBase) { byBase = new WeakMap(); remembered.set(roster, byBase); }
  let byScope = byBase.get(base as SimulationBase);
  if (!byScope) { byScope = {}; byBase.set(base as SimulationBase, byScope); }
  const known = byScope[scope];
  if (known) return known;
  const byName = new Map(base.operators.map(o => [o.name, o]));
  const owned = Object.keys(roster).filter(n => byName.has(n));
  const labels = [...new Set((base.facilities ?? []).filter(f => f.capacity > 0).map(f => f.label))];
  // Which counts (and named operators, `baseHas`) each owned operator's skills read.
  const reads: { reader: string; source: string }[] = [];
  const fromCondition = (reader: string, c: SkillCondition | undefined): void => {
    if (!c) return;
    if (c.type === 'all') for (const x of c.of) fromCondition(reader, x);
    else if (c.type === 'countAtLeast' || c.type === 'countAtMost') reads.push({ reader, source: c.count });
    else if (c.type === 'baseHas') reads.push({ reader, source: `name:${c.name}` });
  };
  for (const reader of owned) for (const label of labels) {
    for (const skill of activeBaseSkills(byName.get(reader)!, label, roster[reader].eliteLevel, base.skillSlots, roster[reader].level)) {
      for (const effect of skillEffectEntry(skill)?.effects ?? []) {
        if (effect.per) reads.push({ reader, source: effect.per.count });
        fromCondition(reader, effect.when);
      }
    }
  }
  const feeders = new Set<string>();
  for (const { reader, source } of reads) {
    if (source.startsWith('name:')) { const name = source.slice(5); if (name !== reader && name in roster) feeders.add(name); continue; }
    const m = PLACEMENT_COUNT.exec(source as SkillCountSource);
    if (!m) continue;
    const [, kind, rest] = m;
    if (options.workSeat && !WORK_SEAT_COUNT.has(kind)) continue;
    const counts = kind === 'faction' ? (n: string) => byName.get(n)?.faction === rest : (n: string) => base.rosters[rest as BaseRosterName]?.has(n) ?? false;
    // The reader works in their own room already; only someone else's seat raises the count.
    for (const n of owned) if (n !== reader && counts(n)) feeders.add(n);
  }
  byScope[scope] = feeders;
  return feeders;
}
