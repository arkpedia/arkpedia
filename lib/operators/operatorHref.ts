/**
 * The places an operator's page can be opened at: its sections (#skills, #baseSkills, the ids
 * pages/operators/[name].tsx gives them), and the overview and the artwork, which are the
 * page's top. One list, so a link, the page's own "which section am I on" state and its
 * hash handling all spell a section the same way: a misspelt key ("baseSkill") is a compile
 * error instead of a link that quietly opens the next operator at the top.
 *
 * Names only, not the older hashes the page still answers (#gameplay, #upgrades, #profile,
 * #appearance), which its jumpToSection turns into one of these: a link writes the name, so
 * an alias here would be a section no element carries and no highlight can land on.
 * scripts/tests/test-operator-href.ts holds the list to the page's data-operator-section
 * attributes in both directions.
 */
export const OPERATOR_SECTIONS = [
  'overview', 'artwork',
  'skills', 'stats', 'talents', 'mastery', 'modules', 'promotion', 'potential', 'baseSkills',
  'synergy', 'characterInfo', 'files', 'voiceLines', 'guides',
] as const;
export type OperatorSection = (typeof OPERATOR_SECTIONS)[number];

/** A string read off the page at run time -- the URL's hash, a section's data attribute --
 *  narrowed to a section the page has a name for. */
export function isOperatorSection(value: string): value is OperatorSection {
  return (OPERATOR_SECTIONS as readonly string[]).includes(value);
}

/**
 * An operator's page, opened at the section the reader is on ("/operators/Texas#baseSkills"),
 * so moving from one operator to another keeps their place. The overview and the artwork are
 * the page's top, so they add nothing; a section the next operator does not have (no modules)
 * opens that page at its top, because the page ignores a hash it has no section for.
 *
 * `section` is required on purpose: a link that forgets it would quietly drop the reader back
 * at the top, which is the behaviour this replaces. Pass null where the top is meant -- a link
 * from anywhere but another operator's page, which has no section to keep. This is the one
 * place an operator's URL is built (scripts/tests/test-operator-href.ts fails on a hand-built
 * one in pages/ or components/), so a new operator-to-operator link cannot forget the section.
 */
export function operatorHref(name: string, section: OperatorSection | null): string {
  const path = `/operators/${encodeURIComponent(name)}`;
  return section && section !== 'overview' && section !== 'artwork' ? `${path}#${section}` : path;
}
