import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { interpolateBlackboard, stripRichText } from '../lib/gametext.mjs';
import { pinnedRef } from '../content/pin-upstream.mjs';
import { moduleStages } from './module-stages.mjs';

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

/*
 * A name as a key, without the typography the wiki import added: straight vs curly quotes,
 * "Pharmacology α" vs the game's "Pharmacology·α", case, full-width "？？？", and the scrape's
 * "…Replaces <older name>" tail. Measured 2026-10-03 against every record: all 42 skill and
 * all 174 base-skill name differences were typography, and the names are keys (icon
 * filenames, /base's slot table and handlers, technique lookups), so a record keeps its own
 * spelling of the game's name. A real rename (the wiki's "Symphaticus Simulation" for Doc's
 * "Sympathicus Simulation") takes the game's.
 */
export const nameKey = name => String(name ?? '').split('Replaces')[0]
  .replace(/[’‘＂"]/g, "'").replace(/？/g, '?').replace(/[·\s]+/g, ' ').trim().toLowerCase();
export const keepSpelling = (recorded, game) => (recorded && nameKey(recorded) === nameKey(game) ? recorded : game);
// A potential-upgraded talent's rank ("Tactical Configuration 2", "Medic Mastery II").
const withoutRank = key => key.replace(/\s+(?:vi|iv|iii|ii|i|v|[1-6])$/, '');

/*
 * The game's talents, each carrying what was written on the record's talents of the same name.
 * Matched by name (any of the talent's names at any Elite, rank aside), not position: the wiki
 * import split some talents per Elite (Manticore's "Hidden Killer - Medium" and "- Elite" are one
 * talent in the game), so positions drift, and position once dropped Manticore's technique.
 * A talent the game renamed outright falls back to the record's talent at its position, if no
 * other talent took that one by name.
 */
function officialTalents(character, current) {
  const previous = rows(current);
  const talents = rows(character.talents);
  const keysOf = talent => new Set(rows(talent.candidates).map(c => c.name).filter(Boolean).map(n => withoutRank(nameKey(n))));
  const byName = talents.map(talent => previous.filter(entry => keysOf(talent).has(withoutRank(nameKey(entry.name)))));
  const claimed = new Set(byName.flat());
  return talents.flatMap((talent, index) => {
    let name = null;
    const own = byName[index].length ? byName[index]
      : previous[index] && !claimed.has(previous[index]) ? [previous[index]] : [];
    const candidates = rows(talent.candidates).map(candidate => {
      name = candidate.name || name;
      const phase = Number(String(candidate.unlockCondition?.phase ?? '').replace('PHASE_', '')) || 0;
      return {
        name: candidate.name || name,
        stage: phase === 0 ? 'Base' : `Elite ${phase}`,
        potential: candidate.requiredPotentialRank ? `Potential ${candidate.requiredPotentialRank + 1}` : null,
        description: stripRichText(candidate.description),
      };
    });
    if (!name) return [];
    /* A talent whose name changes along the way names each row: by Elite (Manticore's "Hidden
       Killer - Medium", then "- Elite") or by potential, where the talent itself is then the
       name without the rank (Castle-3's "Tactical Configuration 1" to "6" are one talent,
       "Tactical Configuration"). A talent with one name keeps rows without one. */
    const names = [...new Set(candidates.map(row => row.name))];
    for (const row of candidates) if (names.length < 2) delete row.name;
    const ranked = names.length > 1 && new Set(names.map(n => withoutRank(nameKey(n)))).size === 1;
    if (ranked) name = name.replace(/\s+(?:VI|IV|III|II|I|V|[1-6])$/, '');
    const techniques = own.flatMap(entry => rows(entry.technique));
    const merged = Object.assign({}, ...own);
    delete merged.technique;
    // Without the import's "…Replaces <older>" tail: the game's talent is the whole chain now,
    // and no file or lookup is named after a talent (base skills keep theirs: icon filenames).
    const recorded = own.find(entry => nameKey(entry.name) === nameKey(name))?.name?.split('Replaces')[0].trim();
    return [{
      ...merged,
      name: keepSpelling(recorded, name),
      rows: candidates,
      ...(techniques.length ? { technique: techniques.filter((t, i) => techniques.findIndex(o => o.name === t.name) === i) } : {}),
    }];
  });
}

/*
 * The game's base skills with their place in it: `slot` is the entry of buffChar the skill
 * belongs to (same slot = a later skill replaces an earlier one), `phase` and `level` what
 * unlocks it. /base reads these first (pages/base.tsx), so the record says outright what
 * data/base-skill-slots.json, a table nothing regenerates, said only for operators it knew.
 */
function officialBaseSkills(characterId, building, current) {
  const previous = rows(current);
  const slots = rows(building?.chars?.[characterId]?.buffChar);
  return slots.flatMap((slot, slotIndex) => rows(slot.buffData).map(entry => ({ entry, slotIndex }))).map(({ entry, slotIndex }, index) => {
    const buff = building.buffs?.[entry.buffId];
    if (!buff) throw new Error(`${characterId} base skill ${entry.buffId} is missing`);
    const facility = ROOM[buff.roomType] ?? buff.roomType;
    const phase = Number(String(entry.cond?.phase ?? 'PHASE_0').replace('PHASE_', '')) || 0;
    const level = entry.cond?.level ?? 1;
    const prior = previous.find(p => p.facility === facility && nameKey(p.name) === nameKey(buff.buffName))
      ?? (previous[index]?.facility === facility ? previous[index] : {});
    return {
      ...prior,
      name: keepSpelling(prior.name, buff.buffName),
      facility,
      // 1★/2★ operators and Durin unlock a skill at a level, not a promotion: "Level 30".
      eliteLevel: phase === 0 && level > 1 ? `Level ${level}` : PHASE[`PHASE_${phase}`],
      description: stripRichText(buff.description),
      slot: slotIndex,
      phase,
      level,
    };
  });
}

/**
 * The operator's modules from uniequip_table, each Upgrade's stages built from battle_equip_table
 * (module-stages.mjs). battleEquip, talentNames and items are required: stages kept from a record
 * instead of rebuilt are the wiki's words, which is what this refresh exists to replace.
 */
export function officialModules(characterId, modules, current, battleEquip, talentNames, items) {
  if (!battleEquip || typeof battleEquip !== 'object') throw new Error('officialModules needs battle_equip_table');
  const previous = rows(current);
  const matched = new Set();
  const normalizeCode = value => String(value ?? '').replace(/α/gi, 'A').replace(/β/gi, 'B').replace(/δ/gi, 'D').replace(/[^a-z0-9]/gi, '').toLowerCase();
  // charEquip is the per-character list. equipDict's charId is not: Amiya's Guard and Medic
  // modules carry char_002_amiya too, so filtering on it handed the Caster all six.
  const own = Array.isArray(modules?.charEquip?.[characterId]) ? new Set(modules.charEquip[characterId]) : null;
  const updated = Object.values(modules?.equipDict ?? {})
    .filter(module => (own ? own.has(module.uniEquipId) : module.charId === characterId))
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
      const battle = type === 'Upgrade' ? battleEquip[module.uniEquipId] : null;
      return {
        ...prior,
        type,
        moduleId: module.uniEquipId,
        name: `${prefix}${module.uniEquipName}`,
        ...(battle ? { stages: moduleStages(module, battle, talentNames, id => items?.items?.[id]?.name ?? `item ${id}`) } : {}),
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
  next.baseSkills = officialBaseSkills(operator.internalName, tables.building, next.baseSkills);
  next.modules = refreshModules(next, tables).modules;
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
        name: keepSpelling(prior.name, first.name),
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

/** Only the modules of a released operator, rebuilt from the game's tables. */
export function refreshModules(operator, tables) {
  const character = tables?.characters?.[operator.internalName];
  if (!character || character.name !== operator.name) return operator;
  const talentNames = rows(character.talents).flatMap(talent => rows(talent.candidates).map(candidate => candidate.name)).filter(Boolean);
  return { ...operator, modules: officialModules(operator.internalName, tables.modules, operator.modules, tables.battleEquip, talentNames, tables.items) };
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
  // Now only decides voice credits (syncOperatorEnglish rebuilds everything else for every
  // operator): a recent release, or a record still carrying untranslated text, takes the
  // game's credits; an older one keeps what the records add to them.
  if (hasChinese(operator.review?.official)
    || (operator.files ?? []).some(file => hasChinese(file.description))) return true;
  const match = String(operator.characterInfo?.['Release Date'] ?? '').match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (!match) return false;
  const release = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const age = now - release;
  return age >= 0 && age <= windowDays * 24 * 60 * 60 * 1000;
}

/* What people wrote on a record, which no table holds. A refresh that loses any of it is a bug
   (a talent list that changed length once dropped Manticore's talent technique). */
export function handWrittenFields(operator) {
  return JSON.stringify({
    review: [operator.review?.editor ?? null, operator.review?.rating ?? null],
    skills: rows(operator.skills?.skillList).map(skill => [skill.techniques ?? null, skill.recommendation ?? null, skill.pairings ?? null, skill.icon ?? null]),
    // By technique, not by talent: merging the import's per-Elite talents moves a technique
    // between entries without losing it.
    talents: [...new Set(rows(operator.talents).flatMap(talent => rows(talent.technique).map(t => JSON.stringify(t))))].sort(),
    baseSkillIcons: rows(operator.baseSkills).map(skill => skill.icon).filter(Boolean).sort(),
    topLevel: [operator.synergies ?? null, operator.techniques ?? null, operator.guides ?? null],
  });
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
      // Every released operator is rebuilt from the game's tables on every run, mechanics and
      // archive text alike: a record kept as it was is the wiki import's text, and the game's is
      // the source (2026-10-03). Names stay keys (keepSpelling), talents match by name, and the
      // guard below refuses to lose anything written by hand.
      const rebuilt = localizeOperator(tables ? localizeReleasedMechanics(operator, tables) : operator, handbook.handbookDict[operator.internalName]);
      // Except voice credits, outside the recent-release window: the records carry what the EN
      // table does not (the actor's own name beside the EN credit, the dialect where the game says
      // "Regional Chinese", languages the table lacks), so the game's list would drop it.
      const next = shouldRefresh || !operator.characterVoices ? rebuilt : { ...rebuilt, characterVoices: operator.characterVoices };
      if (JSON.stringify(next) === JSON.stringify(operator)) continue;
      if (handWrittenFields(next) !== handWrittenFields(operator)) {
        throw new Error(`${operator.name}: the refresh would lose or move hand-written techniques or recommendations`);
      }
      fs.writeFileSync(at, JSON.stringify(next, null, 2) + '\n');
      console.log(`Global operator data: ${operator.name}`);
      changed++;
    }
  }
  return changed;
}

async function main() {
  const root = process.env.ARKPEDIA_OPERATOR_ROOT || process.cwd();
  /* The nightly runs this before the catalogue stage, so a skill whose name it changes gets its
     icon in the same run's media plan (sync-catalogue.mjs assetPlan publishes every icon path a
     record implies that is not published yet). That is before refresh-stage-data.sh checks out
     the EN tables, so it reads them the way the catalogue does: the run's pinned commit of the
     Global mirror, cached in .cache/catalogue, where the catalogue then finds them. ARKPEDIA_EN
     points at a local checkout instead. */
  const pinned = process.env.ARKPEDIA_EN ? null : await (await import('./sync-catalogue.mjs'))
    .source('ArknightsAssets/ArknightsGamedata', 'en/gamedata/excel', path.join(process.cwd(), '.cache/catalogue'));
  const excel = process.env.ARKPEDIA_EN;
  const fileOf = { 'character_table.json': 'characters', 'skill_table.json': 'skills', 'building_data.json': 'building',
    'uniequip_table.json': 'modules', 'battle_equip_table.json': 'battleEquip', 'item_table.json': 'items',
    'charword_table.json': 'voices', 'handbook_info_table.json': 'handbook' };
  const read = name => (pinned ? pinned[fileOf[name]] : JSON.parse(fs.readFileSync(path.join(excel, 'excel', name), 'utf8')));
  const supplementalPath = process.env.ARKPEDIA_EN_SUPPLEMENTAL_CHARWORDS;
  const supplementalCharwords = supplementalPath
    ? JSON.parse(fs.readFileSync(supplementalPath, 'utf8'))
    : await (async () => {
      const response = await fetch(SUPPLEMENTAL_CHARWORDS);
      if (!response.ok) throw new Error(`Supplemental Global voice credits: ${response.status} ${response.statusText}`);
      return response.json();
    })();
  const handbook = process.env.ARKPEDIA_EN_HANDBOOK ? JSON.parse(fs.readFileSync(process.env.ARKPEDIA_EN_HANDBOOK, 'utf8')) : read('handbook_info_table.json');
  const changed = syncOperatorEnglish(root, handbook, {
    characters: read('character_table.json'),
    skills: read('skill_table.json'),
    building: read('building_data.json'),
    modules: read('uniequip_table.json'),
    battleEquip: read('battle_equip_table.json'),
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
