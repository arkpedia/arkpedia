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
  { href: '/operators', label: 'Operators', icon: 'roster' },
  { href: '/artists', label: 'Artists', icon: 'palette' },
  { href: '/voice-actors', label: 'Voice Actors', icon: 'microphone' },
  { href: '/skins', label: 'Skins', icon: 'skins' },
  /* Reached from the Operators page's header before they had menu entries of their own. */
  { href: '/synergies', label: 'Synergies', icon: 'synergies' },
  { href: '/techniques', label: 'Techniques', icon: 'techniques' },
  { href: '/obtain-method', label: 'Obtain Method', icon: 'obtain' },
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
  /* Reached from the Story page's card before it had a menu entry. */
  { href: '/manga', label: 'Manga', icon: 'manga' },
  { href: '/game-modes', label: 'Game Modes', icon: 'grid' },
  { href: '/base', label: 'Base', icon: 'base' },
  /* Always "My Account", import or not: a menu entry whose name changed once you had
     imported read as a different page (2026-10-03). */
  { href: '/account', label: 'My Account', icon: 'roster' },
  { href: '/reward-tracker', label: 'Reward Tracker', icon: 'prime' },
  { href: '/operator-planner', label: 'Operator Planner', icon: 'planner' },
  { href: '/pull-planner', label: 'Pull Planner', icon: 'calculator' },
  { href: '/skin-planner', label: 'Skin Planner', icon: 'skins' },
  { href: '/community-hub', label: 'Community Hub', icon: 'community' },
  { href: '/friends', label: 'Friends', icon: 'friends' },
  { href: '/gacha-simulator', label: 'Gacha Simulator', icon: 'permit' },
  { href: '/recruitment', label: 'Recruitment', icon: 'recruitment' },
  { href: '/selector-tickets', label: 'Selector Tickets', icon: 'gacha' },
  /* The closed community poll. Its address is under /polls, where a Polls page will list it with
     the polls to come. */
  { href: '/polls/power-scale', label: 'Power Scale', icon: 'rate' },
  { href: '/games', label: 'Games', icon: 'grid' },
  { href: '/schedule', label: 'Schedule', icon: 'timeline' },
  { href: '/music', label: 'Music', icon: 'music' },
  { href: '/whats-new', label: "What's new", icon: 'changelog' },
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
 * Schedule sits outside the menus because it is one destination and nothing groups with
 * it. Rules is what myrtle.moe does with Tier Lists, and it is right: a menu holding a
 * single item is a click in front of a link.
 */
export interface NavGroup {
  /** Stable: the menu's key and its data-menu, whatever its label reads. */
  id: string;
  label: string;
  items: NavLink[];
  /** The hrefs a thin rule follows in the open menu: a long menu read as a few groups. */
  dividersAfter?: string[];
}

const at = (href: string): NavLink => {
  const link = LINKS.find((l) => l.href === href);
  if (!link) throw new Error(`nav group names a link that is not in LINKS: ${href}`);
  return link;
};

export const GROUPS: NavGroup[] = [
  /* Looking something up in the game. */
  { id: 'database', label: 'Database', dividersAfter: ['/obtain-method', '/manga'], items: [
    at('/operators'), at('/skins'), at('/synergies'), at('/techniques'), at('/obtain-method'),
    at('/enemies'), at('/stages'), at('/story'), at('/manga'),
    at('/artists'), at('/voice-actors'),
  ] },
  /* How to play it well, and the Gacha Simulator, where a banner can be tried before pulling. */
  { id: 'guides', label: 'Guides', items: [at('/farming'), at('/base'), at('/recruitment'), at('/gacha-simulator'), at('/selector-tickets'), at('/game-modes')] },
  /* The reader's own: their account, the planners that read it (issue #94), and the
     friends' accounts imported beside it. */
  { id: 'own', label: 'Planner', items: [at('/account'), at('/operator-planner'), at('/pull-planner'), at('/skin-planner'), at('/reward-tracker'), at('/friends')] },
  /* What players share and play: events and creators, the Power Scale, music, games. */
  { id: 'community', label: 'Community', items: [at('/community-hub'), at('/polls/power-scale'), at('/music'), at('/games')] },
  /* The site itself, not the game. */
  { id: 'about', label: 'About', items: [at('/whats-new'), at('/credits'), at('/support')] },
];

/* Not in a menu: one destination, and a menu of one is a click in front of a link.
   Schedule is here since the Events list became a view of the Schedule page rather than a
   page of its own, which left that menu holding one thing. Support was here too, as a
   heart, until What's new and Credits left Community and it joined them in About. */
export const LOOSE: NavLink[] = [at('/schedule')];

/**
 * Every destination the bar shows, in the order it shows them: each menu's contents in
 * menu order, then the loose links. The mobile drawer renders this rather than LINKS,
 * which is a registry in no particular order -- the drawer used to list Operators,
 * Skins, Events, Farming, Stages... while the bar read Operators, Skins, Enemies,
 * Stages, so the two navs disagreed about where everything was.
 *
 * Derived, not written out again. A second hand-maintained list is a second thing to
 * forget when an entry moves between menus.
 */
export const NAV_ORDER: NavLink[] = [...GROUPS.flatMap((g) => g.items), ...LOOSE];

/* Rows that are in LINKS on purpose while appearing in neither nav. Events is the only
   one: the events LIST is a view of the Schedule page now, and this row survives so
   isActiveLink can light Schedule on the /events/<slug> detail pages that still exist. */
const NOT_IN_NAV = new Set<string>(['/events']);

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
  if (link.href === '/games') return isGamePath(pathname);
  const section = link.href;
  return pathname === section || (section !== '/' && pathname.startsWith(`${section}/`));
}
