import type { Target } from './calculator';

type Defenses = Pick<Target, 'def' | 'res'>;
export interface EnemyDefenseForm extends Defenses {
  id: string;
  name: string;
}

type Rule = {
  baseName: string;
  formName: string;
  def?: { key: string; mode: 'flat' | 'percent' | 'replace' };
  res?: { key: string; mode: 'flat' | 'percent' | 'replace' };
  startsInForm?: boolean;
  note?: string;
};

// The per-enemy talent blackboard supplies the coefficients. Each rule records
// the effect's verified scope and stacking mode, which the blackboard omits.
const overload: Rule = {
  baseName: 'Normal', formName: 'Overload',
  def: { key: 'over_energy.def', mode: 'percent' },
  res: { key: 'over_energy.magic_resistance', mode: 'flat' },
};
const rockbreaker: Rule = {
  baseName: 'Unblocked', formName: 'Blocked',
  res: { key: 'MagicResistance.magic_resistance', mode: 'flat' },
};
const colossus: Rule = {
  baseName: 'Normal', formName: 'Realigned Flux',
  def: { key: 'Weak.def', mode: 'flat' },
  res: { key: 'Weak.magic_resistance', mode: 'flat' },
};
const prisoner: Rule = {
  baseName: 'Liberated', formName: 'Imprisoned', startsInForm: true,
  def: { key: 'confinement.def', mode: 'flat' },
};
const greytail: Rule = {
  baseName: 'Barrier broken', formName: 'Barrier active', startsInForm: true,
  def: { key: 'shield.def', mode: 'flat' },
  note: 'DEF includes the barrier bonus. The chart omits damage absorbed by the barrier.',
};
const alistair: Rule = {
  baseName: 'Above half HP', formName: 'Half HP or lower',
  def: { key: 'advance.def', mode: 'percent' },
  res: { key: 'advance.magic_resistance', mode: 'flat' },
  note: 'The chart omits damage reduction from Imperial Domain.',
};
const tiacauh: Rule = {
  baseName: 'Unblocked', formName: 'Blocked',
  def: { key: 'Def.def', mode: 'flat' },
};
const strongman: Rule = {
  baseName: 'Imprisoned', formName: 'Liberated',
  res: { key: 'liberty.magic_resistance', mode: 'flat' },
  note: 'The chart omits HP recovery after liberation.',
};
const frostdillo: Rule = {
  baseName: 'Normal', formName: 'After high-ground collision',
  def: { key: 'weak.def', mode: 'replace' },
  res: { key: 'weak.magic_resistance', mode: 'replace' },
};
const scrapAssembler: Rule = {
  baseName: 'Armor intact', formName: 'After landing',
  def: { key: 'Armor.def', mode: 'flat' },
};
const brandguider: Rule = {
  baseName: 'Above half HP', formName: 'Below half HP',
  def: { key: 'Buff.def', mode: 'percent' },
};
const witherDevourer: Rule = {
  baseName: 'Before devouring', formName: 'After devouring',
  def: { key: 'Stronger.def', mode: 'flat' },
};
const roarKnight: Rule = {
  baseName: 'Buff expired', formName: 'Opening buff active', startsInForm: true,
  def: { key: 'buff.def', mode: 'flat' },
  res: { key: 'buff.magic_resistance', mode: 'flat' },
};
const rules: Record<string, Rule> = {
  enemy_10142_xdturt: frostdillo,
  enemy_10142_xdturt_2: frostdillo,
  enemy_1048_hirman: rockbreaker,
  enemy_1048_hirman_2: rockbreaker,
  enemy_1060_emouse: greytail,
  enemy_1060_emouse_2: greytail,
  enemy_1093_ccsbr: tiacauh,
  enemy_1093_ccsbr_2: tiacauh,
  enemy_1096_ccwitch: tiacauh,
  enemy_1096_ccwitch_2: tiacauh,
  enemy_1101_plkght: roarKnight,
  enemy_1101_plkght_2: roarKnight,
  enemy_1101_plkght_3: roarKnight,
  enemy_1119_vofsd: strongman,
  enemy_1119_vofsd_2: strongman,
  enemy_1120_vofwiz: prisoner,
  enemy_1120_vofwiz_2: prisoner,
  enemy_1121_lifbos: prisoner,
  enemy_1121_lifbos_2: prisoner,
  enemy_1232_dssalr: brandguider,
  enemy_1232_dssalr_2: brandguider,
  enemy_1232_dssalr_4: brandguider,
  enemy_1240_ltgint: colossus,
  enemy_1240_ltgint_2: colossus,
  enemy_1271_nhkodo: witherDevourer,
  enemy_1271_nhkodo_2: witherDevourer,
  enemy_1353_esabr: overload,
  enemy_1353_esabr_2: overload,
  enemy_1354_eghost: overload,
  enemy_1354_eghost_2: overload,
  enemy_1356_egun: overload,
  enemy_1356_egun_2: overload,
  enemy_1357_erob: overload,
  enemy_1357_erob_2: overload,
  enemy_1358_esheld: overload,
  enemy_1358_esheld_2: overload,
  enemy_1359_ekulsr: overload,
  enemy_1359_ekulsr_2: overload,
  enemy_1412_mmjump: scrapAssembler,
  enemy_1412_mmjump_2: scrapAssembler,
  enemy_1503_talula: {
    baseName: 'Above half HP', formName: 'Below half HP',
    def: { key: 'halfhp.def', mode: 'percent' },
    res: { key: 'halfhp.magic_resistance', mode: 'percent' },
  },
  enemy_1509_mousek: {
    ...greytail,
    def: { key: 'defup.def', mode: 'flat' },
  },
  enemy_1512_mcmstr: {
    baseName: 'First form', formName: 'High Priest form',
    def: { key: 'bird_run.def', mode: 'replace' },
    res: { key: 'bird_run.magic_resistance', mode: 'replace' },
  },
  enemy_1514_smephi: {
    baseName: 'Activated', formName: 'Dormant',
    def: { key: 'shield.def', mode: 'flat' },
    res: { key: 'shield.magic_resistance', mode: 'flat' },
    note: 'The chart omits HP recovery while dormant.',
  },
  enemy_1530_white: {
    baseName: 'Second form', formName: 'First form', startsInForm: true,
    def: { key: 'P1_Passive.def', mode: 'flat' },
    res: { key: 'P1_Passive.magic_resistance', mode: 'flat' },
  },
  enemy_1533_stmkgt: {
    baseName: 'First form', formName: 'Second form',
    def: { key: 'reborn.def', mode: 'flat' },
    res: { key: 'reborn.magic_resistance', mode: 'flat' },
    note: 'The chart omits damage reduction and invulnerability from Steam Boost and takeoff.',
  },
  enemy_1554_lrtsia: {
    baseName: 'First form', formName: 'Second form',
    def: { key: 'PassiveP2.def', mode: 'flat' },
    res: { key: 'PassiveP2.magic_resistance', mode: 'flat' },
  },
  enemy_1559_vtlionk: alistair,
  enemy_9032_aclionk: alistair,
};

function modified(value: number, rule: Rule['def'], talents: ReadonlyMap<string, number>) {
  if (!rule) return value;
  const amount = talents.get(rule.key);
  if (amount === undefined) return undefined;
  if (rule.mode === 'replace') return amount;
  return rule.mode === 'percent' ? value * (1 + amount) : value + amount;
}

export function enemyDefenseForms(id: string, base: Defenses, talents: ReadonlyMap<string, number>) {
  if (id === 'enemy_1506_patrt') {
    const commandDef = talents.get('strength.def');
    const marchingDef = talents.get('shield.def');
    const marchingRes = talents.get('shield.magic_resistance');
    const ruinationDef = talents.get('immo_trigger[rage].def');
    if (commandDef === undefined || marchingDef === undefined || marchingRes === undefined || ruinationDef === undefined) return;
    return {
      forms: [
        { id: 'marching', name: 'Marching', def: (base.def + commandDef) * (1 + marchingDef), res: base.res * (1 + marchingRes) },
        { id: 'ruination', name: 'Ruination', def: base.def + ruinationDef, res: base.res },
      ],
      note: 'Ruination uses the defenses after its opening invulnerability.',
    };
  }

  const refraction = talents.get('refracting.magic_resistance') ?? talents.get('Refracting.magic_resistance');
  if (refraction !== undefined && refraction > 0) {
    if (id === 'enemy_1172_dugago' || id === 'enemy_1172_dugago_2') {
      const stoneDef = talents.get('stone.def');
      const stoneRes = talents.get('stone.magic_resistance');
      if (stoneDef === undefined || stoneRes === undefined) return;
      return { forms: [
        { id: 'ground', name: 'Ground', def: base.def, res: base.res + refraction },
        { id: 'statue', name: 'Statue', def: base.def + stoneDef, res: base.res + refraction + stoneRes },
        { id: 'flying', name: 'Flying', def: base.def, res: base.res + refraction },
        { id: 'ground-silenced', name: 'Ground (silenced)', ...base },
        { id: 'statue-silenced', name: 'Statue (silenced)', def: base.def + stoneDef, res: base.res + stoneRes },
        { id: 'flying-silenced', name: 'Flying (silenced)', ...base },
      ] };
    }
    return { forms: [
      { id: 'refraction', name: 'Refraction active', def: base.def, res: base.res + refraction },
      { id: 'silenced', name: 'Silenced', ...base },
    ] };
  }

  // The full and lite orchestra talents share the same two variations.
  for (const [prefix, suffix] of [['switchMode', ''], ['buff', '_lite']]) {
    const melancholic = talents.get(`${prefix}.enemy_act29side[buff_depressed${suffix}].def`);
    const passionate = talents.get(`${prefix}.enemy_act29side[buff_enthu${suffix}].def`);
    if (melancholic !== undefined && passionate !== undefined) {
      return {
        forms: [
          { id: 'melancholic', name: 'Melancholic variation', def: base.def * (1 + melancholic), res: base.res },
          { id: 'passionate', name: 'Passionate variation', def: base.def * (1 + passionate), res: base.res },
        ],
        note: 'Choose the variation active in your stage. The chart omits hit-count shields.',
      };
    }
  }

  if (id === 'enemy_10081_mpplai' || id === 'enemy_10081_mpplai_2') {
    const forms = [
      { id: 'physical', name: 'Physical-hit form', prefix: 'Mode_Fuchou_Passive' },
      { id: 'arts', name: 'Arts-hit form', prefix: 'Mode_Shushi_Passive' },
      { id: 'blocked', name: 'Blocked form', prefix: 'Mode_Youling_Passive' },
    ].flatMap(({ id, name, prefix }) => {
      const def = talents.get(prefix + '.def');
      const res = talents.get(prefix + '.magic_resistance');
      if (def === undefined || res === undefined) return [];
      return [{ id, name, def: base.def + def, res: base.res + res }];
    });
    return forms.length ? { forms, note: 'Starts immune to damage until it transforms. These are its damageable forms.' } : undefined;
  }

  const rule = rules[id];
  if (!rule) return;
  const def = modified(base.def, rule.def, talents);
  const res = modified(base.res, rule.res, talents);
  if (def === undefined || res === undefined) return;
  const normal = { id: 'normal', name: rule.baseName, def: base.def, res: base.res };
  const form = { id: 'modified', name: rule.formName, def, res };
  return {
    forms: rule.startsInForm ? [form, normal] : [normal, form],
    ...(rule.note && { note: rule.note }),
  };
}
