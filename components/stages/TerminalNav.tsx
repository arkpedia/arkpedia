import Link from 'next/link';
import ModeMark from '@/components/stages/ModeMark';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';

/**
 * The Terminal's section bar, the way the game puts it: a row of hexagonal marks
 * along the bottom of the screen, the current one lifted and named.
 *
 * The game's Terminal is five scenes rather than one list, and this is how it moves
 * between them. Sections not built yet render locked -- which is the game's own
 * idiom for a panel you cannot enter (Seasonal Challenge draws its unopened slots
 * exactly that way) rather than a promise in a comment.
 *
 * The marks are the game's own emblems, painted as masks so the current tab's teal
 * reaches them; they are drawn larger than the label because line art this fine is a
 * smudge at 10px.
 *
 * Under the site's own mobile breakpoint the row becomes a menu. Seven tabs do not fit
 * a phone, and a sideways-scrolling bar hides most of them behind a gesture with
 * nothing to say it is there -- so the bar shows the section you are IN, and the
 * button opens the rest. Same 900px the site switches its own nav at, so the two
 * change together.
 */
export interface TerminalSection {
  key: string;
  label: string;
  href?: string;
  /** The section's emblem in public/mode-marks/, drawn as a mask. */
  mark?: string;
  /** Drawn instead, for the two sections no emblem exists for. */
  glyph?: string;
}

export const TERMINAL_SECTIONS: TerminalSection[] = [
  // The game's own order down the Terminal's left rail, which is what a reader who has
  // the game open is looking for. All Operations is last because it is ours rather than
  // the game's -- there is no such panel in the Terminal.
  //
  // Terminal is the board itself and All Operations is ours, so neither has an emblem in
  // the set; those two keep a glyph. Long-Term Exploration takes Integrated Strategies'
  // mark and Seasonal Challenge takes Contingency Contract's -- the mode each of those
  // scenes leads with.
  { key: 'terminal', label: 'Terminal', href: '/stages', glyph: '◈' },
  { key: 'score', label: 'Score', href: '/stages/score', mark: 'score.svg' },
  { key: 'supplies', label: 'Supplies', href: '/stages/supplies', mark: 'supplies.svg' },
  { key: 'regular', label: 'Regular Tasks', href: '/stages/regular', mark: 'regular-tasks.svg' },
  { key: 'exploration', label: 'Long-Term Exploration', href: '/stages/exploration', mark: 'integrated-strategies.svg' },
  { key: 'seasonal', label: 'Seasonal Challenge', href: '/stages/seasonal', mark: 'contingency-contract.svg' },
  { key: 'all', label: 'All Operations', href: '/stages/all', glyph: '▤' },
];

/** A section's emblem, or its stand-in glyph. */
function Mark({ section }: { section: TerminalSection }) {
  if (section.mark) return <ModeMark name={section.mark} className="terminal-tab-mark" />;
  return <span className="terminal-tab-mark" aria-hidden="true">{section.glyph}</span>;
}

export default function TerminalNav({ current }: { current: string }) {
  const { pathname } = useRouter();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement | null>(null);

  // Picking a section navigates, so the menu closes itself on arrival rather than
  // needing every link to remember to.
  useEffect(() => { setOpen(false); }, [pathname]);

  // Escape, and a press anywhere else. Same shape as StagePicker's popover.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onDown = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);
  /**
   * Where the bar sticks: directly under the site nav, which is `position: fixed`
   * and changes height when it collapses on scroll.
   *
   * Measured here rather than read from the --nav-h variable Sitenav publishes,
   * because that variable lags the collapse -- it reads 141px while the nav is
   * actually 58px tall, which would leave the bar stuck 83px below the nav with a
   * gap for the page to scroll through. Whatever is fixed at the top of the viewport
   * right now is what this asks.
   */
  const bar = useRef<HTMLElement | null>(null);
  const [top, setTop] = useState<number | null>(null);
  useEffect(() => {
    const measure = () => {
      // Every candidate, not the first one: BOTH navs are in the DOM at all times and
      // the CSS hides one of them, so querySelector -- which answers in document order
      // -- returned the desktop nav on a phone. Hidden, its rect is all zeros, so the
      // bar was told to stick at 0 and spent the whole page underneath the mobile
      // nav, which is fixed, 52px tall and sits at z-index 60 to this bar's 30. It was
      // sticky the entire time; it was just stuck out of sight.
      let under = 0;
      for (const nav of document.querySelectorAll('.site-nav, .mobile-nav-bar')) {
        const box = nav.getBoundingClientRect();
        // Not rendered at this width, so there is nothing there to sit under.
        if (box.height === 0) continue;
        // Only a nav actually AT the top counts -- one that has scrolled away is
        // nothing to sit under either.
        if (box.top > 1) continue;
        under = Math.max(under, Math.round(box.bottom));
      }
      setTop(under);
    };
    measure();
    const onScroll = () => requestAnimationFrame(measure);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure);
    // The nav collapses with a padding transition, so its height mid-animation is not
    // its height -- measure again once it has settled.
    document.addEventListener('transitionend', measure);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
      document.removeEventListener('transitionend', measure);
    };
  }, []);

  // What the collapsed bar names. `current` is what the page says it is; the pathname
  // is the fallback, and Terminal is the fallback's fallback -- a bar that named
  // nothing would be a button with no label on it.
  const here = TERMINAL_SECTIONS.find((s) => s.key === current)
    ?? TERMINAL_SECTIONS.find((s) => s.href === pathname)
    ?? TERMINAL_SECTIONS[0];

  return (
    <nav
      ref={bar}
      className="terminal-bar"
      aria-label="Terminal sections"
      style={top == null ? undefined : { top: `${top}px` }}
    >
      <div className="terminal-bar-inner" ref={menu}>
        {/* Mobile only, and it comes FIRST so the section you are in is the thing you
            read: the button is the current tab, wearing its own emblem, and opening it
            drops the rest of the list under the bar. */}
        <button
          type="button"
          className="terminal-bar-toggle"
          aria-haspopup="true"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <Mark section={here} />
          <span className="terminal-tab-label">{here.label}</span>
          <span className="terminal-bar-burger" aria-hidden="true" />
        </button>

        <div className={`terminal-tabs${open ? ' open' : ''}`}>
        {TERMINAL_SECTIONS.map((s) => {
          const active = s.key === current || (s.href && s.href === pathname);
          if (!s.href) {
            return (
              <span key={s.key} className="terminal-tab locked" aria-disabled="true" title="Not built yet">
                <Mark section={s} />
                <span className="terminal-tab-label">{s.label}</span>
              </span>
            );
          }
          return (
            <Link prefetch={false}
              key={s.key}
              href={s.href}
              /* scroll={false} for the same reason the stage rail has it: these are
                 sections of one screen, not separate documents. */
              scroll={false}
              className={`terminal-tab${active ? ' current' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <Mark section={s} />
              <span className="terminal-tab-label">{s.label}</span>
            </Link>
          );
        })}
        </div>
      </div>
    </nav>
  );
}
