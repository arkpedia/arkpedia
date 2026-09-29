/** What of a SkillRecommendationEntry (./operatorTypes) this reads. */
type Said = { mastery?: string | null; order?: string | null };

/**
 * Whether an operator's skill recommendations tell its skills apart, and so are worth a
 * badge beside each skill's name. 91 operators rank theirs ("1st", "2nd", with a reason)
 * or recommend some skills and not others. 38 give every skill the same "M3" and no order
 * (Pepe, 2026-09-29), which says nothing about any one skill; beside the name, the M3
 * mastery icon then read as a second copy of the level the skill-level control shows.
 */
export function recommendationsTellApart(skills: readonly { recommendation?: readonly Said[] | null }[]): boolean {
  const shown = skills.map((skill) => (skill.recommendation ?? []).filter((entry) => entry.mastery || entry.order));
  if (shown.some((entries) => entries.some((entry) => entry.order))) return true;
  const said = shown.map((entries) => entries.map((entry) => entry.mastery ?? '').join(','));
  return new Set(said).size > 1;
}
