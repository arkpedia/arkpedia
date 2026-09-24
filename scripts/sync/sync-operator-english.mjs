import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { interpolateBlackboard, stripRichText } from '../lib/gametext.mjs';
import { pinnedRef } from '../content/pin-upstream.mjs';

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
const VOICE_LANGUAGE = {
  EN: 'English', JP: 'Japanese', KR: 'Korean', CN_MANDARIN: 'Chinese',
  CN_TOPOLECT: 'Regional Chinese', ITA: 'Italian', GER: 'German', RUS: 'Russian',
  FRE: 'French', 11: 'Spanish', LINKAGE: 'English',
};
// Only when ARKPEDIA_EN_SUPPLEMENTAL_CHARWORDS is unset; at the commit this run pinned, else the branch.
const SUPPLEMENTAL_CHARWORDS = `https://raw.githubusercontent.com/PuppiizSunniiz/ArknightsGameData_YoStar/${pinnedRef('PuppiizSunniiz/ArknightsGameData_YoStar')}/en_US/gamedata/excel/charword_table.json`;
const rows = value => Array.isArray(value) ? value : [];

const costList = (entries, items) => (Array.isArray(entries) ? entries : []).map(entry => ({
  name: items?.items?.[entry.id]?.name ?? `item ${entry.id}`,
  quantity: entry.count,
}));

function skillRows(skill) {
  return rows(skill.levels).map((level, index) => {
    const blackboard = rows(level.blackboard);
    const values = level.duration == null || blackboard.some(entry => String(entry?.key).toLowerCase() === 'duration')
      ? blackboard
      : [...blackboard, { key: 'duration', value: level.duration }];
    const { text, missing } = interpolateBlackboard(level.description, values);
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

function officialTalents(character, current) {
  const previous = rows(current);
  return rows(character.talents).flatMap((talent, index) => {
    let name = null;
    const candidates = rows(talent.candidates).map(candidate => {
      name = candidate.name || name;
      const phase = Number(String(candidate.unlockCondition?.phase ?? '').replace('PHASE_', '')) || 0;
      return {
        stage: phase === 0 ? 'Base' : `Elite ${phase}`,
        potential: candidate.requiredPotentialRank ? `Potential ${candidate.requiredPotentialRank + 1}` : null,
        description: stripRichText(candidate.description),
      };
    });
    return name ? [{ ...previous[index], name, rows: candidates }] : [];
  });
}

function officialBaseSkills(characterId, building) {
  const slots = rows(building?.chars?.[characterId]?.buffChar);
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

export function officialModules(characterId, modules, current) {
  const previous = rows(current);
  const matched = new Set();
  const normalizeCode = value => String(value ?? '').replace(/α/gi, 'A').replace(/β/gi, 'B').replace(/δ/gi, 'D').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const updated = Object.values(modules?.equipDict ?? {})
    .filter(module => module.charId === characterId)
    .sort((a, b) => a.charEquipOrder - b.charEquipOrder)
    .map(module => {
      const type = module.type === 'INITIAL' ? 'Original' : 'Upgrade';
      const suffix = { A: 'α', B: 'β', D: 'Δ' }[module.typeName2] ?? module.typeName2;
      const code = `${module.typeName1}-${suffix}`;
      const prefix = type === 'Original' ? '' : `${code}: `;
      // Several upgrades share type=Upgrade. Never copy one module's stages,
      // costs or trait into another merely because they have the same type.
      const prior = previous.find(entry => entry.moduleId === module.uniEquipId)
        ?? previous.find(entry => entry.type === type && (type === 'Original'
          || normalizeCode(entry.name?.split(':')[0]) === normalizeCode(code)
          || entry.name?.split(':').slice(1).join(':').trim() === module.uniEquipName))
        ?? { stages: [] };
      matched.add(prior);
      const missions = (Array.isArray(module.missionList) ? module.missionList : [])
        .map(id => modules.missionList?.[id]?.desc).filter(Boolean);
      return {
        ...prior,
        type,
        moduleId: module.uniEquipId,
        name: `${prefix}${module.uniEquipName}`,
        ...(missions.length ? { mission: { requirement1: missions[0] ?? '', requirement2: missions[1] ?? '' } } : {}),
      };
    });
  // A Global refresh must not delete an independently recorded CN-only module.
  return [...updated, ...previous.filter(entry => !matched.has(entry))];
}

export function officialVoiceActors(characterId, tables, current = null) {
  const voices = {};
  for (const table of tables ?? []) {
    const entries = table?.voiceLangDict?.[characterId]?.dict;
    if (!entries || typeof entries !== 'object') continue;
    for (const [type, entry] of Object.entries(entries)) {
      const language = VOICE_LANGUAGE[type] ?? table.voiceLangTypeDict?.[type]?.name ?? type;
      const actors = (Array.isArray(entry?.cvName) ? entry.cvName : []).filter(name => typeof name === 'string' && name.trim());
      if (actors.length) voices[language] = actors.join(' / ');
    }
  }
  return Object.keys(voices).length ? voices : current;
}

export function localizeReleasedMechanics(operator, tables) {
  const character = tables?.characters?.[operator.internalName];
  if (!character || character.name !== operator.name) return operator;
  const next = structuredClone(operator);
  const previousSkills = next.skills?.skillList ?? [];
  const previousTalents = rows(next.talents);
  next.trait = stripRichText(character.description);
  next.tags = character.tagList ?? next.tags;
  next.potential = {
    ...next.potential,
    levels: rows(character.potentialRanks).map((rank, index) => ({
      level: index + 2,
      benefit: stripRichText(rank.description),
    })),
  };
  next.talents = officialTalents(character, next.talents);
  next.baseSkills = officialBaseSkills(operator.internalName, tables.building);
  next.modules = officialModules(operator.internalName, tables.modules, next.modules);
  next.characterVoices = officialVoiceActors(operator.internalName, tables.voiceTables, next.characterVoices);
  next.skills = {
    ...next.skills,
    skillList: rows(character.skills).map((entry, index) => {
      const skill = tables.skills?.[entry.skillId];
      if (!skill) throw new Error(`${operator.name} is missing ${entry.skillId}`);
      const first = skill.levels?.[0] ?? {};
      const prior = previousSkills[index] ?? {};
      const masteries = rows(entry.levelUpCostCond);
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
    skillCost: Object.fromEntries(rows(character.allSkillLvlup).map((step, index) => [
      String(index + 2), costList(step.lvlUpCost, tables.items),
    ])),
  };
  const nameChanges = [
    ...previousTalents.map((talent, index) => [talent.name, next.talents[index]?.name]),
    ...previousSkills.map((skill, index) => [skill.name, next.skills.skillList[index]?.name]),
  ].filter(([before, after]) => before && after && before !== after);
  next.promotion = rows(next.promotion).map(tier => ({
    ...tier,
    upgrades: rows(tier.upgrades).map(upgrade => nameChanges.reduce(
      (text, [before, after]) => text.replaceAll(before, after),
      upgrade,
    )),
  }));
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
  if (profile && next.review?.official !== profile) {
    next.review = { ...next.review, official: profile };
  }
  for (const file of next.files ?? []) {
    const text = sections.get(file.section);
    if (text && file.description !== text) file.description = text;
  }
  return next;
}

export function shouldRefreshReleasedOperator(operator, now = Date.now(), windowDays = 90) {
  // Global tables often settle over several post-patch updates. Recheck recent
  // releases daily, while leaving stable older records alone unless they still
  // contain untranslated text. A manual audit can opt into a full refresh.
  if (hasChinese(operator.review?.official)
    || (operator.files ?? []).some(file => hasChinese(file.description))) return true;
  const match = String(operator.characterInfo?.['Release Date'] ?? '').match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (!match) return false;
  const release = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const age = now - release;
  return age >= 0 && age <= windowDays * 24 * 60 * 60 * 1000;
}

export function syncOperatorEnglish(root, handbook, tables = null) {
  if (!handbook?.handbookDict || typeof handbook.handbookDict !== 'object') throw new Error('Invalid English handbook table');
  let changed = 0;
  const forcedIds = new Set(String(process.env.ARKPEDIA_OPERATOR_IDS ?? '').split(',').map(id => id.trim()).filter(Boolean));
  for (const directory of fs.readdirSync(path.join(root, 'data')).filter(name => /^operators-\dstar$/.test(name))) {
    for (const file of fs.readdirSync(path.join(root, 'data', directory)).filter(name => name.endsWith('.json'))) {
      const at = path.join(root, 'data', directory, file);
      const operator = JSON.parse(fs.readFileSync(at, 'utf8'));
      const shouldRefresh = process.env.ARKPEDIA_OPERATOR_REFRESH_ALL === '1'
        || forcedIds.has(operator.internalName)
        || shouldRefreshReleasedOperator(operator);
      if (!shouldRefresh) continue;
      const mechanics = tables ? localizeReleasedMechanics(operator, tables) : operator;
      const next = localizeOperator(mechanics, handbook.handbookDict[operator.internalName]);
      if (JSON.stringify(next) === JSON.stringify(operator)) continue;
      fs.writeFileSync(at, JSON.stringify(next, null, 2) + '\n');
      console.log(`Global operator data: ${operator.name}`);
      changed++;
    }
  }
  return changed;
}

async function main() {
  const root = process.env.ARKPEDIA_OPERATOR_ROOT || process.cwd();
  const excel = process.env.ARKPEDIA_EN || path.join(process.cwd(), '.cache/upstream/en-gamedata/en/gamedata');
  const table = process.env.ARKPEDIA_EN_HANDBOOK
    || path.join(excel, 'excel/handbook_info_table.json');
  const read = name => JSON.parse(fs.readFileSync(path.join(excel, 'excel', name), 'utf8'));
  const supplementalPath = process.env.ARKPEDIA_EN_SUPPLEMENTAL_CHARWORDS;
  const supplementalCharwords = supplementalPath
    ? JSON.parse(fs.readFileSync(supplementalPath, 'utf8'))
    : await (async () => {
      const response = await fetch(SUPPLEMENTAL_CHARWORDS);
      if (!response.ok) throw new Error(`Supplemental Global voice credits: ${response.status} ${response.statusText}`);
      return response.json();
    })();
  const changed = syncOperatorEnglish(root, JSON.parse(fs.readFileSync(table, 'utf8')), {
    characters: read('character_table.json'),
    skills: read('skill_table.json'),
    building: read('building_data.json'),
    modules: read('uniequip_table.json'),
    items: read('item_table.json'),
    voiceTables: [read('charword_table.json'), supplementalCharwords],
  });
  console.log(`${changed} operator record(s) refreshed from published Global data.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
