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
  /** The game's glyph for this contract on this map (the same rune can use another elsewhere). */
  icon?: string;
  group: string;
  exclusion: string | null;
  effects: RuneEffect[];
  x: number;
  y: number;
  adjacent: string[];
}
export interface ContractGroup { id: string; name: string; originalName: string; /** Extra risk for selecting the whole group (the game's "indicator set" completion). */ bonus?: number; x: number; y: number; width: number; contracts: Contract[] }
export interface BattleplanMap {
  id: string;
  stage: string;
  name: string;
  originalName: string;
  area: string;
  main: boolean;
  /** Game art ids: the area picture and the region logo. */
  pic?: string;
  logo?: string;
  groups: ContractGroup[];
}
export interface BattleplanSeason { id: string; name: string; number: number; maps: BattleplanMap[] }
export interface OperatorBuildData { name: string; rarity: number | null; className: string | null; position: string | null; stats: OperatorStats | null; potential: Potential; modules: OperatorModule[]; /** Trait or module lets it deploy on both tile types. */ bothTiles?: boolean }
export type CombatStats = Record<string, number | null>;
export interface BattleplanEnemy { id: string; slug: string; name: string; icon: string | null; stats: CombatStats; conditional: boolean; hiddenGroups: string[] }
export interface MapDetails { enemies: BattleplanEnemy[]; variants: BattleplanEnemy[]; preview: string | null; battle: CombatStats }
export interface BattleplanData {
  seasons: (Omit<BattleplanSeason, 'maps'> & { maps: (BattleplanMap & { /** null until the stage record is published. */ details: MapDetails | null })[] })[];
  operators: string[];
  /** Roster icon path per operator name. */
  operatorIcons: Record<string, string>;
  source: string;
}
