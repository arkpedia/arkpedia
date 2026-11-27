import { mitigate, type DamageType, type Target } from './calculator';
type Values = Record<string, number>;
export interface Effect {
  label: string;
  type: DamageType | 'Injury';
  amount: number;
  condition: string;
}
export function additionalEffects(
  id: string,
  slot: number,
  atk: number,
  skill: Values,
  first: Values,
  trait: Values,
  t: Target,
) {
  const rows: Effect[] = [];
  function add(label: string, type: Effect['type'], raw: number, condition: string) {
    if (!(raw > 0)) return;
    const amount = type === 'Injury' ? raw * Math.max(0.05, 1 - t.injuryRes / 100) : mitigate(raw, type, t);
    rows.push({ label, type, amount, condition });
  }
  switch (id) {
    case 'warmy':
    case 'blaze2':
      add('Talent hit', 'Elemental', atk * first.ep_damage_scale, 'Per Burn burst in talent range');
      break;
    case 'christ':
    case 'mantra':
      add('Talent hit', 'Elemental', atk * first.atk_scale, 'Per Paralysis trigger');
      break;
    case 'nymph':
      add(
        'Talent tick',
        'Elemental',
        atk * (slot === 2 ? skill.element_atk_scale : first.element_atk_scale),
        'Per second after hitting a target in Necrosis fallout',
      );
      break;
    case 'logos':
      add(
        'Lexical Evolution',
        'Elemental',
        atk * first.element_atk_scale,
        'Per talent proc against a target in Necrosis fallout',
      );
      break;
    case 'thorns':
      add(
        'Venom',
        'Elemental',
        (first['damage[normal]'] ?? 0) * first.ep_break_multi,
        'Per second against a melee enemy in Nervous Impairment fallout',
      );
      break;
    case 'mlyss':
      add(
        'Flowing Shape talent',
        'Elemental',
        atk * trait.atk_scale,
        'Per Corrosion burst in range with the module talent unlocked',
      );
      break;
    case 'clemnt':
      if (slot === 3)
        add(
          'Ammunition explosion',
          'Elemental',
          atk * skill.ep_damage_scale,
          'Per Corrosion burst with ammunition',
        );
      break;
    case 'thumpy':
      if (slot === 2)
        add(
          'Ally hit on glue',
          'Injury',
          atk * skill['ep_damage_ratio[damage]'],
          'Per other ally’s physical damage instance, unblocked',
        );
      break;
    case 'bobb':
      add(
        'First-contact talent',
        'Injury',
        atk *
          first['attack@ep_damage_ratio_talent'] *
          (t.tier === 'Grunt' ? 1 : (trait.ep_damage_scale ?? 1)),
        'Per second for the first-contact duration',
      );
      break;
  }
  return rows;
}
