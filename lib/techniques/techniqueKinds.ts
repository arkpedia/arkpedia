/**
 * What a technique does, in one word (/techniques' Kind filter and the card's eyebrow).
 *
 * The umbrellas (UMBRELLA_MEMBERS) group 28 of the techniques, overlapping -- RES Down is
 * in Stats Debuff and Enhance Arts Damage, Standard Fragility in three -- and leave the
 * rest standalone, so they cannot be the filter on their own: a pick-one filter needs one
 * answer per technique. A kind is that answer. The umbrella still shows on the card and
 * its stacking note in the record.
 *
 * A technique is placed by its own name first, then by its first umbrella. A name neither
 * covers (a hand-written technique a record adds later) is 'Other' and still listed: the
 * page shows the Other chip only while something is in it. scripts/tests/test-technique-kinds.ts
 * holds every rule-made technique and every umbrella to a real kind.
 */
export const TECHNIQUE_KINDS = ['Crowd control', 'Debuffs', 'Damage', 'Defense', 'SP & skills', 'Utility', 'Other'] as const;
export type TechniqueKind = (typeof TECHNIQUE_KINDS)[number];

export const UMBRELLA_KIND: Record<string, TechniqueKind> = {
  Statuses: 'Crowd control',
  Fragility: 'Debuffs',
  'Stats Debuff': 'Debuffs',
  'Enhance Arts Damage': 'Debuffs',
  'Enhance Physical Damage': 'Debuffs',
  Steal: 'Debuffs',
  'Elemental Damage': 'Damage',
  'Damage Negation': 'Defense',
  AFK: 'SP & skills',
};

const NAME_KIND: Record<string, TechniqueKind> = {
  // In Enhance Arts Damage too, but it is an elemental burst first.
  Burn: 'Damage',
  'Pseudo-Pusher': 'Crowd control',
  'Pseudo-Puller': 'Crowd control',
  'True Damage': 'Damage',
  'Damage Over Time': 'Damage',
  'Reflection Damage': 'Damage',
  'AOE Nuke': 'Damage',
  'Focused AOE': 'Damage',
  'Minimum Damage': 'Damage',
  Scaler: 'Damage',
  'Pure Lock-on': 'Damage',
  'Self-Sustain': 'Defense',
  'Barrier Generation': 'Defense',
  'Damage-Instance Shields': 'Defense',
  'Status Resistance': 'Defense',
  'Hit Reduction': 'Defense',
  Revival: 'Defense',
  'Block 5': 'Defense',
  'SP Charging': 'SP & skills',
  'SP Recovery Booster': 'SP & skills',
  'Hold Charges': 'SP & skills',
  'Skill Control': 'SP & skills',
  'Ammo-based Skills': 'SP & skills',
  'Overload / Charged': 'SP & skills',
  'Switch State': 'SP & skills',
  'Reveal Invisibility': 'Utility',
  'Global Range': 'Utility',
  Repositioning: 'Utility',
  Bait: 'Utility',
};

export function techniqueKind(name: string, umbrellaNames: readonly string[]): TechniqueKind {
  return NAME_KIND[name] ?? umbrellaNames.map((u) => UMBRELLA_KIND[u]).find(Boolean) ?? 'Other';
}
