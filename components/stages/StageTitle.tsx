/**
 * A stage's or a chapter's title: its code and its name, with a real space between.
 *
 * The two used to be sibling nodes with nothing between them, so the page looked
 * right (a margin or a size change did the separating) while its text did not: a
 * screen reader announced "AD-EX-1Dusty Prop Room", copy and paste got the same, and
 * so did the document title a crawler built from it. The space is a text node here,
 * so the markup reads the way the page looks. tests/browser/stage-ui.spec.ts checks
 * the h1's textContent.
 *
 * `lead` is required because the two pages that title things this way disagree on
 * which half is the title: a stage is its code ("1-7", with "Dusty Prop Room" after
 * it), a chapter is its name ("Absolved Will Be the Seekers", filed under "EP 14").
 */
export default function StageTitle({ code, name, fallback, lead }: {
  code: string | null | undefined;
  name: string | null | undefined;
  /** Printed when there is neither a code nor a name (one IS node has neither). */
  fallback: string;
  lead: 'code' | 'name';
}) {
  if (!code && !name) return <>{fallback}</>;
  if (!code || !name) return <>{code || name}</>;
  return (
    <>
      <span className={lead === 'code' ? 'stage-title-code' : 'stage-title-prefix'}>{code}</span>
      {' '}
      <span className={lead === 'code' ? 'stage-title-name' : undefined}>{name}</span>
    </>
  );
}
