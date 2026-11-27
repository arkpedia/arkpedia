import type { OperatorStats } from '../operators/operatorStats';
import type { Profile } from './calculator';
import { fetchAsset } from '../assets/githubRetry.mjs';

export async function loadDpsCatalogue<T>(url: string, path: string, signal: AbortSignal): Promise<T> {
  async function read(address: string): Promise<T> {
    const response = await fetchAsset(address, { signal });
    if (!response.ok) throw new Error('Calculator catalogue unavailable');
    return response.json() as Promise<T>;
  }
  try {
    return await read(url);
  } catch (error) {
    if (signal.aborted || url === path) throw error;
    return read(path);
  }
}

export interface CalculatorRoster {
  operators: Profile[];
  enemyIcons: Record<string, string>;
}

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
  revival: { atk: number; duration: number; interval: number };
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
