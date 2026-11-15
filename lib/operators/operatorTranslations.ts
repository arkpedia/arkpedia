import type { BaseSkillKeyword } from './operatorTypes';
import { getSkillList } from './operatorTypes';
import { getSkillIconPath } from './operatorIconPaths';
import type { Operator } from './operatorTextTypes';
import { applyBaseSkillGlossary, type BaseSkillGlossary } from './baseSkillGlossary';

export type Translation = { translator: string; strings: Record<string, string>; credits?: Record<string, { name: string; sourceRef?: string }> };
const fields = ['review', 'trait', 'skills', 'talents', 'potential', 'modules', 'baseSkills', 'tags'] as const;

/** Exact source text is the revision guard: changed CN text stays visible for review.
 * Global records only translate exact CN module text. Source records remain untouched. */
export function translateOperator(operator: Operator, translations: Record<string, Translation>): Operator {
  const entry = translations[operator.internalName ?? ''];
  if (!entry) return operator;
  let changed = false;
  const usedCredits = new Set<string>();
  function translate(value: unknown): unknown {
    if (typeof value === 'string') {
      const next = entry.strings[value];
      if (next !== undefined) {
        changed = true;
        const credit = entry.credits?.[value];
        usedCredits.add(credit ? `${credit.name}${credit.sourceRef ? ` [${credit.sourceRef}]` : ''}` : entry.translator);
      }
      return next ?? value;
    }
    if (Array.isArray(value)) return value.map(translate);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, translate(child)]));
    return value;
  }
  const next = { ...operator };
  const credits = { ...operator.translationCredits };
  for (const field of operator.sourceRegion === 'CN' ? fields : ['modules'] as const) {
    if (operator[field] === undefined || (field === 'review' && operator.review?.official === undefined)) continue;
    changed = false;
    usedCredits.clear();
    // Only the game overview belongs to the supplement, never editorial reviews.
    const value = field === 'review' ? { ...operator.review, official: translate(operator.review?.official) } : translate(operator[field]);
    Object.assign(next, { [field]: value });
    if (changed) credits[field] = [...usedCredits].join(' · ');
  }
  if (!Object.keys(credits).length) return operator;
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
    if (JSON.stringify(module) !== JSON.stringify(operator.modules?.[index])) {
      usedCredits.clear();
      translate(operator.modules?.[index]);
      module.translationCredit = [...usedCredits].join(' · ');
    }
  });
  return { ...next,
    translationCredits: credits,
    ...(operator.sourceRegion === 'CN' ? { translationCredit: entry.translator } : {}),
  };
}

/** Content exports carry the compact result, so newer published data stays authoritative. */
export function enrichOperatorText(operator: Operator, translations: Record<string, Translation>, keywords: BaseSkillKeyword[], glossary: BaseSkillGlossary = { terms: [], buffs: {} }): Operator {
  const translated = translateOperator(operator, translations);
  const mechanics = JSON.stringify([translated.trait, translated.skills, translated.talents, translated.modules, translated.potential]).toLowerCase();
  return { ...translated, ...(translated.sourceRegion === 'CN' && translated.baseSkills ? { baseSkills: applyBaseSkillGlossary(translated.baseSkills, glossary) } : {}), operatorTextVersion: 4,
    combatKeywords: keywords.filter(keyword => mechanics.includes(keyword.text.toLowerCase())),
  };
}
