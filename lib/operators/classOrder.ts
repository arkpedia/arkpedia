/** The eight classes in the game's own order, as its operator list and class filter show them. */
export const CLASS_ORDER = ['Vanguard', 'Guard', 'Defender', 'Sniper', 'Caster', 'Medic', 'Supporter', 'Specialist'] as const;

/** Classes in the game's order; any class the list does not know (a new one) follows, alphabetically. */
export function sortClasses(classes: Iterable<string>): string[] {
  const rank = (name: string) => { const i = (CLASS_ORDER as readonly string[]).indexOf(name); return i < 0 ? CLASS_ORDER.length : i; };
  return [...new Set(classes)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}
