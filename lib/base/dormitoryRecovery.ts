import type { BaseRosters } from './baseGroupRosters';
export interface DormRecoveryProvider {
  name: string; selfBonus: number; allOperatorsBonus: number; allOthersBonus: number;
  singleTargetBonus: number; targetIfSelected: string | null; exclusiveRecovery?: number;
  conditionalGroupBonus?: { below: number; amount: number };
  distributedBonus?: { recipients: string[]; amount: number };
}
/** One snapshot: group and single-target effects each keep their strongest source.
 * Recipient-specific bonuses join their provider before it competes with other sources. */
export function dormitoryRecoveryRates(providers: DormRecoveryProvider[], base: number, rosters: BaseRosters, morale: Readonly<Record<string, number>>, morganActive: boolean, ccAll = 0, ccElite = 0) {
  let single: { target: string; amount: number } | undefined;
  for (const p of providers) {
    const distributedSingle = p.distributedBonus?.recipients.length === 1 ? p.distributedBonus : undefined;
    const target = distributedSingle?.recipients[0] ?? p.targetIfSelected;
    const amount = distributedSingle?.amount ?? p.singleTargetBonus;
    if (target && (!single || amount > single.amount)) single = { target, amount };
  }
  return providers.map(recipient => {
    if (recipient.exclusiveRecovery !== undefined) return { name: recipient.name, base: 0, bonus: recipient.exclusiveRecovery };
    const group = Math.max(0, ...providers.map(p => Math.max(
      p.allOperatorsBonus
        + (p.conditionalGroupBonus && (morale[recipient.name] ?? 0) < p.conditionalGroupBonus.below ? p.conditionalGroupBonus.amount : 0)
        + (p.name === 'Senshi' && rosters.LAIOS_PARTY.has(recipient.name) ? 0.15 : 0)
        + (p.name === 'Siege' && morganActive && rosters.GLASGOW.has(recipient.name) ? 0.3 : 0),
      p.name !== recipient.name ? p.allOthersBonus : 0,
      p.distributedBonus && p.distributedBonus.recipients.length > 1 && p.distributedBonus.recipients.includes(recipient.name) ? p.distributedBonus.amount : 0
    )));
    return { name: recipient.name, base, bonus: recipient.selfBonus + group + (single?.target === recipient.name ? single.amount : 0) + ccAll + (rosters.ELITE_OPERATOR.has(recipient.name) ? ccElite : 0) };
  });
}
