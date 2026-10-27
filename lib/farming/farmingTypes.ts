export type StageKind = 'efficient' | 'focused' | 'alternative' | 'plain' | 'future' | 'eventActive';

export interface FarmingStage {
  label: string;
  kind: StageKind;
  startAt?: string;
  endAt?: string;
  event?: string; // owning event for event-stage and shop links
  fullLabel?: string; // shown as a tooltip when label is a shortened version
  active?: boolean;
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