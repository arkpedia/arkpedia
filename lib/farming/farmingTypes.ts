export type StageKind = 'efficient' | 'focused' | 'alternative' | 'plain' | 'future' | 'eventActive';

export interface FarmingStage {
  label: string;
  kind: StageKind;
  startAt?: string;
  endAt?: string;
  fullLabel?: string; // shown as a tooltip when label is a shortened version
  countdown?: string; // e.g. "In ??? days" -- only meaningful for kind: 'future'
}

export interface FarmingMaterial {
  name: string;
  icon: string;
  stages: FarmingStage[];
}

export interface FarmingTier {
  tier: number;
  materials: FarmingMaterial[];
}