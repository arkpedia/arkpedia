import Link from 'next/link';
import { useClientLayoutEffect } from '@/lib/ui/useClientLayoutEffect';
import Image from '@/components/content/ContentImage';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import HeaderUtilities from './HeaderUtilities';
import { type SiteSearchControl } from './SiteSearch';
import { GROUPS, LOOSE, ICONS, isActiveLink, type NavLink } from './Sitenav';
import ServerClock from './ServerClock';
import { getEssentialIconPath } from '@/lib/operators/operatorIconPaths';
import type { MobileNavOverride } from '@/lib/nav/mobileNavOverride';
import { useChangelogUnseen } from '@/lib/changelog/seen';

// The drawer renders on the server with every page: there a layout effect only warns.

// Only relevant near the left screen edge -- an edge-swipe is the
// standard mobile-drawer "open" gesture, and restricting it to the
// edge (rather than anywhere on screen) avoids hijacking ordinary
// horizontal swipes/scrolls happening in the middle of the page (e.g.
// a horizontally-scrolling carousel).
const EDGE_OPEN_THRESHOLD_PX = 30;
// Minimum horizontal distance, and horizontal-dominant-over-vertical,
// before a touch counts as a deliberate swipe rather than an
// incidental wobble or a vertical scroll.
const SWIPE_DISTANCE_PX = 60;

// Elements inside the top bar that should handle their own tap
// instead of also opening the drawer as a side effect. .mobile-nav-back is the back
// link a page can put where the brand normally is: without it here, tapping Back
// navigates AND flings the drawer open over the page you are arriving at. Every link and button
// is excluded rather than each by name: the clock's server switch (ServerClock) is a button in
// the bar, and naming them one by one let it open the drawer as well as switch the server.
const BAR_TAP_EXCLUDED_SELECTOR = 'a, button, .site-nav-theme-wrap, .site-search';

export default function MobileNavDrawer({ mobileNav, search }: { mobileNav?: MobileNavOverride; search: SiteSearchControl }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  /* Which of the drawer's sections is unfolded: one at a time. Each time the drawer opens, the section
     holding the current page is the one open, so the reader sees where they are and the rest of the
     menu is five headings, not twenty-odd links; opening another folds the open one away. */
  const [unfolded, setUnfolded] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const here = GROUPS.find((group) => group.items.some((link) => isActiveLink(link, router.pathname)));
    setUnfolded(here ? here.id : null);
  }, [open, router.pathname]);
  const changelogUnseen = useChangelogUnseen();
  /* Folding the open section away moves the heading the reader just pressed up the drawer, under
     their finger (the Anti-Page Jump rule): the heading's place on screen is taken in the handler and
     the drawer scrolled back to it before the browser paints. */
  const keepInPlace = useRef<{ element: HTMLElement; top: number } | null>(null);
  const toggleGroup = (id: string, heading: HTMLElement) => {
    keepInPlace.current = { element: heading, top: heading.getBoundingClientRect().top };
    setUnfolded((previous) => (previous === id ? null : id));
  };
  useClientLayoutEffect(() => {
    const held = keepInPlace.current;
    keepInPlace.current = null;
    const drawer = drawerRef.current;
    if (!held || !drawer) return;
    const moved = held.element.getBoundingClientRect().top - held.top;
    if (moved) drawer.scrollTop += moved;
  }, [unfolded]);

  // Dialog behavior for the drawer: Escape closes; focus moves to the first
  // link on open and back to the menu button on close; Tab wraps within the
  // drawer while it's open, since the page behind the overlay is still in
  // the DOM and would otherwise be reachable blind.
  useEffect(() => {
    if (!open) return;
    const drawer = drawerRef.current;
    // Only what is on screen: a folded section's links are in the page but hidden.
    const focusables = () => Array.from(
      drawer?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? [],
    ).filter((el) => el.getClientRects().length > 0);
    focusables()[0]?.focus();
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        menuBtnRef.current?.focus();
        return;
      }
      if (e.key !== 'Tab') return;
      const els = focusables();
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !drawer?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !drawer?.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  // The mobile counterpart to Sitenav's --nav-h. Whichever nav is actually on
  // screen owns the variable, and both skip a zero measurement, so the hidden
  // one never overwrites the visible one's value -- which matters at the 900px
  // boundary, where an iPad rotation runs both observers and the order is not
  // ours to choose. Measured rather than hardcoded to 52: nav.css owns that
  // number, and a stylesheet edit should not silently desync the variable.
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const update = () => {
      const h = el.offsetHeight;
      if (h > 0) document.documentElement.style.setProperty('--nav-h', `${h}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  // Locks background scroll while the drawer is open -- standard
  // drawer/modal behavior, so scrolling the page underneath isn't
  // possible while it's covered by the dimmed overlay.
  useEffect(() => {
    if (!open) return;
    // Put back whatever was there: a page may hold its own lock (the stage guesser
    // while typing), which clearing to '' used to lift.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  // Closes automatically on navigation -- belt-and-suspenders on top
  // of each link's own onClick already closing it, in case something
  // navigates without going through a link click (e.g. browser
  // back/forward).
  useEffect(() => {
    function handleRouteChange() {
      setOpen(false);
    }
    router.events.on('routeChangeComplete', handleRouteChange);
    return () => router.events.off('routeChangeComplete', handleRouteChange);
  }, [router.events]);

  // Swipe-right-from-the-left-edge opens; swipe-left (anywhere, while
  // open) closes. No external gesture library -- just raw touchstart/
  // touchend deltas, which is all a single-direction open/close swipe
  // actually needs.
  useEffect(() => {
    function handleTouchStart(e: TouchEvent) {
      const t = e.touches[0];
      touchStartRef.current = { x: t.clientX, y: t.clientY };
    }
    function handleTouchEnd(e: TouchEvent) {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      // Not a deliberate horizontal swipe -- too short, or more
      // vertical than horizontal (a scroll, not a swipe).
      if (Math.abs(dx) < SWIPE_DISTANCE_PX || Math.abs(dx) < Math.abs(dy)) return;

      if (!open && dx > 0 && start.x <= EDGE_OPEN_THRESHOLD_PX) {
        setOpen(true);
      } else if (open && dx < 0) {
        setOpen(false);
      }
    }
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [open]);

  const logoPath = getEssentialIconPath('Arkpedia');

  return (
    <>
      {/* Top bar -- brand + theme toggle only, no lock/collapse button
          (those are desktop-only concepts). Tapping anywhere else on
          the bar opens the drawer.

          The clock rides at the end of the row rather than in a sliver above it. It
          had a sliver of its own for one afternoon; two rows of fixed chrome is 22px
          of every screen on the site, and the clock is small enough to sit in the row
          that was already there.

          A page can swap the left of this bar for a back link and cut the clock down
          to the countdown -- the Stronghold companion does, because on a phone that
          page IS the companion and the top of it should say how long is left in the
          run rather than the name of the website. Same element either way: barRef, the
          ResizeObserver behind --nav-h, the spacer and the view-transition layer all
          hang off it, and a second bar would need a second copy of every one. */}
      <div
        ref={barRef}
        className={`mobile-nav-bar${mobileNav ? ' mobile-nav-bar-override' : ''}`}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest(BAR_TAP_EXCLUDED_SELECTOR)) return;
          setOpen(true);
        }}
      >
        {/* The menu button leads the bar, on the side the drawer slides in from. */}
        <button
          ref={menuBtnRef}
          type="button"
          className="mobile-nav-menu-btn"
          aria-label="Open navigation menu"
          aria-expanded={open}
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" width="18" height="18" aria-hidden="true">
            <path d="M3 5.5 H17 M3 10 H17 M3 14.5 H17" strokeLinecap="round" />
          </svg>
        </button>
        {mobileNav ? (
          <Link prefetch={false} href={mobileNav.back.href} className="mobile-nav-back">
            <span className="mobile-nav-back-chev" aria-hidden="true">&lsaquo;</span>
            {mobileNav.back.label}
          </Link>
        ) : (
          <Link prefetch={false} href="/" className="site-brand" aria-label="Arkpedia home">
            {logoPath ? (
              <Image src={logoPath} alt="Arkpedia" width={24} height={24} className="site-brand-mark-img" />
            ) : (
              <span className="site-brand-mark">A</span>
            )}
            <span className="site-brand-text">ARKPEDIA</span>
          </Link>
        )}
        {/* The same clock either way. The override bar carried the countdown alone
            for a while, on the grounds that a reader mid-run wants the time left and
            not the time -- true, and not worth having one page's clock be a different
            clock. It fits: the back label ellipsises long before the strip has to. */}
        <HeaderUtilities search={search} mobile />
      </div>
      {/* Holds the fixed bar's place. Its height is --nav-h, measured off the bar by
          the effect above rather than the 52 it used to hardcode on the grounds that
          the bar's height never changes. It changed twice in one day. */}
      <div className="mobile-nav-spacer" aria-hidden="true" />

      {open && <div className="mobile-nav-overlay" onClick={() => setOpen(false)} />}

      <div
        ref={drawerRef}
        className={`mobile-nav-drawer${open ? ' open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Site navigation"
      >
        <div className="mobile-nav-drawer-header">
          <Link prefetch={false} href="/" className="site-brand" onClick={() => setOpen(false)}>
            {logoPath ? (
              <Image src={logoPath} alt="Arkpedia" width={24} height={24} className="site-brand-mark-img" />
            ) : (
              <span className="site-brand-mark">A</span>
            )}
            <span className="site-brand-text">ARKPEDIA</span>
          </Link>
          {/* In the drawer's header rather than the 52px bar above it. That bar is
              already brand, menu button and theme toggle across a phone's width, while
              the header is a column with room for the strip on one line. */}
          <ServerClock variant="drawer" />
        </div>
        <div className="mobile-nav-drawer-links">
          {/* The desktop bar's own menus, as sections that fold (GROUPS), then its loose
              links (LOOSE): the same destinations, grouped the same way, and a short list
              until a section is opened. */}
          {GROUPS.map((group) => {
            const isOpen = unfolded === group.id;
            const holdsCurrent = group.items.some((link) => isActiveLink(link, router.pathname, router.asPath));
            return (
              <div key={group.id} className="mobile-nav-group">
                <button
                  type="button"
                  className={`mobile-nav-group-head${holdsCurrent ? ' current' : ''}`}
                  aria-expanded={isOpen}
                  aria-controls={`mobile-nav-group-${group.id}`}
                  onClick={(event) => toggleGroup(group.id, event.currentTarget)}
                >
                  <span>{group.label}</span>
                  <span className="nav-menu-indicator" aria-hidden="true">
                  {changelogUnseen && group.items.some((link) => link.href === "/whats-new") ? <span className="nav-new-dot" /> : <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className="mobile-nav-group-chev">
                    <path d={isOpen ? 'M5 12.5 10 7.5 15 12.5' : 'M5 7.5 10 12.5 15 7.5'} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>}
                  </span>
                </button>
                {/* Folded, not removed: the links stay in the page (hidden), for crawlers and
                    for the nav's release-pinned art, which the content runtime test reads. */}
                <div id={`mobile-nav-group-${group.id}`} className="mobile-nav-group-links" hidden={!isOpen}>
                  {group.items.map((link) => <DrawerLink key={link.href} link={link} active={isActiveLink(link, router.pathname, router.asPath)} divider={group.dividersAfter?.includes(link.href)} isNew={link.href === "/whats-new" && changelogUnseen} onPick={() => setOpen(false)} />)}
                </div>
              </div>
            );
          })}
          <div className="mobile-nav-loose">
            {LOOSE.map((link) => <DrawerLink key={link.href} link={link} active={isActiveLink(link, router.pathname, router.asPath)} onPick={() => setOpen(false)} />)}
          </div>
        </div>
      </div>
    </>
  );
}
/** One destination in the drawer: its icon and its name, lit when it is the page on screen. */
function DrawerLink({ link, active, isNew = false, divider = false, onPick }: { link: NavLink; active: boolean; isNew?: boolean; divider?: boolean; onPick: () => void }) {
  return (
    <Link prefetch={false} href={link.href} className={`mobile-nav-drawer-link${active ? ' active' : ''}${divider ? ' nav-group-end' : ''}`} onClick={onPick}>
      <span className="site-nav-icon" aria-hidden="true">{ICONS[link.icon]}</span>
      <span>{link.label}</span>
      {isNew && <span className="nav-new-dot" aria-label="New" />}
    </Link>
  );
}
