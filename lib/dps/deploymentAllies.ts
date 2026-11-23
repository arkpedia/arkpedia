import { getAllOperators } from '../operators/operators';
import type { Profile } from './calculator';

// The timeline only needs the marked ally's ATK. Keep baseline-only operators
// out of the damage plot until their own attacks have a model.
export function deploymentAllies(): Profile[] {
  return getAllOperators().flatMap((op) => {
    if (!op.internalName || !op.stats?.phases.length) return [];
    return [
      {
        id: op.internalName.split('_').at(-1)!,
        name: op.name,
        region: op.sourceRegion === 'CN' ? 'CN' : 'EN',
        rarity: op.rarity ?? 1,
        branch: op.branch ?? '',
        trust: op.stats.trust.atk,
        phases: op.stats.phases.map((p) => ({
          maxLevel: p.maxLevel,
          start: p.base.atk,
          end: p.max.atk,
          interval: p.base.interval,
        })),
        potential: (op.potential?.levels ?? []).map((p): Record<string, number> => {
          const match = p.benefit.match(/^ATK\s*\+\s*(\d+)/i);
          return match ? { ATK: Number(match[1]) } : {};
        }),
        skills: [],
        talents: [],
        module: null,
        alternateModule: null,
      } satisfies Profile,
    ];
  });
}
