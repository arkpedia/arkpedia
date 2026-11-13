import type { OperatorStats } from '@/lib/operators/operatorStats';
import type { OperatorModule, Potential } from '@/lib/operators/operatorTypes';

export interface RuneEffect {
  key: string;
  selector: { professionMask?: number; buildableMask?: number; heightTypeMask?: number; enemyIdFilter?: string[] | null; [key: string]: unknown };
  blackboard: { key: string; value?: number; valueStr?: string | null }[];
}
export interface Contract {
  id: string;
  runeId: string;
  name: string;
  description: string;
  score: number;
  group: string;
  exclusion: string | null;
  effects: RuneEffect[];
  x: number;
  y: number;
  adjacent: string[];
}
export interface ContractGroup { id: string; name: string; originalName: string; x: number; y: number; width: number; contracts: Contract[] }
export interface BattleplanMap {
  id: string;
  stage: string;
  name: string;
  originalName: string;
  area: string;
  main: boolean;
  groups: ContractGroup[];
}
export interface BattleplanSeason { id: string; name: string; number: number; maps: BattleplanMap[] }
export interface OperatorBuildData { name: string; rarity: number | null; className: string | null; position: string | null; stats: OperatorStats | null; potential: Potential; modules: OperatorModule[] }
export type CombatStats = Record<string, number | null>;
export interface BattleplanEnemy { id: string; slug: string; name: string; icon: string | null; stats: CombatStats; conditional: boolean; hiddenGroups: string[] }
export interface MapDetails { enemies: BattleplanEnemy[]; variants: BattleplanEnemy[]; preview: string | null; battle: CombatStats }
