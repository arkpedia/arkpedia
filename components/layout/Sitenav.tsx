import { ICONS } from './NavIcons';
export { ICONS } from './NavIcons';
import Link from 'next/link';
import Image from '@/components/content/ContentImage';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import HeaderUtilities from './HeaderUtilities';
import SiteSearchDialog, { useSiteSearchControl } from './SiteSearch';
import MobileNavDrawer from './MobileNavDrawer';
import type { MobileNavOverride } from '@/lib/nav/mobileNavOverride';
import { getEssentialIconPath } from '@/lib/operators/operatorIconPaths';
import { GROUPS, LOOSE, isActiveLink, type NavLink } from '@/lib/nav/navLinks';
import { useChangelogUnseen } from '@/lib/changelog/seen';

/* The registry of destinations -- LINKS, the menus, the loose links, NAV_ORDER and which
   entry is lit -- is plain data in lib/nav/navLinks.ts, so a test can check every href
   against the pages and the redirects without rendering the bar. */
export { GROUPS, LOOSE, isActiveLink, type NavLink } from '@/lib/nav/navLinks';

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

  // A dot on What's new, and on the menu holding it, until the latest entry has been read.
  const changelogUnseen = useChangelogUnseen();
  const search = useSiteSearchControl();
  const renderLink = (link: NavLink, className: string, iconOnly = false) => (
    <Link
      prefetch={false}
      key={link.href}
      href={link.href}
      title={iconOnly ? link.label : undefined}
      className={`${className}${iconOnly ? ' site-nav-link-icon-only' : ''}${isActiveLink(link, router.pathname) ? ' active' : ''}`}
    >
      <span className="site-nav-icon" aria-hidden="true">{ICONS[link.icon]}</span>
      <span className={iconOnly ? 'visually-hidden' : undefined}>{link.label}</span>
      {link.href === "/whats-new" && changelogUnseen && <span className="nav-new-dot" aria-label="New" />}
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
              const open = openMenu === group.id;
              const label = group.label;
              /* The menu lights when the page being read is one of its own. */
              const holdsCurrent = group.items.some((l) => isActiveLink(l, router.pathname));
              return (
                <div key={group.id} className="site-nav-menu">
                  <button
                    type="button"
                    data-menu={group.id}
                    className={`site-nav-trigger${holdsCurrent ? ' active' : ''}${open ? ' open' : ''}`}
                    aria-controls={open ? `site-nav-${group.id}` : undefined}
                    aria-expanded={open}
                    onClick={() => setOpenMenu(open ? null : group.id)}
                  >
                    {label}
                    <span className="nav-menu-indicator" aria-hidden="true">
                    {changelogUnseen && group.items.some((l) => l.href === "/whats-new") ? <span className="nav-new-dot" /> : <svg className="site-nav-chev" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" width="11" height="11" aria-hidden="true">
                      <path d="M5 8 L10 13 L15 8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>}
                    </span>
                  </button>
                  {/* Absolutely positioned, never in flow: a panel that pushed the page
                      down would be the layout shift this rework exists to remove. */}
                  {open && (
                    <div id={`site-nav-${group.id}`} className="site-nav-pop" aria-label={label}>
                      {group.items.map((l) => renderLink(l, `site-nav-popitem${group.dividersAfter?.includes(l.href) ? ' nav-group-end' : ''}`))}
                    </div>
                  )}
                </div>
              );
            })}

            {LOOSE.map((l) => renderLink(l, 'site-nav-link', l.href === '/support'))}
          </div>

          <HeaderUtilities search={search} onOpen={() => setOpenMenu(null)} />
        </div>
      </nav>
      {/* Holds the fixed nav's place in flow. One height now, so it never changes size
          under the reader. Hidden on mobile, where MobileNavDrawer has its own. */}
      <div className="site-nav-spacer" style={{ height: navHeight }} aria-hidden="true" />

      <MobileNavDrawer mobileNav={mobileNav} search={search} />
      {/* One pop-up for both bars and the keyboard (Ctrl/Cmd+K, "/"). */}
      <SiteSearchDialog control={search} />
    </>
  );
}
