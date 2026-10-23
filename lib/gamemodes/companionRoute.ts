/**
 * Where the Stronghold companion lives, on its own.
 *
 * A one-line module because three files need the address and one of them is
 * _document, which cannot import it from the component that used to own it: the boot
 * script there is a dozen characters of string, and reaching into
 * StrongholdCompanion.tsx for a constant would drag the whole companion -- data,
 * playbook and all -- into the document bundle on every page of the site.
 */
export const COMPANION_PAGE = '/game-modes/stronghold-protocol/stronghold-companion';

/**
 * The flag on that address that says: draw the companion, and none of the website
 * around it. Nav, scanbar, player and the page's own heading all step out; the CSS
 * that does it hangs off `body.gm-popout` in gamemodes.css.
 *
 * Not a general "chromeless" flag. It is read before the first paint by the boot
 * script in _document, and that script is deliberately scoped to COMPANION_PAGE:
 * keyed on the parameter alone, any URL on the site could strip its own furniture
 * and nothing would ever put it back, because only the companion page runs the
 * effect that takes the class off again.
 */
export const COMPANION_POPOUT = 'popout=1';

/** True when a browser Location is the companion asked for without the site around it. */
export function isCompanionPopout(search: string): boolean {
  return new URLSearchParams(search).get('popout') === '1';
}
