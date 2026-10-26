import Link from 'next/link';
import { useRouter } from 'next/router';
import type { ReactNode } from 'react';
import { useMusicPlayer } from '@/lib/music/musicPlayerContext';
import TransportIcon from './TransportIcons';

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
 * Shared music rail (a scrolling link strip on phones): Discover (browse by
 * album, character, artist), Library (every song, searchable, which never changes the queue by
 * itself), Now playing (the song, its credits and lyrics) and Queue (what plays next). The
 * navigation uses ordinary links, not a tablist: each is an
 * address. Shallow links within /music, so the player and its audio carry on untouched.
 */
export default function MusicNav({ current, children }: { current: MusicView; children?: ReactNode }) {
  const router = useRouter();
  const { queue, videoId, shuffle, shuffleOrder, favorites } = useMusicPlayer();
  const favouritesSelected = current === 'library' && router.query.scope === 'favorites';
  const order = shuffle && shuffleOrder ? shuffleOrder : queue.map((_, index) => index);
  const currentPosition = order.findIndex(index => queue[index]?.id === videoId);
  const upcoming = order.length - currentPosition - 1;
  // Only the songs the reader queued: a count of the whole queue would tick down with every song.
  const items: { view: MusicView; label: string; count?: number }[] = [
    { view: 'discover', label: 'Discover' },
    { view: 'library', label: 'Library' },
    { view: 'player', label: 'Now playing' },
    { view: 'queue', label: 'Queue', count: upcoming || undefined },
  ];
  return (
    <aside className="music-workspace-rail">
      <span className="music-workspace-label">Sound archive</span>
      <nav className="music-nav" aria-label="Music">
        {items.map(({ view, label, count }) => (
          <Link key={view} href={MUSIC_VIEW_HREF[view]} prefetch={false} shallow={view !== 'discover' && current !== 'discover'} scroll={false}
            className="music-workspace-link" aria-current={view === current && !favouritesSelected ? 'page' : undefined}>
            <TransportIcon name={view === 'discover' ? 'note' : view === 'library' ? 'library' : view === 'queue' ? 'queue' : 'nowPlaying'} />
            <span>{label}</span>
            {count !== undefined && <span className="music-workspace-count"><span className="visually-hidden">, </span>{count}<span className="visually-hidden"> chosen songs next</span></span>}
          </Link>
        ))}
        <Link href="/music?view=library&scope=favorites" prefetch={false} shallow={current !== 'discover'} scroll={false}
          className="music-workspace-link" aria-current={favouritesSelected ? 'page' : undefined}>
          <TransportIcon name="heart" /><span>Favourites</span>
          <span className="music-workspace-count" aria-hidden="true">{favorites.size || ''}</span>
        </Link>
      </nav>
      <div className="music-workspace-collection"><span className="music-workspace-label">Your collection</span>{children}</div>
    </aside>
  );
}
