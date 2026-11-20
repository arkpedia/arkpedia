import type { Operator } from './operatorTypes';
import { parseModuleStatBonuses } from './operatorStats';

export type RosterCombatStat = 'block' | 'redeploy';
export type RosterCombatBonus = Partial<Record<'skill' | 'talent' | 'module', number>>;
export type RosterCombatBonuses = Partial<Record<RosterCombatStat, RosterCombatBonus>>;

type OperatorCombatData = Pick<Operator, 'internalName' | 'skills' | 'talents' | 'modules'>;

// Skill and talent text can describe allies or summons. Review the ability's
// target by game ID and slot, then read the amount from the current game record.
const SELF_BLOCK_SKILLS: Record<string, readonly number[]> = {
  char_150_snakek: [2], // Cuora
  char_491_humus: [2], // Humus
  char_484_robrta: [2], // Roberta
  char_422_aurora: [1], // Aurora
  char_220_grani: [2], // Grani
  char_455_nothin: [1, 2], // Mr. Nothing
  char_163_hpsts: [1], // Vulcan
  char_4183_mortis: [1], // Wakaba Mutsumi
  char_265_sophia: [2], // Whislash
  char_222_bpipe: [3], // Bagpipe
  char_416_zumama: [3], // Eunectes
  char_1032_excu2: [2], // Executor the Ex Foedere
  char_420_flamtl: [3], // Flametail
  char_1026_gvial2: [3], // Gavial the Invincible
  char_4088_hodrer: [2], // Hoederer
  char_4179_monstr: [3], // Mon3tr
  char_264_f12yin: [2], // Mountain
  char_2014_nian: [2], // Nian's S3 buffs other operators
  char_485_pallas: [3], // Pallas gains it when no melee ally is ahead
  char_2025_shu: [2], // Shu
  char_4235_thumpy: [3], // Thumpy
  char_4145_ulpia: [2], // Ulpianus
  char_4098_vvana: [2], // Viviana
  char_2026_yu: [2], // Yu
  char_4121_zuole: [2], // Zuo Le
};

const SELF_REDEPLOY_TALENT: Record<string, number> = {
  char_502_nblade: 1, // Yato
  char_159_peacok: 1, // Conviction
  char_365_aprl: 1, // April
  char_172_svrash: 1, // SilverAsh's squad talent includes himself
  char_1045_svash2: 1, // SilverAsh the Reignfrost
  char_263_skadi: 2, // Skadi
  char_1048_orchd2: 2, // Violet Mizutsune Orchid
};

const MODULE_BLOCK_EFFECTS = new Set([
  'uniequip_003_ulpia', // Ulpianus after reaching nine stacks
]);

const MODULE_REDEPLOY_EFFECTS: Record<string, 'talent' | 'additional' | 'stack'> = {
  uniequip_002_peacok: 'talent', // Conviction
  uniequip_002_aprl: 'talent', // April
  uniequip_002_svash2: 'talent', // SilverAsh the Reignfrost
  uniequip_003_skadi: 'talent', // Skadi
  uniequip_002_orchd2: 'talent', // Violet Mizutsune Orchid
  uniequip_002_wildmn: 'additional', // Wild Mane
  uniequip_002_svrash: 'stack', // SilverAsh gains another 10% on top of Leader
  uniequip_003_texas2: 'additional', // Texas the Omertosa after defeating an enemy
};

function blockIncrease(description: string | null | undefined) {
  return Number(description?.match(/(?:\bBlock(?:\s+count)?|阻挡数)\s*\+\s*(\d+)/i)?.[1] ?? 0);
}

function redeployReduction(description: string | null | undefined, base: number) {
  if (!description) return 0;
  const match = description.match(/(?:Redeployment\s+Time|再部署时间)\s*[−-]\s*(\d+(?:\.\d+)?)\s*(%?)/i)
    ?? description.match(/[−-]\s*(\d+(?:\.\d+)?)(%)\s*(?:(?:to\s+)?next\s+)?Redeployment\s+Time/i);
  if (!match) return 0;
  const amount = Number(match[1]);
  return match[2] === '%' ? base * amount / 100 : amount;
}

export function rosterCombatBonuses(operator: OperatorCombatData, baseRedeploy: number | undefined): RosterCombatBonuses | null {
  const id = operator.internalName ?? '';
  const skills = Array.isArray(operator.skills) ? operator.skills : operator.skills?.skillList ?? [];
  const skillBlock = Math.max(0, ...(SELF_BLOCK_SKILLS[id] ?? []).map(slot =>
    blockIncrease(skills[slot - 1]?.levels?.at(-1)?.description)));
  const talent = operator.talents?.[SELF_REDEPLOY_TALENT[id] - 1];
  const talentDescription = talent?.rows.filter(row => !row.potential).at(-1)?.description;
  const talentReduction = baseRedeploy === undefined ? 0 : redeployReduction(talentDescription, baseRedeploy);

  let moduleBlock = 0;
  let moduleReduction = 0;
  for (const equipment of operator.modules ?? []) {
    // Mode-only equipment is unavailable on standard stages.
    if (equipment.type !== 'Upgrade' || /^(?:ISW|RA|SO)-/i.test(equipment.name ?? '')) continue;
    const moduleId = equipment.moduleId ?? '';
    const effect = MODULE_REDEPLOY_EFFECTS[moduleId];
    for (const stage of equipment.stages) {
      const attributes = stage.attributesIncreased?.replace(/\bRedeployment time\b/gi, 'Rdp.');
      const direct = parseModuleStatBonuses(attributes);
      const bonus = MODULE_BLOCK_EFFECTS.has(moduleId) ? blockIncrease(stage.effectText) : 0;
      moduleBlock = Math.max(moduleBlock, (direct.block ?? 0) + bonus);
      if (baseRedeploy === undefined) continue;

      // In SilverAsh’s module, Leader is already in the talent column.
      const description = effect === 'stack' ? stage.effectText?.split('gain an additional')[1] : stage.effectText;
      const improvement = effect ? redeployReduction(description, baseRedeploy) : 0;
      const extra = effect === 'talent' ? Math.max(0, improvement - talentReduction) : improvement;
      moduleReduction = Math.max(moduleReduction, -(direct.redeploy ?? 0) + extra);
    }
  }

  if (!skillBlock && !moduleBlock && !talentReduction && !moduleReduction) return null;
  return {
    ...(skillBlock || moduleBlock ? { block: { ...(skillBlock && { skill: skillBlock }), ...(moduleBlock && { module: moduleBlock }) } } : {}),
    ...(talentReduction || moduleReduction ? { redeploy: {
      ...(talentReduction && { talent: -talentReduction }),
      ...(moduleReduction && { module: -moduleReduction }),
    } } : {}),
  };
}
