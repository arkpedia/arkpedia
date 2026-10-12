import type { BaseSkill } from '../operators/operatorTypes';
export interface WorkshopRecipe { id: string; name: string; category: string; morale: number; lmd: number; baseChance: number; level: number }
export interface WorkshopSettings { recipeId: string; overrideDormCount?: boolean; qualifyingDormOperators: number; causality: number; karma: number; thornsFailures: number }
export interface WorkshopContext { dormMorale?: number[]; recipe: WorkshopRecipe; qualifyingDormOperators: number; dormitoryOperatorCount: number; stainlessInDorm: boolean; intelligenceReserve: number; ursusBeverages: number; causality: number; karma: number; thornsFailures: number }
/** Crafting is instantaneous. Morale costs are per craft, never per hour. */
export function workshopResult(operatorName: string, skills: BaseSkill[], ctx: WorkshopContext) {
  const recipe = ctx.recipe;
  let boost = 0, morale = recipe.morale, lmd = recipe.lmd, guaranteed = false;
  const notes: string[] = [];
  const enteredQualified = Math.max(0, Math.min(ctx.dormitoryOperatorCount, ctx.qualifyingDormOperators));
  for (const skill of skills) {
    const text = skill.description ?? '';
    const name = (skill.name ?? '').split('Replaces')[0];
    const below = text.match(/Morale below (\d+)/i);
    const atMost = text.match(/(?:with )?(\d+) or less Morale/i);
    const qualified = ctx.dormMorale && (below || atMost) ? ctx.dormMorale.filter(m => below ? m < Number(below[1]) : m <= Number(atMost![1])).length : enteredQualified;
    const material = text.match(/process\s+(.+?)(?:,|\s+materials?[,.;])/i)?.[1]?.toLowerCase() ?? '';
    const family = text.match(/process\s+([\w -]+?)(?:-type| Block material| Cluster materials)/i)?.[1]?.toLowerCase();
    const familyName = family === 'ester' ? 'polyester' : family;
    const applicable = familyName ? recipe.name.toLowerCase().includes(familyName) : /elite/i.test(material) ? recipe.category === 'Elite materials' : /building/i.test(material) ? recipe.category === 'Building materials' : /skill summar/i.test(material) ? recipe.category === 'Skill Summaries' : /chips?/i.test(material) ? recipe.category === 'Chips' : true;
    if (!applicable) continue;
    if (/base Morale cost of 8/i.test(text) && recipe.morale !== 8) continue;
    if (/base Morale cost of 2/i.test(text) && recipe.morale !== 2) continue;
    if (operatorName === 'Nine-Colored Deer') {
      if (name === 'Causality') { guaranteed ||= recipe.morale <= 4 && ctx.causality + recipe.morale >= 40; notes.push('Causality: failed crafts costing at most 4 Morale add their cost; a craft crossing 40 guarantees a byproduct and spends 40 points (ordinary byproducts keep the counter).'); }
      if (name === 'Karma') { guaranteed ||= recipe.morale === 8 && ctx.karma + recipe.morale >= 80; notes.push('Karma: failed crafts costing 8 Morale accumulate their cost; a craft crossing 80 guarantees a byproduct and spends 80 points.'); }
      continue;
    }
    if (/byproduct.*(?:\d+%|\d+\s*%)/i.test(text)) {
      const percent = Number(text.match(/(\d+)\s*%/)?.[1] ?? 0) / 100;
      boost += /for every\s*1 Operator/i.test(text) ? percent * qualified : percent;
      if (operatorName === 'Catherine' && name.endsWith('β') && ctx.stainlessInDorm) boost += 0.1;
      if (operatorName === 'Frost') boost += 0.05 * ctx.intelligenceReserve + (ctx.ursusBeverages >= 4 ? 0.15 : 0);
    }
    if (/Morale cost divided by 4/i.test(text) && recipe.morale >= 4) morale /= 4;
    const fixed = text.match(/only consume (\d+) Morale/i);
    if (fixed) morale = Number(fixed[1]);
    const cost = text.match(/(?:cost|costs)\s+(?:of\s+)?(\d+)\s*(?:Morale)?\s*(or (?:more|higher))?/i);
    const deduction = text.match(/(?:by |now )?([+-]\d+)\s*(?:Morale cost)?/i);
    if (/Morale.*(?:consumed|consumption|costs?|formulas)|consum.*Morale/i.test(text) && deduction) {
      const condition = !cost || (cost[2] ? recipe.morale >= Number(cost[1]) : recipe.morale === Number(cost[1]));
      if (condition) morale += Number(deduction[1]) * (operatorName === 'Stainless' ? Math.floor(qualified / 10) : 1);
    }
    if (/reduces the LMD cost/i.test(text)) lmd = 0;
    if (/any byproducts of T3 quality/i.test(text)) notes.push(text.match(/any byproducts.+/i)![0]);
    if (name.includes('Explosion Arts')) { if (ctx.thornsFailures >= 2) notes.push(`After processing, restore ${morale} Morale per pair of failed crafts (${Math.floor(ctx.thornsFailures / 2)} pairs entered).`); else notes.push('Every two failed crafts restore one craft’s Morale after processing; enter the failure count.'); }
    if (/for every.*Operators? (?:in|with)|Operator with.*Morale/i.test(text)) notes.push(`Uses ${qualified} occupied dorm slots meeting this skill's stated Morale threshold.`);
  }
  return { boost, chance: guaranteed ? 1 : Math.min(1, recipe.baseChance * (1 + boost)), morale: Math.max(0, morale), lmd, guaranteed, notes };
}
