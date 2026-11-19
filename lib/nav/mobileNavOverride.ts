/**
 * A page can replace the phone's nav bar with one of its own.
 *
 * The Stronghold companion is why this exists. On a phone that page IS the companion:
 * it fills the screen, it has no room for a heading, and the thing a reader wants from
 * the top of it is not "Arkpedia" but the way back to the Stronghold page and how long
 * is left on the run's clock. So the brand and the server time step aside for those two.
 *
 * A page declares it as a static property on its own component:
 *
 *   CompanionPage.mobileNav = { back: { href: '/game-modes/...', label: 'Stronghold' } };
 *
 * and _app reads it off `Component` and hands it down. Deliberately NOT a route test in
 * the nav: the nav would then hold a copy of the companion's own address, a second copy
 * of a string that already lives in the page that owns it, and the two would be free to
 * drift with nothing to notice. This way the nav knows nothing about which page it is
 * on -- only what that page asked for -- and a page that asks for nothing gets the bar
 * it always had.
 *
 * Both halves are inert on their own, which is what lets them travel on separate
 * branches: a page setting this where the nav does not read it is an unused property,
 * and the nav reading it where no page sets it is the normal bar.
 */
export interface MobileNavOverride {
  /** What the left of the bar becomes, in place of the brand. */
  back: { href: string; label: string };
}

/** `Component` in _app, plus the property a page may have hung on it. */
export type PageWithMobileNav = { mobileNav?: MobileNavOverride };
