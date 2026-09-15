/** Skill category taxonomy, built from the actual skill names in your
 * Factory data dump. Several skills scale off "how many X-type skills
 * are in this Factory" -- this is what makes that countable.
 *
 * Highmore's skill ("all Rhine Lab and Pinus Sylvestris skills are
 * considered Standardization skills") is handled separately in
 * factorySpecialSkills.ts by reclassifying at count-time, not by
 * changing this static table.
 */
export const SKILL_CATEGORIES: Record<string, string> = {
  'Standardization α': 'Standardization',
  'Standardization β': 'Standardization',
  'Rhine Tech α': 'Rhine Tech',
  'Rhine Tech β': 'Rhine Tech',
  'Rhine Tech γ': 'Rhine Tech',
  'Metalwork α': 'Metalwork',
  'Metalwork β': 'Metalwork',
  'Pinus Sylvestris α': 'Pinus Sylvestris',
  'Pinus Sylvestris β': 'Pinus Sylvestris',
  'Geology α': 'Geology',
  'Geology β': 'Geology',
  'Originium Work α': 'Originium Work',
  'Originium Work β': 'Originium Work',
  'Warehouse Organization α': 'Warehouse Organization',
  'Warehouse Organization β': 'Warehouse Organization',
  'Combat Guidance Video': 'Combat Guidance Video',
  'Boxing Guidance Video': 'Combat Guidance Video', // same family per Executor/FEater's skill text
  'Automation α': 'Automation',
  'Automation β': 'Automation',
};

/** Returns every category a skill belongs to, accounting for Highmore's
 * reclassification rule if she's present in the same Factory. A skill
 * can belong to MULTIPLE categories at once -- Highmore's ability ADDS
 * Standardization membership to Rhine Tech/Pinus Sylvestris skills, it
 * doesn't replace their original category. A Rhine Tech skill stays
 * Rhine Tech for its own operator's Rhine-Tech-counting purposes even
 * while it also counts as Standardization for someone else's
 * Standardization-counting purposes. */
export function categoriesFor(skillName: string, highmorePresent: boolean): string[] {
  const base = SKILL_CATEGORIES[skillName];
  if (!base) return [];
  const categories = [base];
  if (highmorePresent && (base === 'Rhine Tech' || base === 'Pinus Sylvestris')) {
    categories.push('Standardization');
  }
  return categories;
}