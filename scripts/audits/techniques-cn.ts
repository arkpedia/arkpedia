import fs from 'node:fs';
import path from 'node:path';
import { translateOperator } from '../../lib/operators/operatorTranslations';
import { detectAutoTechniqueMatches } from '../../lib/techniques/autoTechniques';
import { NOT_FROM_TRAITS, traitText } from '../../lib/techniques/buildTechniqueGroups';
// @ts-expect-error Shared game-table readers are JavaScript.
import { stripRichText } from '../lib/gametext.mjs';
// @ts-expect-error Shared game-table readers are JavaScript.
import { officialTrait, skillRows } from '../sync/sync-operator-english.mjs';
// @ts-expect-error Shared game-table readers are JavaScript.
import { moduleStages } from '../sync/module-stages.mjs';

// Positive evidence of an applied effect. A mention of an immune, already affected or
// allied target does not establish that an operator inflicts that effect on enemies.
const nativeRules: [string, RegExp][] = [
  ['Standard Fragility', /(?:敌人|目标)获得[^；。，]{0,18}[%％](?:的)?脆弱/],
  ['Barrier Generation', /获得[^。；，]{0,28}(?:的|点)屏障/],
  ['Levitate', /浮空(?:所有)?(?:目标|敌人)|使(?:目标|敌人)浮空/],
  ['Burn', /(?:附带|额外造成)[^；。，]{0,30}的灼燃损伤/],
  ['Necrosis', /(?:附带|额外造成)[^；。，]{0,30}的坏死损伤/],
  ['Nervous Impairment', /(?:附带|额外造成)[^；。，]{0,30}的神经损伤/],
  ['Camouflage', /(?:自身|自己)获得迷彩/],
  ['Hit Rate Down', /(?:敌人|目标|敌方)[^。；，]{0,32}命中率(?:下降|降低|[−-]\d)|降低(?:敌人|目标|敌方)[^。；，]{0,25}命中率/],
  ['Hit Reduction', /敌方(?:子弹|投射物|飞行物)[^。；，]{0,30}(?:速度[^。；，]{0,5}降低|被清除)|清除[^。；，]{0,12}敌方(?:子弹|投射物|飞行物)/],
  ['Stun', /使(?:目标|敌人|其)(?:陷入)?(?:眩晕|晕眩)|(?:造成|并附带)[^。；，]{0,16}秒(?:眩晕|晕眩)/],
  ['Bind', /使(?:目标|敌人|其)(?:被)?束缚|束缚(?:目标|敌人)/],
  ['Slow', /使(?:目标|敌人|其)停顿|停顿(?:周围|范围内)[^。；，]{0,15}敌人/],
  ['Fear', /使(?:目标|敌人|其)恐惧/],
  ['Weightless', /使[^。；，]{0,18}(?:敌人|目标)失重/],
  ['True Damage', /造成[^；。，]{0,45}真实伤害/],
  ['Reveal Invisibility', /(?:使[^。；，]{0,18}敌人失去隐匿|可以攻击隐匿(?:的)?敌人)/],
  ['ASPD Down', /(?:敌人|目标)(?:的)?攻击速度(?:[−-]\d|降低|下降)/],
  ['Movement Speed Down', /(?:敌人|目标)(?:的)?移动速度(?:[−-]\d|降低|下降)/],
];

export function auditChineseTechniques(records: any[], englishCharacters: Record<string, any>, englishBattle: Record<string, any>, directory: string, differences: string[]) {
  const read = (name: string) => JSON.parse(fs.readFileSync(path.join(directory, name + '.json'), 'utf8'));
  const ch = read('character_table'), patch = read('char_patch_table').patchChars, skills = read('skill_table');
  const battle = read('battle_equip_table'), equip = read('uniequip_table');
  if ([ch, patch, skills, battle, equip.equipDict, equip.charEquip].some(table => !table || !Object.keys(table).length)) {
    throw new Error('Incomplete Chinese game tables for the techniques audit');
  }
  const characters = { ...ch, ...patch };
  const translations = JSON.parse(fs.readFileSync('data/operator-translations.json', 'utf8'));
  let operators = 0, modules = 0, sources = 0, translatedSources = 0, nativeSources = 0, structuralOnly = 0;
  for (const raw of records) {
    const cid = raw.internalName;
    const character = characters[cid];
    const cnOnly = !englishCharacters[cid];
    const ids: string[] = (equip.charEquip[cid] ?? []).filter((id: string) => battle[id] && !englishBattle[id]);
    const candidates = (raw.modules ?? []).filter((m: any) => m.type === 'Upgrade' && !englishBattle[m.moduleId]);
    if (!cnOnly && !ids.length && !candidates.length) continue;
    const op = translateOperator(raw, translations) as typeof raw;
    const entry = translations[cid];
    function compare(source: string, game: string[], record: string[], tags: any[] = [], rawRecord: string[] = []) {
      const texts = game.filter(Boolean);
      if (!texts.length) return;
      sources++;
      const report = (message: string) => differences.push(`${op.name} [CN ${source}] ${message}`);
      if (!record.some(Boolean)) { report('missing record text'); return; }
      // A changed CN source invalidates the old translation even when neither sentence
      // contains a recognized mechanic. Editorial English cannot be compared verbatim.
      const normalize = (t: string) => t.normalize('NFKC').replace(/\\n|\s+/g, '').replace(/(\d+)\.0+(?!\d)/g, '$1');
      const original = new Set(texts.map(normalize));
      if (rawRecord.some(t => t && /[\u3400-\u9fff]/.test(t) && !original.has(normalize(t)))) report('Chinese record text differs from the pinned source');
      const translated = texts.map(t => entry?.strings[t] ?? (raw.sourceRegion === 'CN' ? entry?.legacyStrings?.[t] : undefined));
      const names = (lines: string[]) => new Set(lines.flatMap(line => detectAutoTechniqueMatches(op.rarity, [line], op.name, op.branch, op.class, !/^S\d/.test(source)))
        .filter(m => m.name && !m.viaBranch && !(source === 'Trait' && NOT_FROM_TRAITS.has(m.name))).map(m => m.name!));
      const native = nativeRules.filter(([, rule]) => texts.some(t => rule.test(t))).map(([name]) => name);
      if (native.length) nativeSources++;
      const known = translated.filter((t): t is string => typeof t === 'string' && !!t);
      if (known.length) translatedSources++;
      if (!known.length && !native.length) structuralOnly++;
      const expected = new Set([...native, ...names(known)]);
      const actual = names(record);
      const explicit = tags.map(tag => tag.name);
      for (const name of expected) if (!actual.has(name) && !explicit.includes(name)) report(`game only: ${name}`);
      if (known.length === texts.length) {
        for (const name of actual) if (!expected.has(name)) report(`record only: ${name}`);
      }
      for (const [a, b] of [['Hit Reduction', 'Hit Rate Down'], ['Hit Rate Down', 'Hit Reduction']]) {
        if (native.includes(a) && !native.includes(b) && (actual.has(b) || explicit.includes(b))) report(`record indicates ${b}, Chinese wording indicates ${a}`);
      }
    }
    if (cnOnly) {
      if (!character) { differences.push(`${op.name} [CN] missing character ${cid}`); continue; }
      operators++;
      const official = officialTrait(character);
      compare('Trait', typeof official === 'string' ? [official] : Object.values(official), [traitText(op) ?? '']);
      const talents = (character.talents ?? []).map((t: any) => (t.candidates ?? []).filter((c: any) => c.description && !c.isHideTalent)).filter((rows: any[]) => rows.length);
      talents.forEach((rows: any[], index: number) => {
        // Some low-rarity operators keep one separate record per potential of one talent.
        const split = talents.length === 1 && op.talents?.length === rows.length && rows.length > 1
          && op.talents.every((t: any, j: number) => t.rows?.length === 1
            && t.rows[0].potential === (rows[j].requiredPotentialRank ? `Potential ${rows[j].requiredPotentialRank + 1}` : null));
        if (split) {
          rows.forEach((c, j) => compare(`Talent ${index + 1} potential ${c.requiredPotentialRank + 1}`, [stripRichText(c.description)], [op.talents[j].rows[0].description], op.talents[j].technique));
          return;
        }
        const talent = op.talents?.[index];
        compare(`Talent ${index + 1}`, rows.map(c => stripRichText(c.description)), (talent?.rows ?? []).map((r: any) => r.description), talent?.technique);
      });
      (character.skills ?? []).forEach((s: any, index: number) => {
        if (!s.skillId) return;
        if (!skills[s.skillId]) { differences.push(`${op.name} [CN S${index + 1}] missing skill ${s.skillId}`); return; }
        const skill = op.skills?.skillList?.[index];
        skillRows(skills[s.skillId]).forEach((r: any, level: number) => {
          compare(`S${index + 1} level ${level + 1}`, [r.description], [skill?.levels?.[level]?.description ?? ''], skill?.techniques, [raw.skills?.skillList?.[index]?.levels?.[level]?.description]);
        });
      });
    }
    // Some editorial modules predate stable IDs. Resolve a code only among this operator's
    // official modules, and only if the match is unique. Never substitute for an invalid ID.
    const matched = new Set<string>();
    for (const m of candidates) {
      const code = m.name?.split(':')[0].trim().toLowerCase().replace('α', 'a').replace('δ', 'd');
      const matching = ids.filter(id => m.moduleId ? id === m.moduleId : equip.equipDict[id]?.typeIcon?.toLowerCase() === code);
      if (matching.length !== 1 || matched.has(matching[0])) {
        differences.push(`${op.name} [CN ${m.moduleId ?? m.name}] cannot uniquely match an owned upgrade module`); continue;
      }
      const id = matching[0];
      matched.add(id);
      modules++;
      const mod = op.modules[raw.modules.indexOf(m)];
      const stages = moduleStages(equip.equipDict[id], battle[id], [], (item: string) => item);
      for (const i of [0, 2]) {
        const stage = `Stage ${i + 1}`;
        compare(`${id} ${stage}`, [stages[i]?.effectText ?? ''], [mod.stages?.find((s: any) => s.stage === stage)?.effectText ?? ''], [], [m.stages?.find((s: any) => s.stage === stage)?.effectText]);
      }
    }
    for (const id of ids) if (!matched.has(id)) differences.push(`${op.name} [CN ${id}] module missing from operator record`);
  }
  console.log(`Compared ${sources} CN sources covering ${operators} CN-only operators and ${modules} CN-only modules. ${translatedSources} sources had an exact translation and ${nativeSources} had independently recognized Chinese effects. ${structuralOnly} sources had no mapped technique evidence.`);
}
