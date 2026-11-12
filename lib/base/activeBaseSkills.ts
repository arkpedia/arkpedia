import type { BaseOperator, BaseSkill } from '../operators/operatorTypes';
import type { BaseSkillSlot, BaseSkillSlots } from './baseSkillSlots';
export const cleanSkillName = (name: string | null | undefined) => (name ?? '').split('Replaces')[0].trim();
function extractReplacedName(name: string | null | undefined) { return name?.includes('Replaces') ? name.split('Replaces')[1].trim() : null; }
function normalizeForComparison(description: string | null) { return (description ?? '').replace(/[+-]?\d+(?:\.\d+)?%?/g, '').replace(/\s+/g, ' ').trim(); }
const ELITE_ORDER = ['Base', 'Elite 1', 'Elite 2'];
// The answer depends only on the operator record, the room, promotion, level and slot table, all of which a search
// asks about thousands of times (the base calculator looks every placed operator up on every call), so it is kept
// per record and slot table. Callers get their own array; the skill objects are shared and never mutated.
const EMPTY_SLOTS: BaseSkillSlots = {};
const remembered = new WeakMap<BaseSkillSlots, WeakMap<BaseOperator, Map<string, BaseSkill[]>>>();
export function activeBaseSkills(op: BaseOperator, facilityLabel: string, eliteLevel: string | null, skillSlots: BaseSkillSlots = EMPTY_SLOTS, operatorLevel?: number): BaseSkill[] {
  let byOperator = remembered.get(skillSlots);
  if (!byOperator) { byOperator = new WeakMap(); remembered.set(skillSlots, byOperator); }
  let byQuery = byOperator.get(op);
  if (!byQuery) { byQuery = new Map(); byOperator.set(op, byQuery); }
  const key = `${facilityLabel}|${eliteLevel}|${operatorLevel ?? ''}`;
  let skills = byQuery.get(key);
  if (!skills) { skills = computeActiveBaseSkills(op, facilityLabel, eliteLevel, skillSlots, operatorLevel); byQuery.set(key, skills); }
  return [...skills];
}
function computeActiveBaseSkills(op: BaseOperator, facilityLabel: string, eliteLevel: string | null, skillSlots: BaseSkillSlots, operatorLevel?: number): BaseSkill[] {
    // Level 30 is functionally the same tier as Base -- 1-star operators
    // have no Elite promotion path at all, so a slot tagged 'Level 30'
    // should resolve exactly like a Base-tier slot would.
    const normalizedEliteLevel = eliteLevel === 'Level 30' ? 'Base' : eliteLevel;
    const currentIndex = ELITE_ORDER.indexOf(normalizedEliteLevel || '');
    const facilitySkills = (op.baseSkills || []).filter((bs) => bs.facility === facilityLabel);
    const isBaseTierSkill = (bs: BaseSkill) => !bs.eliteLevel || bs.eliteLevel === 'Base' || bs.eliteLevel === 'Level 30';
    if (currentIndex === -1) {
      return facilitySkills.filter((bs) => bs.eliteLevel === normalizedEliteLevel).map((bs) => ({ ...bs, name: cleanSkillName(bs.name), rawName: bs.name }));
    }
    // Where the game's own slot data covers a skill, it is authoritative
    // and the text heuristics below are skipped entirely -- see
    // lib/base/baseSkillSlots.ts for what a "slot" is. That data is the
    // record's own slot, phase and level first (building_data, written on
    // every released operator each night by sync-operator-english.mjs),
    // then data/base-skill-slots.json (from this page's props) for a record
    // that does not carry them yet. Only an operator with a skill neither
    // covers (Ukusik) falls through to the heuristics. It also supersedes
    // the scraped elite tag, which is occasionally wrong: Varkáris's Pride
    // of a Hero β is tagged Elite 2 here but the game unlocks it at Elite 1,
    // so an Elite 1 Varkáris was showing the weaker α.
    const slotted = (op.baseSkills ?? []).map((bs) => ({
      bs,
      meta: typeof bs.slot === 'number' && typeof bs.phase === 'number'
        ? { slot: bs.slot, phase: bs.phase, level: bs.level ?? 1 }
        : skillSlots[`${op.name}|${cleanSkillName(bs.name)}|${bs.eliteLevel || 'Base'}`],
    }));
    if (slotted.length > 0 && slotted.every((entry) => entry.meta)) {
      const bestBySlot = new Map<number, { bs: BaseSkill; meta: BaseSkillSlot }>();
      for (const entry of slotted) {
        const meta = entry.meta as BaseSkillSlot;
        if (meta.phase > currentIndex) continue; // not promoted far enough for this step yet
        if (operatorLevel !== undefined && meta.phase === currentIndex && meta.level > operatorLevel) continue;
        const held = bestBySlot.get(meta.slot);
        // Within one slot only the highest unlocked step applies. Account
        // imports supply an exact level; manual elite choices assume the
        // level-gated steps in that tier have been reached.
        if (!held || meta.phase > held.meta.phase || (meta.phase === held.meta.phase && meta.level > held.meta.level)) {
          bestBySlot.set(meta.slot, { bs: entry.bs, meta });
        }
      }
      return [...bestBySlot.entries()]
        .sort((a, b) => a[0] - b[0])
        .filter(([, entry]) => entry.bs.facility === facilityLabel)
        .map(([, entry]) => ({ ...entry.bs, name: cleanSkillName(entry.bs.name), rawName: entry.bs.name }));
    }

    const result: BaseSkill[] = [];
    const explicitlyReplacedNames = new Set<string>();
    for (let i = currentIndex; i >= 0; i--) {
      // The Base tier (i === 0) additionally picks up any Level 30
      // skills alongside actual Base-tagged ones, so both apply together
      // -- same treatment as an operator with two genuinely concurrent
      // skills at the same tier.
      const tierSkills = i === 0 ? facilitySkills.filter(isBaseTierSkill) : facilitySkills.filter((bs) => bs.eliteLevel === ELITE_ORDER[i]);
      for (const sk of tierSkills) {
        const replaced = extractReplacedName(sk.name);
        if (replaced) explicitlyReplacedNames.add(replaced);
        const cleanedName = cleanSkillName(sk.name);
        if (cleanedName && explicitlyReplacedNames.has(cleanedName)) continue; // a higher-Elite skill already processed explicitly replaces this one
        // A lower-Elite skill sharing the exact same name as one already
        // kept (from a higher tier, since we iterate highest-to-lowest)
        // is the same ability just upgraded, even without an explicit
        // "Replaces" suffix or identical description text -- a repeated
        // skill name IS the signal that it's the same slot.
        if (cleanedName && result.some((r) => r.name === cleanedName)) continue;
        const normalized = normalizeForComparison(sk.description);
        if (!result.some((r) => normalizeForComparison(r.description) === normalized)) result.push({ ...sk, name: cleanedName, rawName: sk.name });
      }
    }
    return result;
  }
