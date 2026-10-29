export const MODES: readonly { id: string; label: string; kind: string; topic: string }[];

type Tables = { roguelike_topic_table: unknown; sandbox_perm_table: unknown; climb_tower_table: unknown };

export function buildPermanentRewards(inputs: { tables: { en: Tables; cn: Tables }; byItemId: Record<string, string> }): {
  modes: { id: string; label: string; kind: string; topic: string; global: boolean; rewards: { id: string; cn?: true; materials: Record<string, number> }[] }[];
  dropped: string[];
};
