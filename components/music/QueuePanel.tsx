import { isQueuePanelOpen, queuePanelHref } from '@/lib/music/queuePanelHref';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useClientLayoutEffect } from '@/lib/ui/useClientLayoutEffect';
import MusicQueue from './MusicQueue';
import { openMusicPlayer, usePlayerVisibility } from '@/lib/music/playerVisibility';

export default function QueuePanel() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useClientLayoutEffect(() => setMounted(true), []);
  const opened = mounted && isQueuePanelOpen(router);
  const visibility = usePlayerVisibility();
  const close = useRef<HTMLAnchorElement>(null);
  const panel = useRef<HTMLElement>(null);
  useClientLayoutEffect(() => {
    if (!opened) return;
    openMusicPlayer();
    const trigger = document.activeElement;
    const mobile = window.matchMedia('(max-width: 999px)');
    const content = document.querySelector<HTMLElement>('.music-workspace-content') ?? document.getElementById('page-content');
    const toggle = document.getElementById('music-transport-queue');
    const sync = () => {
      if (content) content.inert = mobile.matches;
      if (!mobile.matches && toggle) panel.current?.style.setProperty('--queue-anchor-x', toggle.getBoundingClientRect().left + 'px');
    };
    let returnFocus = true;
    let nestedDismissal = false;
    const nestedPopupOpen = () => [...document.querySelectorAll<HTMLElement>('[role="dialog"], [role="menu"]')]
      .some(element => element !== panel.current && element.getClientRects().length > 0 && getComputedStyle(element).visibility === 'visible' && !element.closest('[hidden], [inert], [aria-hidden="true"]'));
    const pointerDown = () => {
      // A gesture that dismisses a song menu belongs to that menu, even if it
      // unmounts before the document receives the ensuing click.
      nestedDismissal = nestedPopupOpen();
    };
    const outside = (event: MouseEvent) => {
      const target = event.target;
      const dismissingNested = nestedDismissal;
      nestedDismissal = false;
      if (dismissingNested || mobile.matches || event.defaultPrevented || !(target instanceof Element) || (panel.current && event.composedPath().includes(panel.current))) return;
      if (event.composedPath().some(element => element instanceof Element && element.matches('.music-player-bottombar, .music-floating-toggle, [role="dialog"], [role="menu"], a[href]'))) return;
      returnFocus = false;
      close.current?.click();
    };
    sync();
    window.addEventListener('resize', sync);
    document.addEventListener('pointerdown', pointerDown, true);
    document.addEventListener('click', outside);
    close.current?.focus({ preventScroll: true });
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || nestedPopupOpen()) return;
      if (event.composedPath().some(element => element instanceof Element && element !== panel.current && element.matches('[role="dialog"], dialog'))) return;
      // Drag cancellation runs at window level; let it consume Escape first.
      window.setTimeout(() => { if (!event.defaultPrevented) close.current?.click(); }, 0);
    };
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', sync);
      document.removeEventListener('pointerdown', pointerDown, true);
      document.removeEventListener('click', outside);
      if (content) content.inert = false;
      if (returnFocus) (trigger instanceof HTMLElement && trigger.isConnected && trigger !== document.body && trigger.getClientRects().length ? trigger : toggle)?.focus({ preventScroll: true });
    };
  }, [opened, visibility, router.pathname]);
  if (!opened) return null;
  return createPortal(<aside ref={panel} id="music-queue-popup" role="dialog" className="music-queue-drawer panel" aria-label="Playback queue">
    <MusicQueue shown close={<Link ref={close} className="ghost btn-sm music-queue-close" href={queuePanelHref(router, false)} shallow replace scroll={false}>Close queue</Link>} />
  </aside>, document.body);
}
