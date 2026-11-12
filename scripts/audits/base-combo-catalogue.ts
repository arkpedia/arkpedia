/**
 * The base skills that need someone else, read from the skill table (lib/base/base-skill-effects.json): a named
 * operator, a roster group, or a resource pool another skill fills. These are the combinations a search has to find
 * together, because each half alone reads as little or nothing. Nothing here is recalled or typed by hand: it is
 * whatever the game's own skill conditions name.
 *
 *   npx tsx scripts/audits/base-combo-catalogue.ts            # writes docs/development/base-known-combos.md
 *   npx tsx scripts/audits/base-combo-catalogue.ts --json     # prints the links as JSON
 */
import fs from 'node:fs';
import { getAllOperators } from '../../lib/operators/operators';
import { skillEffectEntry, type SkillCondition, type SkillEffect } from '../../lib/base/baseSkillEffects';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import groups from '../../data/base-group-rosters.json';

export interface ComboLink {
  /** The operator whose skill needs the other half. */
  holder: string; skill: string; room: string;
  /** What it needs: an operator, a roster group, or a pool. */
  needs: { kind: 'operator' | 'roster' | 'pool'; name: string };
  /** Where the other half has to be. */
  where: string;
}

const WHERE: Record<string, string> = { roomHas: 'same room', roomHasRoster: 'same room', ccHas: 'Control Center', baseHas: 'anywhere working', inTradingPost: 'a Trading Post', inFactory: 'a Factory', inPowerPlant: 'a Power Plant', inDormitory: 'a Dormitory', inReceptionRoom: 'Reception Room', trainerIs: 'Training Room', targetIs: 'same Dormitory', targetInRoster: 'same Dormitory' };
const COUNT_WHERE: [RegExp, string][] = [[/^room\./, 'same room'], [/^cc\./, 'Control Center'], [/^(tp|tradingPosts)\./, 'Trading Posts'], [/^factory\./, 'Factories'], [/Plants?\./, 'Power Plants'], [/^reception\./, 'Reception Room'], [/^base\./, 'anywhere in the base']];

function ofCondition(c: SkillCondition | undefined, out: (needs: ComboLink['needs'], where: string) => void) {
  if (!c) return;
  if (c.type === 'all') { for (const x of (c as { of: SkillCondition[] }).of) ofCondition(x, out); return; }
  if ('name' in c && typeof c.name === 'string' && WHERE[c.type] && c.type !== 'traineeBranch' as string) out({ kind: 'operator', name: c.name }, WHERE[c.type]);
  if ('roster' in c && typeof c.roster === 'string') out({ kind: 'roster', name: c.roster }, WHERE[c.type] ?? 'same room');
  if ('count' in c && typeof c.count === 'string') ofCount(c.count, out);
}
function ofCount(count: string, out: (needs: ComboLink['needs'], where: string) => void) {
  const [head, name] = count.split(':');
  if (!name) return;
  if (head === 'resource') { out({ kind: 'pool', name }, 'filled by another skill'); return; }
  if (/skillCategory/.test(head)) { out({ kind: 'roster', name: `skills named ${name}` }, 'same room'); return; }
  if (/roster|faction/i.test(head)) out({ kind: 'roster', name }, COUNT_WHERE.find(([re]) => re.test(head))?.[1] ?? head);
}

/** A skill that changes what its roommates are worth without naming them: an override, an order-tier or trade rule,
 *  a handler that reads the room (its capacity, its staff, the hours worked), or a Morale-gated pool. */
export interface RoomShaper { holder: string; skill: string; room: string; how: string }

export function comboLinks(): { links: ComboLink[]; producers: Record<string, { holder: string; skill: string; room: string }[]>; shapers: RoomShaper[] } {
  const links: ComboLink[] = [], producers: Record<string, { holder: string; skill: string; room: string }[]> = {}, shapers: RoomShaper[] = [];
  for (const op of getAllOperators()) {
    if (op.isFuture || /^Amiya \(/.test(op.name)) continue;
    for (const skill of op.baseSkills ?? []) {
      const entry = skillEffectEntry(skill);
      if (!entry) continue;
      const room: string = (skill as { facility?: string | null }).facility ?? entry.roomType ?? '';
      const seen = new Set<string>();
      const e = entry as { interaction?: Record<string, unknown>; custom?: { handler: string; params?: Record<string, unknown> } };
      if (e.interaction) shapers.push({ holder: op.name, skill: skill.name ?? '', room, how: Object.entries(e.interaction).map(([k, v]) => v === true ? k : `${k} ${JSON.stringify(v)}`).join(', ') });
      if (e.custom && !['ramp', 'afterHours'].includes(e.custom.handler)) shapers.push({ holder: op.name, skill: skill.name ?? '', room, how: `${e.custom.handler} ${JSON.stringify(e.custom.params ?? {})}` });
      const out = (needs: ComboLink['needs'], where: string) => {
        if (needs.kind === 'operator' && needs.name === op.name) return;
        const key = `${needs.kind}:${needs.name}:${where}`;
        if (seen.has(key)) return;
        seen.add(key); links.push({ holder: op.name, skill: skill.name ?? '', room, needs, where });
      };
      for (const effect of entry.effects as SkillEffect[]) {
        ofCondition(effect.when, out);
        if (effect.per?.count) ofCount(effect.per.count, out);
        if (effect.kind === 'resource' && effect.name) (producers[effect.name] ??= []).some(p => p.holder === op.name && p.skill === (skill.name ?? '')) || producers[effect.name].push({ holder: op.name, skill: skill.name ?? '', room });
        else if (effect.name && effect.name !== '*others' && (effect.kind as string) !== 'resource') out({ kind: 'operator', name: effect.name }, 'same room');
      }
    }
  }
  return { links, producers, shapers };
}

if (process.argv[1]?.endsWith('base-combo-catalogue.ts')) {
  const { links, producers, shapers } = comboLinks();
  if (process.argv.includes('--json')) { console.log(JSON.stringify({ links, producers, shapers }, null, 1)); process.exit(0); }
  const rosters = toBaseRosters(groups) as unknown as Record<string, string[] | { members?: string[] }>;
  const members = (name: string) => { const r = rosters[name]; return Array.isArray(r) ? r : r?.members ?? []; };
  const by = (kind: ComboLink['needs']['kind']) => links.filter(l => l.needs.kind === kind).sort((a, b) => a.room.localeCompare(b.room) || a.needs.name.localeCompare(b.needs.name) || a.holder.localeCompare(b.holder));
  const lines: string[] = ['# Base skills that need someone else', '',
    'Generated by `npx tsx scripts/audits/base-combo-catalogue.ts` from the skill table (`lib/base/base-skill-effects.json`);',
    'do not edit by hand. Each row is one half of a combination the game\'s own skill text names: the search has to place both',
    'halves together for either to read at its real value. Corrections belong in the skill table, not here.', '',
    `${links.length} links: ${by('operator').length} name an operator, ${by('roster').length} a group, ${by('pool').length} a pool another skill fills.`, '',
    '## A named operator', '', '| Room | Operator | Skill | Needs | Where |', '| --- | --- | --- | --- | --- |',
    ...by('operator').map(l => `| ${l.room} | ${l.holder} | ${l.skill} | ${l.needs.name} | ${l.where} |`), '',
    '## A pool another skill fills', '', '| Pool | Filled by | Read by |', '| --- | --- | --- |',
    ...[...new Set([...Object.keys(producers), ...by('pool').map(l => l.needs.name)])].sort().map(pool => `| ${pool} | ${(producers[pool] ?? []).map(p => `${p.holder} (${p.room})`).join(', ') || '—'} | ${by('pool').filter(l => l.needs.name === pool).map(l => `${l.holder} (${l.room})`).join(', ') || '—'} |`), '',
    '## A group', '', '| Group | Counted | Read by | Members |', '| --- | --- | --- | --- |'];
  const groupsOf = new Map<string, ComboLink[]>();
  for (const l of by('roster')) groupsOf.set(`${l.needs.name}|${l.where}`, [...(groupsOf.get(`${l.needs.name}|${l.where}`) ?? []), l]);
  for (const [key, ls] of [...groupsOf].sort()) { const [name, where] = key.split('|'); lines.push(`| ${name} | ${where} | ${[...new Set(ls.map(l => `${l.holder} (${l.room})`))].join(', ')} | ${members(name).length || '?'} |`); }
  lines.push('', '## Skills that change what roommates are worth', '',
    'No partner is named: the skill overrides the others\' contribution, sets an order tier or trade rule, reads the room\'s',
    'capacity or staff, or fills a pool only at a Morale level. Their partners are whoever the calculator scores best beside them.', '',
    '| Room | Operator | Skill | How |', '| --- | --- | --- | --- |',
    ...shapers.sort((a, b) => a.room.localeCompare(b.room) || a.holder.localeCompare(b.holder)).map(x => `| ${x.room} | ${x.holder} | ${x.skill} | ${x.how.replace(/\|/g, '/')} |`));
  fs.writeFileSync('docs/development/base-known-combos.md', lines.join('\n') + '\n');
  console.log(`${links.length} links written to docs/development/base-known-combos.md`);
}
