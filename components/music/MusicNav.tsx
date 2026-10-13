import Link from 'next/link';
import { useMusicPlayer } from '@/lib/music/musicPlayerContext';

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
 * One strip across the music section, in the same place on both pages: Discover (browse by
 * album, character, artist), Library (every song, searchable, which never changes the queue by
 * itself), Now playing (the song, its credits and lyrics) and Queue (what plays next). A link
 * strip in the site's tab look (.tabs, like the games' GameLinks), not a tablist: each is an
 * address. Shallow links within /music, so the player and its audio carry on untouched.
 */
export default function MusicNav({ current }: { current: MusicView }) {
  const { queue, videoId, shuffle, shuffleOrder } = useMusicPlayer();
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
    <nav className="tabs music-nav" aria-label="Music">
      {items.map(({ view, label, count }) => (
        <Link key={view} href={MUSIC_VIEW_HREF[view]} prefetch={false} shallow={view !== 'discover' && current !== 'discover'} scroll={false}
          className="tab" aria-current={view === current ? 'page' : undefined}>
          {label}
          {count !== undefined && <span className="tab-count"><span className="visually-hidden">, </span>{count}<span className="visually-hidden"> chosen songs next</span></span>}
        </Link>
      ))}
    </nav>
  );
}
