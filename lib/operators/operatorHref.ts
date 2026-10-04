/**
 * An operator's page, opened at the section the reader is on ("/operators/Texas#baseSkills"),
 * so moving from one operator to another keeps their place. The overview and the artwork are
 * the page's top, so they add nothing; a section the next operator does not have (no modules)
 * opens that page at its top, because the page ignores a hash it has no section for.
 *
 * `section` is required on purpose: a link that forgets it would quietly drop the reader back
 * at the top, which is the behaviour this replaces. Pass null where the top is meant.
 */
export function operatorHref(name: string, section: string | null): string {
  const path = `/operators/${encodeURIComponent(name)}`;
  return section && section !== 'overview' && section !== 'artwork' ? `${path}#${section}` : path;
}
