import type { BaseSkillKeyword, BaseSkill } from './operatorTypes';

export interface BaseSkillGlossary {
  terms: (BaseSkillKeyword & { aliases: string[]; sourceName: string; official: boolean })[];
  /** A common name is applied only when the game's buff references that term ID. */
  buffs: Record<string, string[]>;
}

export function applyBaseSkillGlossary(skills: BaseSkill[] | undefined, glossary: BaseSkillGlossary) {
  return skills?.map(skill => {
    let description = skill.description;
    const keywords = [...(skill.keywords ?? [])];
    for (const id of glossary.buffs[skill.buffId ?? ''] ?? []) {
      const term = glossary.terms.find(entry => entry.term === id);
      if (!term || !description) continue;
      const aliases = [term.name, ...term.aliases].sort((a, b) => b.length - a.length)
        .map(alias => alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${aliases.join('|')})(?![\\p{L}\\p{N}_])`, 'giu');
      if (!pattern.test(description)) continue;
      description = description.replace(pattern, term.name);
      const previous = keywords.findIndex(keyword => keyword.term === id);
      const keyword = { term: id, text: term.name, name: term.name, definition: term.definition };
      if (previous < 0) keywords.push(keyword); else keywords[previous] = keyword;
    }
    return { ...skill, description, ...(keywords.length ? { keywords } : {}) };
  });
}
