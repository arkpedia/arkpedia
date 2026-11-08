import { queuePanelHref } from '@/lib/music/queuePanelHref';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useRef } from 'react';
import { useClientLayoutEffect } from '@/lib/ui/useClientLayoutEffect';
import MusicQueue from './MusicQueue';

export default function QueuePanel() {
  const router = useRouter();
  const opened = router.query.panel === 'queue' && router.query.view !== 'queue';
  const close = useRef<HTMLAnchorElement>(null);
  const panel = useRef<HTMLElement>(null);
  useClientLayoutEffect(() => {
    if (!opened) return;
    const trigger = document.activeElement;
    const mobile = window.matchMedia('(max-width: 999px)');
    const content = close.current?.closest('main')?.querySelector<HTMLElement>('.music-workspace-content');
    const toggle = document.getElementById('music-transport-queue');
    const sync = () => {
      if (content) content.inert = mobile.matches;
      if (!mobile.matches && toggle) panel.current?.style.setProperty('--queue-anchor-x', toggle.getBoundingClientRect().left + 'px');
    };
    let returnFocus = true;
    const outside = (event: MouseEvent) => {
      const target = event.target;
      if (mobile.matches || event.defaultPrevented || !(target instanceof Element) || (panel.current && event.composedPath().includes(panel.current))) return;
      if (target.closest('.music-player-bottombar, [role="dialog"], [role="menu"], a[href]')) return;
      returnFocus = false;
      close.current?.click();
    };
    sync();
    window.addEventListener('resize', sync);
    document.addEventListener('click', outside);
    close.current?.focus({ preventScroll: true });
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const nested = event.target instanceof Element && event.target.closest('[role="dialog"], dialog');
      if (nested && nested !== panel.current) return;
      close.current?.click();
    };
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', sync);
      document.removeEventListener('click', outside);
      if (content) content.inert = false;
      if (returnFocus) (trigger instanceof HTMLElement && trigger.isConnected && trigger !== document.body ? trigger : toggle)?.focus({ preventScroll: true });
    };
  }, [opened]);
  if (!opened) return null;
  return <aside ref={panel} id="music-queue-popup" role="dialog" className="music-queue-drawer panel" aria-label="Playback queue">
    <MusicQueue shown close={<Link ref={close} className="ghost btn-sm music-queue-close" href={queuePanelHref(router, false)} shallow replace scroll={false}>Close queue</Link>} />
  </aside>;
}
