import { pageCatalogue } from '@/lib/routes/catalogue.cjs';
import { isGamePath } from '@/lib/minigames/catalogue';
import { managedPageForHref, type ManagedPage } from '@/lib/page-visibility/settings';

/*
 * Every destination the site nav offers, and how the bar and the mobile drawer arrange them.
 * Plain data, apart from the bar that renders it (components/layout/Sitenav.tsx), so
 * scripts/tests/test-nav-links.ts can hold each href to a page that exists and that no
 * redirect in next.config.js, or in the page itself, sends elsewhere. A redirected href is
 * a full document load: the client router cannot follow a server redirect, so the whole app
 * restarts and the music player's iframe is destroyed.
 */

export interface NavLink {
  href: string;
  label: string;
  icon: string;
}

export interface NavGroup {
  id: string;
  label: string;
  icon?: string;
  items: NavLink[];
  dividersAfter?: string[];
}

const MENUS = [
  { id: 'database', label: 'Database' },
  { id: 'guides', label: 'Tools' },
  { id: 'own', label: 'Planner' },
  { id: 'community', label: 'Community' },
  { id: 'extras', label: 'Extras' },
  { id: 'schedule', label: 'Schedule', icon: 'timeline' },
  { id: 'about', label: 'About' },
];

const destinations = pageCatalogue.flatMap(page => (page.nav ?? []).map(entry => ({
  group: entry.group,
  order: entry.order,
  dividerAfter: entry.dividerAfter,
  link: {
    href: entry.query ? `${page.route}?${entry.query}` : page.route,
    label: entry.label,
    icon: entry.icon,
  },
})));

const validGroups = new Set([...MENUS.map(menu => menu.id), 'profile', 'loose', 'hidden']);
const hrefs = new Set<string>();
const positions = new Set<string>();
for (const entry of destinations) {
  const position = `${entry.group}:${entry.order}`;
  if (!validGroups.has(entry.group) || hrefs.has(entry.link.href)
      || (entry.group !== 'hidden' && positions.has(position))) {
    throw Error(`Invalid or duplicate navigation entry: ${entry.link.href} (${position})`);
  }
  hrefs.add(entry.link.href);
  positions.add(position);
}

const entriesIn = (group: string) => destinations.filter(entry => entry.group === group)
  .sort((a, b) => a.order - b.order);

export const LINKS: NavLink[] = destinations.map(entry => entry.link);
export const GROUPS: NavGroup[] = MENUS.map(menu => {
  const entries = entriesIn(menu.id);
  const dividersAfter = entries.filter(entry => entry.dividerAfter).map(entry => entry.link.href);
  return {
    ...menu,
    items: entries.map(entry => entry.link),
    ...(dividersAfter.length ? { dividersAfter } : {}),
  };
});
export const LOOSE = entriesIn('loose').map(entry => entry.link);
export const PROFILE_LINKS = entriesIn('profile').map(entry => entry.link);
export function isNavLinkListed(link: NavLink, listed: readonly ManagedPage[]): boolean {
  const managed = managedPageForHref(link.href);
  return managed === undefined || listed.includes(managed);
}

export const NAV_ORDER = [...GROUPS.flatMap(group => group.items), ...LOOSE, ...PROFILE_LINKS]
  .filter(link => isNavLinkListed(link, []));

const MAKER_PATHS = ['/polls/tier-list', '/polls/chart-maker'];

/**
 * Whether a nav entry's section contains the current route. A section's own detail
 * pages count as being in it: router.pathname is the ROUTE, so an event page reads
 * "/events/[slug]" and never equals "/events" -- which once left the nav unlit on
 * every detail page in the site. Home is excluded or "/" would prefix-match
 * everything. Shared with MobileNavDrawer, which had its own copy of this test and
 * disagreed with the desktop nav about which entry was lit.
 */
export function isActiveLink(link: NavLink, pathname: string, asPath?: string): boolean {
  if (link.href === '/account?panel=following') return pathname === '/account' && /[?&]panel=(?:following|friends)(?:&|#|$)/.test(asPath ?? '');
  if (link.href === "/world") return pathname === "/world";
  /* The Schedule menu's entries are one route with two views: the view is in the query,
     so the URL (asPath) decides which is lit. Without it only the route is known, and
     Events, the page's default view, stands for it. */
  if (pathname === '/schedule' && link.href.startsWith('/schedule')) {
    const calendar = /[?&]view=calendar(?:&|#|$)/.test(asPath ?? '');
    return link.href === '/schedule?view=calendar' ? calendar : !calendar;
  }
  if (link.href === '/games') return isGamePath(pathname);
  /* The two makers live under /polls/ but belong to Extras: Community polls is not lit on them. */
  if (link.href === '/polls' && MAKER_PATHS.includes(pathname)) return false;
  const section = link.href;
  return pathname === section || (section !== '/' && pathname.startsWith(`${section}/`));
}
