import Link from 'next/link';
import ModeMark from '@/components/stages/ModeMark';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { useNavOffset } from '@/lib/hooks/useNavOffset';

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
 * Under 1040px the row becomes a menu. Seven tabs do not fit a phone, and a
 * sideways-scrolling bar hides most of them behind a gesture with nothing to say it is
 * there -- so the bar shows the section you are IN, and the button opens the rest. Not
 * at the site nav's 900px: the row needs 967px in Rajdhani, which the frame has only
 * from a 1040px window, and it is one row or a menu, never two rows
 * (styles/stages/stages-terminal.css).
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
  /* Where the bar sticks: directly under the site nav, which is `position: fixed`
     and changes height when it collapses on scroll (lib/hooks/useNavOffset). */
  const bar = useRef<HTMLElement | null>(null);
  const top = useNavOffset();

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

        {/* The site's tab look (.tabs / .tab in arkpedia-theme.css), on links: these
            move between routes, so they are <a aria-current="page">, not role="tab".
            Packed from the frame's left edge like every tab strip -- the row was
            centred, which put TERMINAL 27px right of the eyebrow and h1 under it. */}
        <div className={`tabs terminal-tabs${open ? ' open' : ''}`}>
        {TERMINAL_SECTIONS.map((s) => {
          const active = s.key === current || (s.href && s.href === pathname);
          if (!s.href) {
            return (
              <span key={s.key} className="tab" aria-disabled="true" title="Not built yet">
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
              className="tab"
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
