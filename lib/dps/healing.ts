import type { Build, Profile } from './calculator';

export interface HealingOutput {
  direct: { amount: number; interval: number; targets: number } | null;
  regeneration: number;
  conditional: { label: string; amount: number } | null;
  hps: number | null;
  note: string;
}

type Coefficients = Record<string, number>;

export const isHealingProfile = (p: Profile) => !!p.healingTrait || p.basicAttack === 'Healing' || ['physician', 'ringhealer'].includes(p.branch);

export function healingAtkBonus(
  build: Build,
  skill: Coefficients,
  secondTalent: Coefficients,
  moduleTrait: Coefficients,
) {
  if (build.operator === 'skadi2') {
    // The skill's ATK coefficient is Inspiration for allies. Only her talent and module raise her own ATK.
    const ally = build.abyssalAlly ? 2 : 1;
    return (secondTalent[`skadi2_e_003_t_2[atk][${ally}].atk`]
      ?? secondTalent[`skadi2_t_2[atk][${ally}].atk`] ?? 0)
      + (build.twoAlliesInRange ? moduleTrait.atk ?? 0 : 0);
  }
  if (build.operator === 'haruka' && build.skill === 2 && build.firstHealingCast)
    return skill['haruka_s_2[first].atk'] ?? 0;
  return skill.atk ?? 0;
}

export function healingOutput(
  build: Build,
  atk: number,
  interval: number,
  skill: Coefficients,
  firstTalent: Coefficients,
  secondTalent: Coefficients,
  moduleTrait: Coefficients,
): HealingOutput | null {
  const { character, operator } = build;
  const trait = { ...character.healingTrait, ...moduleTrait };
  let direct: HealingOutput['direct'] = null;
  let regeneration = 0;
  let conditional: HealingOutput['conditional'] = null;
  let note = '';

  if (operator === 'skadi2' && build.skill !== 3) {
    const key = 'attack@atk_to_hp_recovery_ratio';
    regeneration = atk * (skill[key] ?? trait[key] ?? 0);
    note = 'One ally in Skadi’s or her Seaborn’s range. Overlapping ranges share the same regeneration.';
  } else if (operator === 'haruka') {
    if (build.skill > 0) {
      direct = {
        amount: atk * trait.heal_scale,
        interval,
        targets: trait['attack@max_target_heal'] + (skill['attack@max_target_heal_add'] ?? 0),
      };
      if (build.skill === 2) note = (build.firstHealingCast ? 'First activation.' : 'Second activation onward. The skill stays active.')
        + ' The Arts hit after healing depends on HP actually restored.';
    }
    if (secondTalent.heal_scale > 0) {
      conditional = { amount: atk * secondTalent.heal_scale, label: 'Healing when a bubble pops' };
    }
  } else if (character.basicAttack === 'Healing' || character.branch === 'physician' || character.branch === 'ringhealer') {
    const talent = operator === 'susuro' && build.lowCostHealingTarget ? firstTalent.heal_scale ?? 1 : 1;
    const moduleMultiplier = operator === 'susuro' && build.healingTargetBelowHalf ? moduleTrait.heal_scale ?? 1 : 1;
    direct = {
      amount: atk * talent * moduleMultiplier,
      interval,
      targets: character.branch === 'ringhealer' ? (moduleTrait['attack@max_target'] ?? 3) : 1,
    };
    if (operator === 'flower') regeneration = atk * (firstTalent.atk_to_hp_recovery_ratio ?? 0);
  }

  if (!direct && !regeneration && !conditional) return null;
  return {
    direct,
    regeneration,
    conditional,
    hps: direct || regeneration > 0 ? (direct ? direct.amount / direct.interval : 0) + regeneration : null,
    note,
  };
}
