import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { interpolateBlackboard, stripRichText } from '../lib/gametext.mjs';

const hasChinese = text => typeof text === 'string' && /\p{Script=Han}/u.test(text);
const isEnglish = text => typeof text === 'string' && /[A-Za-z]/.test(text) && !hasChinese(text);

const RECOVERY = {
  INCREASE_WITH_TIME: 'Auto Recovery',
  INCREASE_WHEN_ATTACK: 'Offensive Recovery',
  INCREASE_WHEN_TAKEN_DAMAGE: 'Defensive Recovery',
  ON_DEPLOY: 'Deployment Recovery',
};
const ACTIVATION = { MANUAL: 'Manual', AUTO: 'Auto', PASSIVE: 'Passive' };
const ROOM = {
  CONTROL: 'Control Center', DORMITORY: 'Dormitory', HIRE: 'Office', MANUFACTURE: 'Factory',
  MEETING: 'Reception Room', POWER: 'Power Plant', TRADING: 'Trading Post',
  TRAINING: 'Training Room', WORKSHOP: 'Workshop',
};
const PHASE = { PHASE_0: 'Base', PHASE_1: 'Elite 1', PHASE_2: 'Elite 2' };

const costList = (entries, items) => (Array.isArray(entries) ? entries : []).map(entry => ({
  name: items?.items?.[entry.id]?.name ?? `item ${entry.id}`,
  quantity: entry.count,
}));

function skillRows(skill) {
  return (skill.levels ?? []).map((level, index) => {
    const { text, missing } = interpolateBlackboard(level.description, level.blackboard);
    if (missing.length) throw new Error(`${skill.skillId} level ${index + 1} is missing ${missing.join(', ')}`);
    return {
      level: index < 7 ? index + 1 : null,
      mastery: index < 7 ? null : index - 6,
      description: text,
      initialSp: level.spData?.initSp ?? 0,
      spCost: level.spData?.spCost ?? 0,
      duration: level.duration != null && level.duration > 0 ? Math.round(level.duration) : null,
    };
  });
}

function officialTalents(character) {
  return (character.talents ?? []).flatMap(talent => {
    let name = null;
    const rows = (talent.candidates ?? []).map(candidate => {
      name = candidate.name || name;
      const phase = Number(String(candidate.unlockCondition?.phase ?? '').replace('PHASE_', '')) || 0;
      return {
        stage: phase === 0 ? 'Base' : `Elite ${phase}`,
        potential: candidate.requiredPotentialRank ? `Potential ${candidate.requiredPotentialRank + 1}` : null,
        description: stripRichText(candidate.description),
      };
    });
    return name ? [{ name, rows }] : [];
  });
}

function officialBaseSkills(characterId, building) {
  const slots = building?.chars?.[characterId]?.buffChar ?? [];
  return slots.flatMap(slot => (Array.isArray(slot.buffData) ? slot.buffData : [])).map(entry => {
    const buff = building.buffs?.[entry.buffId];
    if (!buff) throw new Error(`${characterId} base skill ${entry.buffId} is missing`);
    return {
      name: buff.buffName,
      facility: ROOM[buff.roomType] ?? buff.roomType,
      eliteLevel: PHASE[entry.cond?.phase] ?? 'Base',
      description: stripRichText(buff.description),
    };
  });
}

function officialModules(characterId, modules, current) {
  const previous = new Map((current ?? []).map(module => [module.type, module]));
  return Object.values(modules?.equipDict ?? {})
    .filter(module => module.charId === characterId)
    .sort((a, b) => a.charEquipOrder - b.charEquipOrder)
    .map(module => {
      const type = module.type === 'INITIAL' ? 'Original' : 'Upgrade';
      const prefix = type === 'Original' ? '' : `${module.typeName1}-${module.typeName2}: `;
      const prior = previous.get(type) ?? {};
      const missions = (Array.isArray(module.missionList) ? module.missionList : [])
        .map(id => modules.missionList?.[id]?.desc).filter(Boolean);
      return {
        ...prior,
        type,
        name: `${prefix}${module.uniEquipName}`,
        ...(missions.length ? { mission: { requirement1: missions[0] ?? '', requirement2: missions[1] ?? '' } } : {}),
      };
    });
}

function needsReleasedGlobalSync(operator) {
  return hasChinese(operator.review?.official)
    || (operator.files ?? []).some(file => hasChinese(file.description))
    || (operator.voiceData?.lines ?? []).some(line => hasChinese(line.title) || hasChinese(line.text));
}

export function localizeReleasedMechanics(operator, tables) {
  if (!needsReleasedGlobalSync(operator)) return operator;
  const character = tables?.characters?.[operator.internalName];
  if (!character || character.name !== operator.name) return operator;
  const next = structuredClone(operator);
  const previousSkills = next.skills?.skillList ?? [];
  next.trait = stripRichText(character.description);
  next.tags = character.tagList ?? next.tags;
  next.potential = {
    ...next.potential,
    levels: (character.potentialRanks ?? []).map((rank, index) => ({
      level: index + 2,
      benefit: stripRichText(rank.description),
    })),
  };
  next.talents = officialTalents(character);
  next.baseSkills = officialBaseSkills(operator.internalName, tables.building);
  next.modules = officialModules(operator.internalName, tables.modules, next.modules);
  next.skills = {
    ...next.skills,
    skillList: (character.skills ?? []).map((entry, index) => {
      const skill = tables.skills?.[entry.skillId];
      if (!skill) throw new Error(`${operator.name} is missing ${entry.skillId}`);
      const first = skill.levels?.[0] ?? {};
      const prior = previousSkills[index] ?? {};
      const masteries = entry.levelUpCostCond ?? [];
      return {
        ...prior,
        name: first.name,
        recoveryType: RECOVERY[first.spData?.spType] ?? null,
        activationType: ACTIVATION[first.skillType] ?? null,
        duration: first.duration > 0 ? `${Math.round(first.duration)} seconds` : null,
        levels: skillRows(skill),
        cost: {
          m1: costList(masteries[0]?.levelUpCost, tables.items),
          m2: costList(masteries[1]?.levelUpCost, tables.items),
          m3: costList(masteries[2]?.levelUpCost, tables.items),
        },
      };
    }),
    skillCost: Object.fromEntries((character.allSkillLvlup ?? []).map((step, index) => [
      String(index + 2), costList(step.lvlUpCost, tables.items),
    ])),
  };
  return next;
}

export function localizeOperator(operator, handbook) {
  if (!handbook || handbook.charID !== operator.internalName) return operator;
  // Multiple stories can be alternate-form or conditional archives. Do not
  // flatten them or assign another form's text to this operator.
  const sections = new Map((handbook.storyTextAudio ?? [])
    .filter(group => group.stories?.length === 1 && isEnglish(group.stories[0].storyText))
    .map(group => [group.storyTitle, group.stories[0].storyText]));
  const next = structuredClone(operator);
  const profile = sections.get('Profile');
  if (profile && (!next.review?.official || hasChinese(next.review.official))) {
    next.review = { ...next.review, official: profile };
  }
  for (const file of next.files ?? []) {
    const text = sections.get(file.section);
    if (text && hasChinese(file.description)) file.description = text;
  }
  return next;
}

export function syncOperatorEnglish(root, handbook, tables = null) {
  if (!handbook?.handbookDict || typeof handbook.handbookDict !== 'object') throw new Error('Invalid English handbook table');
  let changed = 0;
  for (const directory of fs.readdirSync(path.join(root, 'data')).filter(name => /^operators-\dstar$/.test(name))) {
    for (const file of fs.readdirSync(path.join(root, 'data', directory)).filter(name => name.endsWith('.json'))) {
      const at = path.join(root, 'data', directory, file);
      const operator = JSON.parse(fs.readFileSync(at, 'utf8'));
      const mechanics = tables ? localizeReleasedMechanics(operator, tables) : operator;
      const next = localizeOperator(mechanics, handbook.handbookDict[operator.internalName]);
      if (JSON.stringify(next) === JSON.stringify(operator)) continue;
      fs.writeFileSync(at, JSON.stringify(next, null, 2) + '\n');
      console.log(`English profile/archive text: ${operator.name}`);
      changed++;
    }
  }
  return changed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = process.env.ARKPEDIA_OPERATOR_ROOT || process.cwd();
  const excel = process.env.ARKPEDIA_EN || path.join(process.cwd(), '.cache/upstream/en-gamedata/en/gamedata');
  const table = process.env.ARKPEDIA_EN_HANDBOOK
    || path.join(excel, 'excel/handbook_info_table.json');
  const read = name => JSON.parse(fs.readFileSync(path.join(excel, 'excel', name), 'utf8'));
  const changed = syncOperatorEnglish(root, JSON.parse(fs.readFileSync(table, 'utf8')), {
    characters: read('character_table.json'),
    skills: read('skill_table.json'),
    building: read('building_data.json'),
    modules: read('uniequip_table.json'),
    items: read('item_table.json'),
  });
  console.log(`${changed} operator(s) gained published English profile/archive text.`);
}
