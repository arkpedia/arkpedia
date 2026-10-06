/**
 * The props that make an element inert unless it is shown: out of the tab order, unclickable and
 * hidden from assistive technology, for a view kept in the page only to hold its place (the
 * Account page's profile card, the music player behind its song list). React 18 does not know
 * inert: it drops `inert={true}` and passes a string through, while its types say boolean.
 */
export const hiddenUnless = (shown: boolean) => (shown ? {} : { inert: '' } as unknown as { inert: boolean });
