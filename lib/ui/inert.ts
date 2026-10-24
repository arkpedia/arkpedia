/**
 * The props that make an element inert unless it is shown: out of the tab order, unclickable and
 * hidden from assistive technology, for a view kept in the page only to hold its place (the
 * Account page's profile card, the music player behind its song list). React 19 supports
 * the native boolean prop; the old React 18 empty-string workaround is treated as false.
 */
export const hiddenUnless = (shown: boolean) => (shown ? {} : { inert: true });
