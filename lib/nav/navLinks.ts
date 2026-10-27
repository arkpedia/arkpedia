import { isGamePath } from '@/lib/minigames/catalogue';

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

export const LINKS: NavLink[] = [
  { href: '/about', label: 'About Arkpedia', icon: 'about' },
  { href: '/privacy', label: 'Privacy notice', icon: 'privacy' },
  { href: '/cookies', label: 'Cookies & privacy choices', icon: 'cookies' },
  { href: '/techniques', label: 'Techniques', icon: 'techniques' },
  { href: '/synergies', label: 'Synergies', icon: 'synergies' },
  { href: '/obtain-method', label: 'Obtain method', icon: 'obtain' },
  { href: '/community/projects', label: 'Community projects', icon: 'projects' },
  { href: '/operators', label: 'Operators', icon: 'roster' },
  { href: '/artists', label: 'Artists', icon: 'palette' },
  { href: '/voice-actors', label: 'Voice Actors', icon: 'microphone' },
  { href: '/skins', label: 'Skins', icon: 'skins' },
  /* Not in the bar any more: the Events list is a view of the Schedule page. Kept in
     LINKS because the event detail pages still live under /events/, and isActiveLink
     reads this row to light the nav on them. */
  { href: '/events', label: 'Events', icon: 'events' },
  { href: '/farming', label: 'Farming', icon: 'farming' },
  { href: '/stages', label: 'Stages', icon: 'stages' },
  /* The handbook is one page with the selection in the URL. This link used to name the
     first enemy's page, a slug next.config.js baked in at deploy: that shape is retired,
     so every click went through a 308 and a full document load that destroyed the music
     player's iframe mid-song. scripts/tests/test-nav-links.ts holds every href to a real
     page that no redirect matches. */
  { href: '/enemies', label: 'Enemies', icon: 'enemies' },
  { href: '/story', label: 'Story', icon: 'story' },
  { href: '/manga', label: 'Manga', icon: 'story' },
  { href: "/game-modes", label: 'Game Modes', icon: 'grid' },
  { href: '/base', label: 'Base', icon: 'base' },
  { href: '/account', label: 'My account', icon: 'roster' },
  { href: "/reward-tracker", label: 'Reward Tracker', icon: 'prime' },
  { href: "/operator-planner", label: 'Operator Planner', icon: 'planner' },
  { href: "/pull-planner", label: 'Pull Planner', icon: 'calculator' },
  { href: '/skin-planner', label: 'Skin Planner', icon: 'skins' },
  { href: "/world", label: 'World', icon: 'world' },
  { href: '/friends', label: 'Friends', icon: 'roster' },
  { href: "/gacha-simulator", label: 'Gacha Simulator', icon: 'gacha' },
  { href: '/recruitment', label: 'Recruitment', icon: 'recruitment' },
  { href: '/selector-tickets', label: 'Selector Tickets', icon: 'selector' },
  { href: "/polls/power-scale", label: 'Power Scale', icon: 'rate' },
  { href: '/games', label: 'Games', icon: 'grid' },
  { href: '/schedule', label: 'Schedule', icon: 'timeline' },
  { href: '/music', label: 'Music', icon: 'music' },
  { href: "/whats-new", label: "What's new", icon: 'changelog' },
  { href: '/credits', label: 'Credits', icon: 'credits' },
  { href: '/support', label: 'Support', icon: 'support' },
];

/**
 * The bar's own shape: five menus and one bare link.
 *
 * Seventeen links measured 1707px of buttons inside a 1040px bar, so they had always
 * wrapped onto a second row, and the collapse existed to get that row back off the
 * screen. Grouping is what removes the need for it. The names below are the reader's
 * grouping, not a taxonomy invented here, and they are only an array: moving an entry
 * between menus is a line move.
 *
 * Support sits outside the menus because it is one destination and nothing groups with
 * it. Rules is what myrtle.moe does with Tier Lists, and it is right: a menu holding a
 * single item is a click in front of a link.
 */
export interface NavGroup {
  /** Stable: the menu's key and its data-menu, whatever its label reads. */
  id: string;
  label: string;
  items: NavLink[];
  dividersAfter?: string[];
}

const at = (href: string): NavLink => {
  const link = LINKS.find((l) => l.href === href);
  if (!link) throw new Error(`nav group names a link that is not in LINKS: ${href}`);
  return link;
};

export const GROUPS: NavGroup[] = [
  { id: 'database', label: 'Database', dividersAfter: ['/obtain-method', '/manga'], items: [
    at('/operators'), at('/skins'), at('/synergies'), at('/techniques'), at('/obtain-method'),
    at('/enemies'), at('/stages'), at('/story'), at('/manga'), at('/artists'), at('/voice-actors'),
  ] },
  { id: 'guides', label: 'Guides', items: [at('/farming'), at('/base'), at('/recruitment'), at("/gacha-simulator"), at('/selector-tickets'), at("/game-modes")] },
  { id: 'own', label: 'Planner', items: [at("/operator-planner"), at("/pull-planner"), at('/skin-planner'), at("/reward-tracker")] },
  { id: 'community', label: 'Community', items: [at('/community/projects'), at("/world"), at("/polls/power-scale"), at('/music'), at('/games')] },
  { id: 'about', label: 'About', items: [at('/about'), at("/whats-new"), at('/credits'), at('/support')] },
];

/* Not in a menu: one destination each, and a menu of one is a click in front of a
   link. Planner joined them when Base, Recruitment and Gacha moved to Guides and left
   it alone in Planning. Schedule joined them when the Events list became a view of the
   Schedule page rather than a page of its own, which left that menu holding one thing
   too. */
export const LOOSE: NavLink[] = [at('/schedule')];

/**
 * Every destination the bar shows, in the order it shows them: each menu's contents in
 * menu order, then loose and profile utility links. Search uses this complete list.
 * Both navigation layouts derive their menus from GROUPS rather than LINKS,
 * which is a registry in no particular order -- the drawer used to list Operators,
 * Skins, Events, Farming, Stages... while the bar read Operators, Skins, Enemies,
 * Stages, so the two navs disagreed about where everything was.
 *
 * Derived, not written out again. A second hand-maintained list is a second thing to
 * forget when an entry moves between menus.
 */
export const PROFILE_LINKS = [at('/account'), at('/friends')];
export const NAV_ORDER: NavLink[] = [...GROUPS.flatMap((g) => g.items), ...LOOSE, ...PROFILE_LINKS];

/* Rows that are in LINKS on purpose while appearing in neither nav. Events is the only
   one: the events LIST is a view of the Schedule page now, and this row survives so
   isActiveLink can light Schedule on the /events/<slug> detail pages that still exist. */
// Privacy documents remain reachable from privacy settings and existing bookmarks.
const NOT_IN_NAV = new Set<string>(['/events', '/privacy', '/cookies']);

/* A row that is in no menu, no loose slot and not named above renders nowhere at all,
   in either nav, and nothing else would say so. Same reasoning as at() above: fail the
   build rather than quietly lose a destination. */
const orphanLinks = LINKS.filter((l) => !NAV_ORDER.includes(l) && !NOT_IN_NAV.has(l.href));
if (orphanLinks.length > 0) {
  throw new Error(
    `nav links belong to no menu and are not marked as deliberately hidden: ${orphanLinks
      .map((l) => l.href)
      .join(', ')}`
  );
}

/**
 * Whether a nav entry's section contains the current route. A section's own detail
 * pages count as being in it: router.pathname is the ROUTE, so an event page reads
 * "/events/[slug]" and never equals "/events" -- which once left the nav unlit on
 * every detail page in the site. Home is excluded or "/" would prefix-match
 * everything. Shared with MobileNavDrawer, which had its own copy of this test and
 * disagreed with the desktop nav about which entry was lit.
 */
export function isActiveLink(link: NavLink, pathname: string): boolean {
  if (link.href === "/world") return pathname === "/world";
  if (link.href === '/games') return isGamePath(pathname);
  const section = link.href;
  return pathname === section || (section !== '/' && pathname.startsWith(`${section}/`));
}
