/**
 * The art the Tier List maker can rank (pages/polls/tier-list.tsx), as the build compiles it
 * (scripts/build/build-operator-search.ts -> data/tier-list-catalogue.json).
 *
 * Grouped by operator so a path's folder and the operator's name are written once. Every
 * path was resolved against the asset index when the file was built: an operator, outfit or
 * skill whose art is not published is left out, whichever server it comes from, so no tile
 * is a blank square. Nothing here says Global or CN.
 */
import { getBaseSkillIconPath, getSkillIconPath } from '@/lib/operators/operatorIconPaths';

export type TierKind = 'icons' | 'e0' | 'e2' | 'skins' | 'skills' | 'baseSkills';
export const TIER_KINDS: readonly TierKind[] = ['icons', 'e0', 'e2', 'skins', 'skills', 'baseSkills'];
export const TIER_RARITIES: readonly number[] = [6, 5, 4, 3, 2, 1];
/** The promotion art the asset repository holds, by its file label. The game draws no
 *  separate Elite 1 illustration, so there is none to offer. */
export const TIER_ART_STAGES = ['Base', 'Elite 2'] as const;
export type TierArtStage = (typeof TIER_ART_STAGES)[number];

export interface TierCatalogueOperator {
  /** The game's character id (char_...), which no translation changes. */
  id: string;
  name: string;
  rarity: number;
  /** The roster portrait, or null while it is unpublished. */
  icon: string | null;
  /** The full illustrations it has, of TIER_ART_STAGES; their paths follow from the name
   *  and rarity (artPath), so only the labels travel. */
  art: TierArtStage[];
  /** Outfits with a full illustration: [skin id, outfit name, illustration path]. In all
   *  three lists the path is left out where it is the one the names give (the usual case). */
  skins: [string, string, string?][];
  /** Skills with an icon: [slot (1-based), skill name, icon path]. */
  skills: [number, string, string?][];
  /** Base skills with an icon: [the game's buff id, skill name, icon path]. */
  baseSkills: [string, string, string?][];
}
export interface TierCatalogue { operators: TierCatalogueOperator[] }

export interface TierItem {
  id: string;
  kind: TierKind;
  rarity: number;
  operator: string;
  /** What the tile is called: the operator, or "Operator - Outfit / Skill / Elite 2". */
  name: string;
  /** The picture's path. A full illustration (kinds e0, e2 and skins) is drawn from its
   *  small rendition (tileImage), never from this file. */
  image: string;
}

const RARITY_WORDS: Record<number, string> = { 6: 'six', 5: 'five', 4: 'four', 3: 'three', 2: 'two', 1: 'one' };
/** An illustration's path, as lib/skins/skins.ts names them: a promotion stage's or an outfit's. */
export const artPath = (name: string, rarity: number, label: string) => `/${RARITY_WORDS[rarity]}-star-skins/${name} - ${label}.webp`;
/** The paths the catalogue leaves out, from the names (the same helpers the build compared with). */
export const skillPath = (operator: string, skill: string) => getSkillIconPath(operator, skill)!;
export const baseSkillPath = (operator: string, skill: string) => getBaseSkillIconPath(operator, { name: skill })!;

export const operatorItemId = (id: string) => `op:${id}`;
export const skinItemId = (id: string) => `skin:${id}`;
export const skillItemId = (operatorId: string, slot: number) => `skill:${operatorId}:${slot}`;
export const artItemId = (operatorId: string, stage: TierArtStage) => `art:${operatorId}:${stage === 'Base' ? 0 : 2}`;
export const baseSkillItemId = (operatorId: string, buffId: string) => `base:${operatorId}:${buffId}`;

/** Every rankable item, in pool order: rarity down, then operator, each operator's portrait,
 *  illustrations, outfits, skills and base skills together. */
export function catalogueItems(catalogue: TierCatalogue): TierItem[] {
  const operators = [...catalogue.operators].sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name));
  return operators.flatMap((op) => [
    ...(op.icon ? [{ id: operatorItemId(op.id), kind: 'icons' as const, rarity: op.rarity, operator: op.name, name: op.name, image: op.icon }] : []),
    ...op.art.map((stage) => ({ id: artItemId(op.id, stage), kind: stage === 'Base' ? 'e0' as const : 'e2' as const, rarity: op.rarity, operator: op.name, name: `${op.name} - ${stage}`, image: artPath(op.name, op.rarity, stage) })),
    ...op.skins.map(([id, name, image]) => ({ id: skinItemId(id), kind: 'skins' as const, rarity: op.rarity, operator: op.name, name: `${op.name} - ${name}`, image: image ?? artPath(op.name, op.rarity, name) })),
    ...op.skills.map(([slot, name, image]) => ({ id: skillItemId(op.id, slot), kind: 'skills' as const, rarity: op.rarity, operator: op.name, name: `${op.name} - ${name}`, image: image ?? skillPath(op.name, name) })),
    ...op.baseSkills.map(([buff, name, image]) => ({ id: baseSkillItemId(op.id, buff), kind: 'baseSkills' as const, rarity: op.rarity, operator: op.name, name: `${op.name} - ${name}`, image: image ?? baseSkillPath(op.name, name) })),
  ]);
}
