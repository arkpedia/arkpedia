import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { restoreScrollOnReturn } from '@/lib/nav/scrollRestoration';
import PageHeader from '@/components/ui/PageHeader';
import { MUSIC_VIEW_HREF, type MusicView } from './MusicNav';

/** The music pages' header. Its title row holds only the phone's menu button: the Endfield
 *  music setting is in the sidebar under Playlists (and the player's ⋯ menu), which leaves the
 *  space beside the title free at desktop widths. */
export default function MusicHeader({ current, favourites = false, open, onOpen }: { current: MusicView; favourites?: boolean; open: boolean; onOpen: () => void }) {
  const router = useRouter();
  const [libraryHref, setLibraryHref] = useState<string>(MUSIC_VIEW_HREF.library);
  useEffect(() => {
    if (router.isReady && current === 'library') setLibraryHref(router.asPath);
  }, [current, router.isReady, router.asPath]);
  const label = favourites ? 'Favourites' : current === 'player' ? 'Now playing' : current === 'queue' ? 'Queue' : current === 'discover' ? 'Discover' : 'Library';
  return <PageHeader slim compact eyebrow="Rhodes Island // Sound Archive" title={<><span className="music-desktop-heading">Music</span><span className="music-phone-heading">{label}</span></>} actions={<>
    <div className="music-phone-header-actions">
      {current === 'player' && <Link href={libraryHref} onNavigate={() => restoreScrollOnReturn(libraryHref)} shallow scroll={false} prefetch={false} className="ghost btn-icon" aria-label="Back to Library" title="Back to Library"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></Link>}
      <button type="button" className="ghost btn-icon" aria-label="Music menu" aria-haspopup="dialog" aria-expanded={open} aria-controls="music-navigation-dropdown" onClick={onOpen}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
      </button>
    </div>
  </>} />;
}
