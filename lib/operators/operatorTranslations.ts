import { getSkillList } from './operatorTypes';
import { getSkillIconPath } from './operatorIconPaths';
import type { Operator } from './operatorTypes';

export type Translation = { translator: string; strings: Record<string, string> };
const fields = ['trait', 'skills', 'talents', 'potential', 'modules', 'baseSkills', 'tags'] as const;

/** Exact source text is the revision guard: changed CN text stays visible for review.
 * Global records only translate exact CN module text. Source records remain untouched. */
export function translateOperator(operator: Operator, translations: Record<string, Translation>): Operator {
  const entry = translations[operator.internalName ?? ''];
  if (!entry) return operator;
  let changed = false;
  function translate(value: unknown): unknown {
    if (typeof value === 'string') {
      const next = entry.strings[value];
      if (next !== undefined) changed = true;
      return next ?? value;
    }
    if (Array.isArray(value)) return value.map(translate);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, translate(child)]));
    return value;
  }
  const next = { ...operator };
  for (const field of operator.sourceRegion === 'CN' ? fields : ['modules'] as const) {
    if (operator[field] !== undefined) Object.assign(next, { [field]: translate(operator[field]) });
  }
  if (!changed) return operator;
  // Translation changes the label, never the published artwork filename.
  const originalSkills = getSkillList(operator);
  getSkillList(next).forEach((skill, index) => {
    const original = originalSkills[index];
    if (original && original.name !== skill.name) skill.icon = original.icon || getSkillIconPath(operator.name, original.name);
  });
  next.baseSkills?.forEach((skill, index) => {
    const original = operator.baseSkills?.[index];
    if (original && original.name !== skill.name) skill.rawName = original.rawName ?? original.name;
  });
  next.modules?.forEach((module, index) => {
    if (JSON.stringify(module) !== JSON.stringify(operator.modules?.[index])) module.translationCredit = entry.translator;
  });
  return { ...next,
    ...(operator.sourceRegion === 'CN' ? { translationCredit: entry.translator } : {}),
  };
}
