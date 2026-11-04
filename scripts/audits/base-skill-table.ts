/**
 * Every released operator's base skills as one review table: room, unlock, the game's buff id and its family,
 * and how the skill table (lib/base/base-skill-effects.json) expresses it -- its shape, effects, custom
 * handler and interactions. Nothing reads this file; it is for review after a game data refresh or a change
 * to the table's rules.
 * Usage: npx tsx scripts/audits/base-skill-table.ts <out.json>
 */
import fs from 'node:fs';
import { getAllOperators } from '../../lib/operators/operators';
import { cleanSkillName } from '../../lib/base/activeBaseSkills';
import { skillEffectEntry } from '../../lib/base/baseSkillEffects';

const out = process.argv[2];
if (!out) throw new Error('Usage: npx tsx scripts/audits/base-skill-table.ts <out.json>');

const ELITE = ['E0', 'E1', 'E2'];
const rows = getAllOperators().filter(o => !o.isFuture && !/^Amiya \(/.test(o.name)).flatMap(op => (op.baseSkills ?? []).map(skill => {
  const entry = skillEffectEntry(skill);
  return {
    operator: op.name, rarity: op.rarity ?? null, skill: cleanSkillName(skill.name), room: skill.facility ?? '',
    unlock: typeof skill.phase === 'number' ? `${ELITE[skill.phase] ?? `E${skill.phase}`}${skill.level && skill.level > 1 ? ` Lv${skill.level}` : ''}` : skill.eliteLevel ?? '',
    buffId: skill.buffId ?? '', family: entry?.family ?? '', shape: entry?.shape ?? 'missing',
    effects: entry?.effects ?? [], custom: entry?.custom ?? null, interaction: entry?.interaction ?? null, nonNumeric: !!entry?.nonNumeric,
    description: skill.description ?? '',
  };
}));
fs.writeFileSync(out, JSON.stringify(rows));
const count = (f: (r: typeof rows[number]) => boolean) => rows.filter(f).length;
console.log(`${rows.length} skills, ${new Set(rows.map(r => r.family)).size} families; ${['flat', 'counted', 'threshold', 'pool', 'custom', 'missing'].map(s => `${s} ${count(r => r.shape === s)}`).join(', ')}; non-numeric ${count(r => r.nonNumeric)}`);
