// node scripts/build/build-dps-profiles.mjs [path/to/en/gamedata/excel]
// With no local archive, fetch the EN tables at the repository's pinned revision.
import { readFile, writeFile } from 'node:fs/promises';

const read = async (path) => JSON.parse(await readFile(path, 'utf8'));
const repo = 'ArknightsAssets/ArknightsGamedata';
const { commit } = (await read('data/upstream.lock.json')).repositories[repo];
const source = 'https://raw.githubusercontent.com/' + repo + '/' + commit + '/en/gamedata/excel/';
const localEN = process.argv[2] === '--if-stale' ? undefined : process.argv[2];
async function readRegion(region, local) {
  return Promise.all(
    ['character', 'skill', 'battle_equip', 'uniequip'].map(async (name) => {
      const file = name + '_table.json';
      if (local) return read(local + '/' + file);
      const response = await fetch(source.replace('/en/', '/' + region + '/') + file);
      if (!response.ok) throw Error('Could not load ' + file + ' (' + response.status + ')');
      return response.json();
    }),
  );
}
async function generateProfiles() {
  const [en, cn] = await Promise.all([readRegion('en', localEN), readRegion('cn', process.argv[3])]);
  const [characters, skills, equipment] = [0, 1, 2].map((index) => ({ ...cn[index], ...en[index] }));
  const modules = { equipDict: { ...cn[3].equipDict, ...en[3].equipDict } };
  const supported = {
    char_1042_phatm2: [1, 2, 3],
    char_1044_hsgma2: [1, 3],
    char_4082_qiubai: [3],
    char_4169_caledo: [1, 2],
    char_4136_phonor: [],
    char_4187_graceb: [1, 2],
    char_4081_warmy: [1, 2],
    char_4198_christ: [1, 2],
    char_4148_philae: [2],
    char_4225_tanya: [2],
    char_4102_threye: [1, 2],
    char_487_bobb: [1, 2],
    char_4223_botany: [1, 2],
    char_249_mlyss: [1],
    char_134_ifrit: [1],
    char_4133_logos: [3],
    char_4046_ebnhlz: [2],
    char_4146_nymph: [1, 2, 3],
    char_1040_blaze2: [1, 2, 3],
    char_4204_mantra: [1, 2, 3],
    char_245_cello: [1],
    char_2026_yu: [1],
    char_4235_thumpy: [2, 3],
    char_293_thorns: [1],
    char_4098_vvana: [3],
    char_4247_oxi: [3],
    char_4231_clemnt: [2, 3],
    char_4214_cairn: [2],
    char_110_deepcl: [1],
    char_242_otter: [1, 2],
    char_336_folivo: [1, 2],
    char_4140_lasher: [1, 2],
    char_248_mgllan: [2, 3],
    char_2023_ling: [1, 2, 3],
    char_458_rfrost: [1, 2],
    char_4171_wulfen: [1, 2],
    char_4123_ela: [1, 2, 3],
    char_263_skadi: [2],
    char_4145_ulpia: [3],
    char_250_phatom: [3],
    char_4048_doroth: [1, 2, 3],
    char_451_robin: [1, 2],
    char_1045_svash2: [2],
    char_499_kaitou: [1, 2],
    char_002_amiya: [1, 3],
    char_208_melan: [1],
  };
  const rows = (value) => (Array.isArray(value) ? value : []);
  const board = (entries) => Object.fromEntries(entries.map(({ key, value }) => [key, value]));
  const elite = (phase) => Number(phase.slice(-1));
  function candidate(c) {
    return {
      elite: elite(c.unlockCondition.phase),
      level: c.unlockCondition.level,
      potential: c.requiredPotentialRank + 1,
      values: board(c.blackboard),
    };
  }
  // Review every playable kit and its tokens against CN terminology. Defensive
  // reception and healing also match the text, but cannot fill an enemy gauge.
  const defensiveOnly = new Set([
    'chnut',
    'chilc',
    'highmo',
    'mberry',
    'glider',
    'harold',
    'mortis',
    'agoat2',
  ]);
  const markers = /损伤|元素伤害|ba\.dt\.(?:apoptosis|neural|burning|erosion|rampage)2/;
  for (const [id, op] of Object.entries(cn[0])) {
    if (!id.startsWith('char_') || op.isNotObtainable) continue;
    const short = id.split('_').at(-1);
    const texts = [
      op.description,
      op.talents,
      ...rows(op.skills).map((skill) => cn[1][skill.skillId]?.levels.at(-1)?.description),
      ...Object.keys(cn[2])
        .filter((key) => cn[3].equipDict[key]?.charId === id)
        .map((key) => cn[2][key].phases),
      ...Object.entries(cn[0])
        .filter(([key]) => key.startsWith('token_') && key.includes('_' + short + '_'))
        .flatMap(([, token]) => [
          token.description,
          token.talents,
          ...rows(token.skills).map((skill) => cn[1][skill.skillId]?.levels.at(-1)?.description),
        ]),
    ];
    if (markers.test(JSON.stringify(texts)) && !supported[id] && !defensiveOnly.has(short))
      throw Error('Review new elemental operator or deployable before refreshing DPS profiles: ' + id);
  }
  // Older regional archives predate some of the reviewed kits. Build only kits present at this pin.
  const operators = Object.entries(supported).filter(([id]) => characters[id]).map(([id, slots]) => {
    const c = characters[id];
    const short = id.split('_').at(-1);
    const moduleNumber = { ifrit: '003', thorns: '003', ebnhlz: '004', mlyss: '004' }[short] ?? '002';
    const moduleId = 'uniequip_' + moduleNumber + '_' + short;
    function readModule(id) {
      const mod = modules.equipDict[id];
      return mod
        ? {
            name: mod.typeName1 + '-' + mod.typeName2,
            level: mod.unlockLevel,
            stages: equipment[id].phases.map((p) => ({
              stats: board(p.attributeBlackboard),
              tokenStats: Object.fromEntries(
                Object.entries(p.tokenAttributeBlackboard ?? {}).map(([id, bb]) => [id, board(bb)]),
              ),
              trait: board(
                p.parts.flatMap((part) => [
                  ...rows(part.overrideTraitDataBundle?.candidates?.[0]?.blackboard),
                  ...(part.addOrOverrideTalentDataBundle?.candidates?.[0]?.talentIndex < 0
                    ? rows(part.addOrOverrideTalentDataBundle.candidates[0].blackboard)
                    : []),
                ]),
              ),
              talents: Object.fromEntries(
                p.parts.flatMap((part) => {
                  const list = part.addOrOverrideTalentDataBundle?.candidates;
                  return list?.length
                    ? [[list[0].talentIndex, list.filter((x) => Array.isArray(x.blackboard)).map(candidate)]]
                    : [];
                }),
              ),
            })),
          }
        : null;
    }
    const tokenFor = (slot) => {
      if (c.subProfessionId !== 'summoner') return null;
      const key =
        c.skills[slot - 1].overrideTokenKey ??
        Object.keys(characters).find((k) => k.startsWith('token_') && k.includes('_' + short + '_'));
      const token = characters[key];
      if (!token) throw Error('Missing summon for ' + id);
      return {
        id: key,
        name: token.name,
        phases: token.phases.map((p) => ({
          maxLevel: p.maxLevel,
          start: p.attributesKeyFrames[0].data.atk,
          end: p.attributesKeyFrames.at(-1).data.atk,
          interval: p.attributesKeyFrames[0].data.baseAttackTime,
        })),
      };
    };
    return {
      id: short,
      name: { caledo: 'Caleido', thumpy: 'Thumpy', oxi: 'Talulah', clemnt: 'Clementia' }[short] ?? c.name,
      region: en[0][id] ? 'EN' : 'CN',
      branch: c.subProfessionId,
      rarity: Number(c.rarity.slice(-1)),
      trust: c.favorKeyFrames.at(-1).data.atk,
      phases: c.phases.map(({ maxLevel, attributesKeyFrames: frames }) => ({
        maxLevel,
        start: frames[0].data.atk,
        end: frames.at(-1).data.atk,
        interval: frames[0].data.baseAttackTime,
      })),
      potential: rows(c.potentialRanks).map((p) =>
        Object.fromEntries(
          (p.buff?.attributes?.attributeModifiers ?? []).map((m) => [m.attributeType, m.value]),
        ),
      ),
      talents: (c.talents ?? [])
        .filter((t) => t.candidates?.some((x) => Array.isArray(x.blackboard)))
        .map((t) => t.candidates.filter((x) => Array.isArray(x.blackboard)).map(candidate)),
      skills: slots.map((slot) => {
        const entry = c.skills[slot - 1];
        const levels = skills[entry.skillId].levels;
        return {
          slot,
          manual: levels[0].skillType === 'MANUAL' && levels[0].spData.spType === 'INCREASE_WITH_TIME',
          token: tokenFor(slot),
          name: levels[0].name,
          elite: elite(entry.unlockCond.phase),
          ranks: levels.map((r) => ({
            ...board(r.blackboard),
            sp: r.spData.spCost,
            initialSp: r.spData.initSp,
            duration: r.duration,
          })),
        };
      }),
      module: readModule(moduleId),
      alternateModule: ['skadi', 'phatom'].includes(short) ? readModule('uniequip_003_' + short) : null,
    };
  });
  await writeFile('config/dps-profiles.json', JSON.stringify({ source, operators }, null, 1) + '\n');
}

if (process.argv[2] !== '--if-stale' || (await read('config/dps-profiles.json')).source !== source) {
  await generateProfiles();
}
