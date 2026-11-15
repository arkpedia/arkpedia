import { stripRichText } from './gametext.mjs';

/** Keep the game's definitions, including both targets of elemental buildup. */
export function combatKeywords(constants) {
  const terms = Object.values(constants.termDescriptionDict ?? {}).filter(term => term.termId?.startsWith('ba.'));
  const keywords = terms.filter(term => !term.termName.endsWith(' - Ally')).map(term => {
    const enemy = terms.find(candidate => candidate.termId === `${term.termId}2` && candidate.termName.endsWith(' - Ally'));
    const definition = enemy
      ? `Against enemies: ${stripRichText(enemy.description)}\nOn allies: ${stripRichText(term.description)}`
      : stripRichText(term.description);
    return { text: term.termName, term: term.termId, name: term.termName, definition };
  });
  const aliases = { 'ba.stun': ['Stunned'], 'ba.frozen': ['Freeze'], 'ba.root': ['Bound'], 'ba.invisible': ['Invisibility'], 'ba.sluggish': ['Slowed'] };
  return keywords.flatMap(keyword => [keyword, ...(aliases[keyword.term] ?? []).map(text => ({ ...keyword, text }))]);
}
