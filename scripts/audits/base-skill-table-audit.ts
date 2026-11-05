/**
 * The whole base skill table (lib/base/base-skill-effects.json) laid out for a person to scan: every entry with
 * its game text beside what the table read from it (each effect in words, the interaction flags, the custom
 * handler, the dependency class), grouped by room, so a mismatch between the words and the numbers stands out.
 *
 *   npx tsx scripts/audits/base-skill-table-audit.ts [docs/development/base-skill-table-audit.md]
 *
 * The EN text is building_data's (ARKPEDIA_GAMEDATA, the stage pipeline's cache, or .cache/gamedata/en); a CN-only
 * entry shows the record's English with the CN text under it. Entries no released operator carries are marked.
 * The last section lists every skill naming an operator who has an alternate form, with the forms it counts
 * (scripts/build/base-skill-forms.ts), when the glossary and character tables are on disk.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getAllOperators } from '../../lib/operators/operators';
import { cleanSkillName } from '../../lib/base/activeBaseSkills';
import { describeCondition } from '../../lib/base/skillEvaluation';
import type { BaseSkillEffectEntry, BaseSkillEffectsTable, SkillEffect } from '../../lib/base/baseSkillEffects';
import table from '../../lib/base/base-skill-effects.json';
import { loadOperatorForms, namedOperators, decideForms, formsTablesPresent, type OperatorForms } from '../build/base-skill-forms';

const ROOT = path.resolve(import.meta.dirname, '../..');
const out = process.argv[2] ?? 'docs/development/base-skill-table-audit.md';
const strip = (text: string | null | undefined) => (text ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const read = (file: string | undefined) => file && fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as { buffs: Record<string, { description: string; buffName: string }> }).buffs : {};
const en = read([process.env.ARKPEDIA_GAMEDATA && path.join(process.env.ARKPEDIA_GAMEDATA, 'building_data.json'), path.join(ROOT, '.cache/upstream/en-gamedata/en/gamedata/excel/building_data.json'), path.join(ROOT, '.cache/gamedata/en/building_data.json')].find(f => f && fs.existsSync(f)));
const cn = read([process.env.ARKPEDIA_CN && path.join(process.env.ARKPEDIA_CN, 'gamedata/excel/building_data.json'), path.join(ROOT, '.cache/upstream/cn-tables/zh_CN/gamedata/excel/building_data.json'), path.join(ROOT, '.cache/gamedata/cn/building_data.json')].find(f => f && fs.existsSync(f)));

const entries = (table as unknown as BaseSkillEffectsTable).entries;
const ELITE = ['E0', 'E1', 'E2'];
const holders = new Map<string, { operator: string; skill: string; unlock: string; description: string }[]>();
for (const op of getAllOperators().filter(o => !/^Amiya \(/.test(o.name))) for (const sk of op.baseSkills ?? []) {
  if (!sk.buffId) continue;
  (holders.get(sk.buffId) ?? holders.set(sk.buffId, []).get(sk.buffId)!).push({ operator: op.name + (op.isFuture ? ' (not yet on Global)' : ''), skill: cleanSkillName(sk.name), unlock: typeof sk.phase === 'number' ? `${ELITE[sk.phase] ?? `E${sk.phase}`}${sk.level && sk.level > 1 ? ` L${sk.level}` : ''}` : '', description: sk.description ?? '' });
}
const ROOMS: Record<string, string> = { MANUFACTURE: 'Factory', TRADING: 'Trading Post', POWER: 'Power Plant', CONTROL: 'Control Center', DORMITORY: 'Dormitory', MEETING: 'Reception Room', HIRE: 'Office', TRAINING: 'Training Room', WORKSHOP: 'Workshop', RECYCLE: 'Recycling Station' };
const RATE = new Set(['productivity', 'orderEfficiency', 'droneRate', 'clueSpeed', 'hrSpeed', 'ccFactoryProductivity', 'ccOrderEfficiency', 'ccClueSpeed', 'ccTrainingSpeed', 'ccHrSpeed', 'ccPreciousMetalProductivity', 'ccReceptionClueSpeed', 'perTradingPostOrderEfficiency', 'perFactoryProductivity', 'factoryOfOperator', 'trainingSpeed', 'byproductChance', 'recycleEfficiency', 'recipeMoraleFactor']);
const fmt = (kind: string, v: number) => RATE.has(kind) ? `${+(v * 100).toFixed(4)}%` : `${+v.toFixed(6)}`;
const effectInWords = (e: SkillEffect) => {
  const parts = [`**${e.kind}**${e.name ? ` (${e.name})` : ''} ${fmt(e.kind, e.value)}`];
  if (e.per) parts.push(`+ ${fmt(e.kind, e.per.amount)} per ${e.per.step && e.per.step > 1 ? `${e.per.step} ` : ''}${e.per.count}${e.per.maxCount !== undefined ? ` (at most ${e.per.maxCount})` : ''}`);
  if (e.cap !== undefined) parts.push(`capped at ${fmt(e.kind, e.cap)}`);
  if (e.product) parts.push(`only making ${e.product}`);
  if (e.when) parts.push(`only ${describeCondition(e.when)}`);
  if (e.targets?.length) parts.push(`for ${e.targets.join('/')}`);
  if (e.suppressedBy) parts.push(`nothing while ${e.suppressedBy.buffId} is active${e.suppressedBy.when ? ` ${describeCondition(e.suppressedBy.when)}` : ''}`);
  return parts.join(', ');
};
const interactionInWords = (i: NonNullable<BaseSkillEffectEntry['interaction']>) => Object.entries(i).map(([k, v]) => `${k}${v === true ? '' : `: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`}`).join('; ');

const lines: string[] = ['# Base skill table audit', '', `Generated by \`scripts/audits/base-skill-table-audit.ts\` from \`lib/base/base-skill-effects.json\` (${Object.keys(entries).length} entries). Each entry: the game text, then what the table reads from it. Rates are percentages, Morale and limits absolute. "Needs" is the dependency class the search breaks ties by.`, ''];
const byRoom = new Map<string, BaseSkillEffectEntry[]>();
for (const e of Object.values(entries)) (byRoom.get(e.roomType) ?? byRoom.set(e.roomType, []).get(e.roomType)!).push(e);
let unheld = 0;
for (const [room, list] of [...byRoom.entries()].sort(([a], [b]) => Object.keys(ROOMS).indexOf(a) - Object.keys(ROOMS).indexOf(b))) {
  lines.push(`## ${ROOMS[room] ?? room} (${list.length})`, '');
  for (const e of list.sort((a, b) => a.buffId.localeCompare(b.buffId))) {
    const held = holders.get(e.buffId) ?? [];
    if (!held.length) unheld++;
    const enText = strip(en[e.buffId]?.description);
    const text = enText || held[0]?.description || '';
    lines.push(`### \`${e.buffId}\` ${held.length ? held.map(h => `${h.operator} — ${h.skill} (${h.unlock})`).join('; ') : '_no released operator carries this_'}`, '');
    lines.push(`> ${strip(text) || '(no text)'}`);
    if (e.source === 'cn' || !enText) lines.push(`> CN: ${strip(cn[e.buffId]?.description) || '(none)'}`);
    lines.push('', `- Shape **${e.shape}**, ${e.buffCategory.toLowerCase()}, needs **${e.dependency ?? '?'}**${e.efficiency !== null ? `, headline ${e.efficiency}%` : ''}${e.unlock ? `, unlock E${e.unlock.phase}${e.unlock.level > 1 ? ` L${e.unlock.level}` : ''}` : ''}${e.targets.length ? `, targets ${e.targets.join('/')}` : ''}${e.nonNumeric ? ', **non-numeric**' : ''}`);
    for (const x of e.effects) lines.push(`- ${effectInWords(x)}`);
    if (!e.effects.length && !e.custom) lines.push(`- (no effects)`);
    if (e.custom) lines.push(`- custom handler **${e.custom.handler}** ${JSON.stringify(e.custom.params ?? {})}`);
    if (e.interaction) lines.push(`- interaction: ${interactionInWords(e.interaction)}`);
    if (e.note) lines.push(`- note: ${e.note}`);
    lines.push('');
  }
}

// Operators with alternate forms: what each skill naming one counts, beside the rule's reading of the text.
const carriers = (e: BaseSkillEffectEntry, name: string): string[] => {
  const found: string[] = [];
  const walk = (c: { type: string; name?: string; forms?: string[]; of?: unknown[] } | undefined) => {
    if (!c) return;
    if (c.type === 'all') for (const x of c.of ?? []) walk(x as typeof c);
    else if (c.name === name) found.push(`${c.type}: ${[name, ...(c.forms ?? [])].join(', ')}`);
  };
  for (const x of e.effects) { walk(x.when); walk(x.suppressedBy?.when); if (x.name === name) found.push(`${x.kind} name: ${name}`); }
  const i = e.interaction;
  if (i?.preferredTarget === name) found.push(`preferredTarget: ${[name, ...(i.preferredTargetForms ?? [])].join(', ')}`);
  if (i?.providerBonus?.provider === name) found.push(`providerBonus provider: ${name}`);
  if (i?.doublesWith === name) found.push(`doublesWith: ${name}`);
  if (e.custom && JSON.stringify(e.custom.params ?? {}).includes(JSON.stringify(name))) found.push(`custom ${e.custom.handler}: ${name}`);
  return found;
};
async function alternateForms() {
lines.push('## Operators with alternate forms', '');
lines.push("An operator with an alternate (W and Wiš'adel, Exusiai and Exusiai the New Covenant: the game's `char_meta_table` families) counts exactly the forms the skill text tags. A glossary term around the name (`<$cc.angel>Exusiai</>`) means every operator the term lists (`gamedata_const`, \"Includes the following Operators\"); a plain tag (`<@cc.kw>W</>`) means that single form, by the string written, so \"W\" is W alone and \"SilverAsh the Reignfrost\" the alternate alone. Never by name likeness. The EN and CN texts are read side by side and CN decides where they differ; the build (`scripts/build/base-skill-forms.ts`) refuses a term on a condition that cannot carry forms. The Siracusa, Glasgow and other group rosters come from the same glossary through `scripts/imports/import-base-rosters.mjs`.", '');
if (!formsTablesPresent(ROOT)) lines.push('_The glossary and character tables are not on disk (run the build with --fetch), so this section is empty._', '');
else {
  const forms: OperatorForms = await loadOperatorForms(ROOT, getAllOperators());
  lines.push('| Skill | Named (EN / CN) | Glossary term | Forms counted (how the table carries them) | Other forms, not counted |', '|---|---|---|---|---|');
  let rows = 0, disagree = 0;
  for (const e of Object.values(entries).sort((a, b) => a.buffId.localeCompare(b.buffId))) {
    for (const n of namedOperators(forms, en[e.buffId]?.description, cn[e.buffId]?.description).filter(x => forms.familyOf.has(x.form.id))) {
      const d = decideForms(forms, n);
      const carried = carriers(e, d.name);
      const agree = carried.length > 0 && carried.every(c => { const set = c.slice(c.indexOf(': ') + 2).split(', ').sort().join(', '); return c.startsWith('providerBonus') || c.startsWith('doublesWith') || c.includes(' name: ') || c.startsWith('custom') ? d.forms.length === 1 : set === [...d.forms].sort().join(', '); });
      if (!agree) disagree++;
      rows++;
      const held = holders.get(e.buffId) ?? [];
      lines.push(`| \`${e.buffId}\` ${held.length ? `${held[0].operator} — ${held[0].skill}` : '(no released operator)'} | ${n.en ? `"${n.en.string}"` : '—'} / ${n.cn ? `"${n.cn.string}"` : '—'} | ${d.term ?? 'none'} | ${d.forms.join(', ')} (${carried.length ? carried.join('; ') : 'not carried'})${agree ? '' : ' **differs from the rule**'}${d.note ? ` — ${d.note}` : ''} | ${d.notCounted.length ? d.notCounted.join(', ') : '—'} |`);
    }
  }
  lines.push('', `${rows} skills name an operator who has an alternate form; ${disagree} carry it otherwise than the rule reads.`, '');
}
}
alternateForms().then(() => {
  fs.writeFileSync(path.join(ROOT, out), lines.join('\n') + '\n');
  console.log(`${Object.keys(entries).length} entries, ${unheld} held by no released operator, written to ${out}`);
});
