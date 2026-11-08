import { queuePanelHref } from '@/lib/music/queuePanelHref';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useRef, type ReactNode } from 'react';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { createPortal } from 'react-dom';
import { useAnchoredPopover } from '@/components/ui/useAnchoredPopover';
import { useMusicPlayer } from '@/lib/music/musicPlayerContext';
import TransportIcon from './TransportIcons';
import { queuePlaybackPositions } from '@/lib/music/musicPolish';

export type MusicView = 'discover' | 'library' | 'player' | 'queue';

/** The address of each part of the music section: Discover is its own page, the other three are
 *  views of /music (?view=), pushed into the history so Back and Forward step between them. */
export const MUSIC_VIEW_HREF: Record<MusicView, string> = {
  discover: '/music/discover',
  library: '/music?view=library',
  player: '/music?view=player',
  queue: '/music?view=queue',
};

/**
 * Shared music navigation, opened beneath the hamburger button on phones: Discover (browse by
 * album, character, artist), Library (every song, searchable, which never changes the queue by
 * itself), Now playing (the song, its credits and lyrics) and Queue (what plays next). The
 * navigation uses ordinary links, not a tablist: each is an
 * address. Shallow links within /music, so the player and its audio carry on untouched.
 */
export default function MusicNav({ current, children, open, onOpenChange }: { current: MusicView; children?: ReactNode | ((returnFocus: () => void) => ReactNode); open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const mobile = useMediaQuery('(max-width: 999px)');
  const trigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { trigger.current = document.querySelector<HTMLButtonElement>('[aria-label="Music menu"]'); });
  useEffect(() => { if (!mobile) onOpenChange(false); }, [mobile, onOpenChange]);
  const { queue, queueIndex, videoId, autoplayVideoId, queued, shuffle, shuffleOrder, shufflePosition, favorites } = useMusicPlayer();
  const panelOpen = router.query.panel === 'queue';
  const favouritesSelected = current === 'library' && router.query.scope === 'favorites';
  useEffect(() => { onOpenChange(false); }, [current, favouritesSelected, onOpenChange]);
  const order = shuffle && shuffleOrder ? shuffleOrder : queue.map((_, index) => index);
  const { boundary } = queuePlaybackPositions({ queue, queueIndex, position: shuffle && shuffleOrder ? shufflePosition : queueIndex, videoId, autoplayVideoId, queued });
  const upcoming = Math.max(0, order.length - boundary - 1);
  // Count the upcoming sections only; Played earlier stays history during library autoplay.
  const items: { view: MusicView; label: string; count?: number }[] = [
    { view: 'discover', label: 'Discover' },
    { view: 'library', label: 'Library' },
    { view: 'player', label: 'Now playing' },
    { view: 'queue', label: 'Queue', count: upcoming || undefined },
  ];
  const sidebar = (
    <aside className="music-workspace-rail">
      <span className="music-workspace-label">Sound archive</span>
      <nav className="music-nav" aria-label="Music" onClick={event => { if ((event.target as HTMLElement).closest('a')) onOpenChange(false); }}>
        {items.map(({ view, label, count }) => (
          <Link key={view} href={view === 'queue' && current !== 'queue' ? queuePanelHref(router, !panelOpen) : MUSIC_VIEW_HREF[view]} prefetch={false} shallow={view === 'queue' || (view !== 'discover' && current !== 'discover')} scroll={false}
            className="music-workspace-link" aria-current={(panelOpen ? view === 'queue' : view === current && !favouritesSelected) ? 'page' : undefined}>
            <TransportIcon name={view === 'discover' ? 'note' : view === 'library' ? 'library' : view === 'queue' ? 'queue' : 'nowPlaying'} />
            <span>{label}</span>
            {count !== undefined && <span className="music-workspace-count"><span className="visually-hidden">, </span>{count}<span className="visually-hidden"> chosen songs next</span></span>}
          </Link>
        ))}
        <Link href="/music?view=library&scope=favorites" prefetch={false} shallow={current !== 'discover'} scroll={false}
          className="music-workspace-link" aria-current={favouritesSelected && !panelOpen ? 'page' : undefined}>
          <TransportIcon name="heart" /><span>Favourites</span>
          <span className="music-workspace-count" aria-hidden="true">{favorites.size || ''}</span>
        </Link>
      </nav>
      <div className="music-workspace-collection" onClickCapture={event => { if ((event.target as HTMLElement).closest('.music-workspace-link')) onOpenChange(false); }}><span className="music-workspace-label">Your collection</span>{typeof children === 'function' ? children(() => { if (mobile) trigger.current?.focus({ preventScroll: true }); }) : children}</div>
    </aside>
  );
  return <>
    {mobile ? <MusicDropdown open={open} onOpenChange={onOpenChange} trigger={trigger}>{sidebar}</MusicDropdown> : sidebar}
  </>;
}

function MusicDropdown({ open, onOpenChange, trigger, children }: {
  open: boolean; onOpenChange: (open: boolean) => void; trigger: React.RefObject<HTMLButtonElement | null>; children: ReactNode;
}) {
  const { menuRef, menuStyle } = useAnchoredPopover(260, 'end', { open, onOpenChange, buttonRef: trigger, closeOnRouteChange: false });
  useEffect(() => { if (open) menuRef.current?.focus({ preventScroll: true }); }, [open, menuRef]);
  return createPortal(<div ref={menuRef} id="music-navigation-dropdown" className="music-song-playlists-popover music-nav-dropdown" style={menuStyle}
    hidden={!open} role="dialog" aria-label="Music" tabIndex={-1}
    onBlur={event => { const next = event.relatedTarget as Node | null; if (next && !event.currentTarget.contains(next) && !trigger.current?.contains(next)) onOpenChange(false); }}>
    {children}
  </div>, document.body);
}
