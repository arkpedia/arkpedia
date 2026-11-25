import type { OperatorStats } from '../operators/operatorStats';

export type AttackType = 'Physical' | 'Arts';
type DefenseStats = { hp: number; def: number; res: number; dp: number };

export interface EnemyAbility {
  name: string;
  type: AttackType | 'True';
  scale: number;
  firstReady: number;
  cooldown: number;
  delay: number;
  mode: 'next-hit' | 'separate' | 'charge' | 'aura';
}

export interface PatriotStances {
  marchingAtk: number;
  ruinationAtk: number;
  ruinationInterval: number;
  aura: EnemyAbility;
  spear: EnemyAbility;
}

export interface DefenderSkillRank {
  def?: number;
  res?: number;
  hp?: number;
  regeneration?: number;
  regenerationRatio?: number;
  duration: number | null;
  sp?: { cost: number; initial: number };
}

export interface DefenderSkill {
  slot: number;
  name: string;
  ranks: DefenderSkillRank[];
}

export interface Attacker {
  id: string;
  name: string;
  code: string | null;
  types: AttackType[];
  levels: { level: number; atk: number; interval: number; ability?: EnemyAbility; patriot?: PatriotStances }[];
}

export interface Defender {
  id: string;
  name: string;
  stats: OperatorStats;
  potential: Partial<DefenseStats>[];
  blocksDirectHealing: boolean;
  ranged?: boolean;
  skills?: DefenderSkill[];
}

export interface SurvivalRoster {
  enemies: Attacker[];
  operators: Defender[];
}
