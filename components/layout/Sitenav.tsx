import { ContentImg, ContentArt } from '@/components/content/ContentImage';
import { isGamePath } from '@/lib/minigames/catalogue';
import Link from 'next/link';
import Image from '@/components/content/ContentImage';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import ThemeToggle from './ThemeToggle';
import MobileNavDrawer from './MobileNavDrawer';
import type { MobileNavOverride } from '@/lib/nav/mobileNavOverride';
import ServerClock from './ServerClock';
import { getEssentialIconPath } from '@/lib/operators/operatorIconPaths';
import { ENEMY_HANDBOOK_HREF, ENEMY_HANDBOOK_SECTION } from '@/lib/enemies/handbookEntry';

/**
 * A game icon drawn in the current text colour.
 *
 * The art is a white-on-alpha bitmap, so it goes in as a CSS mask over currentColor
 * rather than as an <ContentImg>. An <ContentImg> would stay white on the light theme and ignore the
 * teal an active entry picks up, which is the whole reason the site draws them this way
 * (see .site-nav-glyph in nav.css).
 */
const glyph = (src: string): JSX.Element => (
  <ContentArt className="site-nav-glyph" src={src} />
);

export const ICONS: Record<string, JSX.Element> = {
  rate: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="10" cy="10" r="7" />
      <circle cx="10" cy="10" r="3" />
      <circle cx="10" cy="10" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  ),
  /* The in-game Operator archive glyph. */
  roster: glyph('/essential-icons/Operators.webp'),
  theme: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M10 2 L17 7 L14.5 16 L5.5 16 L3 7 Z" strokeLinejoin="round" />
      <path d="M10 2 L10 16 M3 7 L17 7" strokeLinejoin="round" />
    </svg>
  ),
  community: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2.5" y="4.5" width="15" height="11" rx="2" />
      <path d="M8.5 8 L12.5 10 L8.5 12 Z" fill="currentColor" stroke="none" />
    </svg>
  ),
  gacha: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 3 A7 7 0 0 1 17 10 L10 10 Z" fill="currentColor" stroke="none" />
    </svg>
  ),
  recruitment: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="8" cy="7" r="3" />
      <path d="M2.5 17 C2.5 12.5 5 11 8 11 C11 11 13.5 12.5 13.5 17" strokeLinecap="round" />
      <path d="M14.5 4.5 L16.5 6.5 L14.5 8.5 M17 6.5 H12.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  guesser: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="10" cy="10" r="7" />
      <path d="M7.5 7.5 C7.5 5.8 8.6 4.8 10 4.8 C11.4 4.8 12.5 5.8 12.5 7.2 C12.5 8.8 10 9 10 11.5" strokeLinecap="round" />
      <circle cx="10" cy="14.3" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  ),
  timeline: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2.5" y="4" width="15" height="13" rx="1.5" />
      <path d="M2.5 8 H17.5 M6 2.5 V5.5 M14 2.5 V5.5" strokeLinecap="round" />
    </svg>
  ),
  skins: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M7 3 L4 6 L4 17 H16 L16 6 L13 3" strokeLinejoin="round" />
      <path d="M7 3 C7 5 8.5 6 10 6 C11.5 6 13 5 13 3" strokeLinejoin="round" />
    </svg>
  ),
  events: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="4" width="14" height="13" rx="1.5" />
      <path d="M3 8H17" strokeLinecap="round" />
      <path d="M6.5 2.5V5.5M13.5 2.5V5.5" strokeLinecap="round" />
    </svg>
  ),
  farming: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M10 17 V9 M10 9 C10 6 7 6 6 3.5 C9 3.5 10 6 10 8 C10 6 11 3.5 14 3.5 C13 6 10 6 10 9 Z" strokeLinejoin="round" />
    </svg>
  ),
  /* The in-game Terminal glyph. */
  stages: glyph('/essential-icons/Stages.webp'),
  /* The four-square grid that used to stand for Stages -- kept for Game Modes,
     which shared the 'stages' key and should keep looking the way it did. */
  grid: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2.5" y="2.5" width="6" height="6" rx="1" />
      <rect x="11.5" y="2.5" width="6" height="6" rx="1" />
      <rect x="2.5" y="11.5" width="6" height="6" rx="1" />
      <rect x="11.5" y="11.5" width="6" height="6" rx="1" />
    </svg>
  ),
  enemies: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 8.5C3 5 6 3 10 3s7 2 7 5.5c0 2.2-.9 3.6-2 4.6V16l-2-1.2L10.5 16 8 14.8 6 16v-2.9C4.9 12.1 3 10.7 3 8.5Z" strokeLinejoin="round" />
      <path d="M7.5 8.5 9 9.7M12.5 8.5 11 9.7" strokeLinecap="round" />
    </svg>
  ),
  base: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2.5" y="7" width="6" height="10" />
      <rect x="11.5" y="2.5" width="6" height="14.5" />
      <rect x="8.5" y="11" width="3" height="6" />
    </svg>
  ),
  planner: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M2.5 15L7.5 9L11 12L17.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 4.5H17.5V9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  calculator: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="4" y="2.5" width="12" height="15" rx="1.5" />
      <rect x="6.8" y="5" width="6.4" height="2.6" rx="0.6" />
      <path d="M7.4 10.6h.01M10 10.6h.01M12.6 10.6h.01M7.4 13.8h.01M10 13.8h.01M12.6 13.8h.01" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  ),
  music: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="6" cy="15" r="2.3" />
      <circle cx="15" cy="13" r="2.3" />
      <path d="M8.3 15 V5.5 L17.3 3.5 V11" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  support: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M10 17S2.5 12.5 2.5 7.2C2.5 4.6 4.5 3 6.7 3c1.4 0 2.6.7 3.3 1.9C10.7 3.7 11.9 3 13.3 3c2.2 0 4.2 1.6 4.2 4.2 0 5.3-7.5 9.8-7.5 9.8Z" strokeLinejoin="round" />
    </svg>
  ),
};

export interface NavLink {
  href: string;
  label: string;
  icon: string;
  /**
   * The route prefix this entry stands for, where that is not its href. Only the
   * Enemies entry needs it: it links to one enemy's page but means the handbook.
   */
  section?: string;
}

export const LINKS: NavLink[] = [
  { href: '/operators', label: 'Operators', icon: 'roster' },
  { href: '/skins', label: 'Skins', icon: 'skins' },
  /* Not in the bar any more: the Events list is a view of the Schedule page. Kept in
     LINKS because the event detail pages still live under /events/, and isActiveLink
     reads this row to light the nav on them. */
  { href: '/events', label: 'Events', icon: 'events' },
  { href: '/farming', label: 'Farming', icon: 'farming' },
  { href: '/stages', label: 'Stages', icon: 'stages' },
  // Straight to the entry page, not to /enemies: that is a server redirect with no
  // page behind it, and linking to it reloaded the app. See lib/enemies/handbookEntry.ts.
  { href: ENEMY_HANDBOOK_HREF, label: 'Enemies', icon: 'enemies', section: ENEMY_HANDBOOK_SECTION },
  { href: '/gamemodes', label: 'Game Modes', icon: 'grid' },
  { href: '/base', label: 'Base', icon: 'base' },
  { href: '/planner', label: 'Planner', icon: 'planner' },
  { href: '/pulls', label: 'Pull Planner', icon: 'calculator' },
  { href: '/community', label: 'Community', icon: 'community' },
  { href: '/gacha', label: 'Gacha', icon: 'gacha' },
  { href: '/recruitment', label: 'Recruitment', icon: 'recruitment' },
  { href: '/results', label: 'Power Scale', icon: 'rate' },
  { href: '/games', label: 'Games', icon: 'grid' },
  { href: '/schedule', label: 'Schedule', icon: 'timeline' },
  { href: '/music', label: 'Music', icon: 'music' },
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
  label: string;
  items: NavLink[];
}

const at = (href: string): NavLink => {
  const link = LINKS.find((l) => l.href === href);
  if (!link) throw new Error(`nav group names a link that is not in LINKS: ${href}`);
  return link;
};

export const GROUPS: NavGroup[] = [
  { label: 'Database', items: [at('/operators'), at('/skins'), at(ENEMY_HANDBOOK_HREF), at('/stages')] },
  { label: 'Guides', items: [at('/farming'), at('/gamemodes'), at('/base'), at('/recruitment'), at('/gacha'), at('/pulls')] },
  { label: 'Community', items: [at('/results'), at('/games'), at('/community'), at('/music')] },
];

/* Not in a menu: one destination each, and a menu of one is a click in front of a
   link. Planner joined them when Base, Recruitment and Gacha moved to Guides and left
   it alone in Planning. Schedule joined them when the Events list became a view of the
   Schedule page rather than a page of its own, which left that menu holding one thing
   too. */
export const LOOSE: NavLink[] = [at('/planner'), at('/schedule'), at('/support')];

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
 * pages count as being in it: router.pathname is the ROUTE, so an enemy page reads
 * "/enemies/[slug]" and never equalled "/enemies" -- which left the nav unlit on
 * every detail page in the site. Home is excluded or "/" would prefix-match
 * everything. Shared with MobileNavDrawer, which had its own copy of this test and
 * disagreed with the desktop nav about which entry was lit.
 */
export function isActiveLink(link: NavLink, pathname: string): boolean {
  if (link.href === '/games') return isGamePath(pathname);
  const section = link.section || link.href;
  return pathname === section || (section !== '/' && pathname.startsWith(`${section}/`));
}

export default function SiteNav({ mobileNav }: { mobileNav?: MobileNavOverride }) {
  const router = useRouter();
  const navRef = useRef<HTMLElement | null>(null);
  /* Which menu is open, by label, or null. One at a time: opening a second closes the
     first, the way a menu bar has always worked. */
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  /**
   * The nav's height, published for sticky page furniture to sit below.
   *
   * It is a constant now. It used to be measured, because the nav had two heights and
   * the difference was 88px of document that appeared and vanished on every scroll.
   * Still measured rather than hardcoded, since the value belongs to the CSS and this
   * would go stale the first time the padding changed, but it no longer moves.
   *
   * Below 900px this nav is display:none and measures 0. Publishing that zero told
   * every consumer there was no nav at all while MobileNavDrawer's own 52px bar sat
   * fixed over the page, so anchor targets landed underneath it. The mobile bar
   * publishes its own height and also skips zero, so crossing the breakpoint settles
   * correctly whichever observer fires first.
   */
  const [navHeight, setNavHeight] = useState(0);
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const update = () => {
      const h = el.offsetHeight;
      setNavHeight(h);
      if (h > 0) document.documentElement.style.setProperty('--nav-h', `${h}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => { ro.disconnect(); window.removeEventListener('resize', update); };
  }, []);

  /* A click anywhere outside closes the open menu. 'click' and not 'mousedown':
     mousedown fires before mouseup, so closing on it would move whatever was being
     clicked out from under the cursor before the click landed on it. */
  useEffect(() => {
    if (!openMenu) return;
    const onClick = (e: MouseEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setOpenMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpenMenu(null);
      /* Back to the button that opened it, or focus is left on a element that has just
         stopped existing and the next Tab starts from the top of the page. */
      navRef.current?.querySelector<HTMLButtonElement>(`[data-menu="${openMenu}"]`)?.focus();
    };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [openMenu]);

  /* Following a link closes the menu it was in. The route change is what matters, not
     the click: a browser back button that returns to a page leaves no click behind. */
  useEffect(() => {
    const close = () => setOpenMenu(null);
    router.events.on('routeChangeStart', close);
    return () => router.events.off('routeChangeStart', close);
  }, [router.events]);

  const renderLink = (link: NavLink, className: string) => (
    <Link
      prefetch={false}
      key={link.href}
      href={link.href}
      className={isActiveLink(link, router.pathname) ? `${className} active` : className}
    >
      <span className="site-nav-icon" aria-hidden="true">{ICONS[link.icon]}</span>
      <span>{link.label}</span>
    </Link>
  );

  return (
    <>
      <nav ref={navRef} className="site-nav">
        <div className="site-nav-inner">
          <Link prefetch={false} href="/" className="site-brand">
            {getEssentialIconPath('Arkpedia') ? (
              <Image src={getEssentialIconPath('Arkpedia')!} alt="Arkpedia" width={26} height={26} className="site-brand-mark-img" />
            ) : (
              <span className="site-brand-mark">A</span>
            )}
            <span className="site-brand-text">ARKPEDIA</span>
            <span className="site-brand-beta">Beta</span>
          </Link>

          <div className="site-nav-links">
            {GROUPS.map((group) => {
              const open = openMenu === group.label;
              /* The menu lights when the page being read is one of its own. */
              const holdsCurrent = group.items.some((l) => isActiveLink(l, router.pathname));
              return (
                <div key={group.label} className="site-nav-menu">
                  <button
                    type="button"
                    data-menu={group.label}
                    className={`site-nav-trigger${holdsCurrent ? ' active' : ''}${open ? ' open' : ''}`}
                    aria-haspopup="menu"
                    aria-expanded={open}
                    onClick={() => setOpenMenu(open ? null : group.label)}
                  >
                    {group.label}
                    <svg className="site-nav-chev" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" width="11" height="11" aria-hidden="true">
                      <path d="M5 8 L10 13 L15 8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {/* Absolutely positioned, never in flow: a panel that pushed the page
                      down would be the layout shift this rework exists to remove. */}
                  {open && (
                    <div className="site-nav-pop" role="menu" aria-label={group.label}>
                      {group.items.map((l) => renderLink(l, 'site-nav-popitem'))}
                    </div>
                  )}
                </div>
              );
            })}

            {LOOSE.map((l) => renderLink(l, 'site-nav-link'))}
          </div>

          {/* Carries the margin-left:auto that used to sit on the theme wrap. Only one
              element in the row may have it: two auto margins split the free space
              between them and the clock ends up floating in the middle of the bar. */}
          <ServerClock variant="bar" />

          <div className="site-nav-theme-wrap">
            <ThemeToggle />
          </div>
        </div>
      </nav>
      {/* Holds the fixed nav's place in flow. One height now, so it never changes size
          under the reader. Hidden on mobile, where MobileNavDrawer has its own. */}
      <div className="site-nav-spacer" style={{ height: navHeight }} aria-hidden="true" />

      <MobileNavDrawer mobileNav={mobileNav} />
    </>
  );
}
