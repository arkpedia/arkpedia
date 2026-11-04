/**
 * The Workshop: a recipe, the reader's settings, and the crafter's skills from the table
 * (lib/base/baseSkillEffects.ts), evaluated by the calculator against the recipe's kind, name and base Morale
 * cost, summed here into a byproduct chance and the craft's Morale and LMD costs. Crafting is instantaneous;
 * Morale costs are per craft, never per hour.
 */
import type { SkillContribution } from './skillEvaluation';
import type { CustomResult } from './customSkillHandlers';

export interface WorkshopRecipe { id: string; name: string; category: string; morale: number; lmd: number; baseChance: number; level: number }
export interface WorkshopSettings { recipeId: string; overrideDormCount?: boolean; qualifyingDormOperators: number; causality: number; karma: number; thornsFailures: number }
export interface WorkshopOutcome { boost: number; chance: number; morale: number; lmd: number; guaranteed: boolean; notes: string[] }
/** The game's recipe-kind codes, as the table's Workshop `targets` name them. */
export const RECIPE_KIND_CODES: Record<string, string> = { 'Building materials': 'F_BUILDING', 'Elite materials': 'F_EVOLVE', 'Skill Summaries': 'F_SKILL', Chips: 'F_ASC' };

/** The craft's Morale cost from the evaluated skills: the recipe's, scaled, replaced, then adjusted, never below 0. */
export function workshopMorale(contributions: readonly SkillContribution[], recipe: WorkshopRecipe): number {
  let morale = recipe.morale;
  for (const c of contributions) morale *= c.recipeMoraleFactor;
  for (const c of contributions) if (c.recipeMoraleFixed !== null) morale = c.recipeMoraleFixed;
  for (const c of contributions) morale += c.recipeMorale;
  return Math.max(0, morale);
}

/** The crafter's evaluated skills, and their custom handlers' results (the guarantee counters, Thorns's refund
 *  note), as the room's numbers. `entryNotes` are the applicable skills' notes (a T3 byproduct's kind), `dormCounts`
 *  the Dormitory head counts the counted skills read. */
export function workshopOutcome(contributions: readonly SkillContribution[], recipe: WorkshopRecipe, custom: readonly CustomResult[], entryNotes: readonly string[], dormCounts: readonly number[]): WorkshopOutcome {
  const boost = contributions.reduce((sum, c) => sum + c.byproductChance, 0);
  const guaranteed = custom.some(r => r.guaranteedByproduct);
  const notes: string[] = [...entryNotes];
  for (const r of custom) if (r.note) notes.push(r.note);
  for (const n of dormCounts) notes.push(`Uses ${n} occupied dorm slots meeting this skill's stated Morale threshold.`);
  return { boost, chance: guaranteed ? 1 : Math.min(1, recipe.baseChance * (1 + boost)), morale: workshopMorale(contributions, recipe), lmd: contributions.some(c => c.recipeLmdFree) ? 0 : recipe.lmd, guaranteed, notes };
}
