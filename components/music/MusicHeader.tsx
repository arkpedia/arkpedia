import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import MusicGameSetting from './MusicGameSetting';
import { MUSIC_VIEW_HREF, type MusicView } from './MusicNav';

export default function MusicHeader({ current, favourites = false, open, onOpen }: { current: MusicView; favourites?: boolean; open: boolean; onOpen: () => void }) {
  const label = favourites ? 'Favourites' : current === 'player' ? 'Now playing' : current === 'queue' ? 'Queue' : current === 'discover' ? 'Discover' : 'Library';
  return <PageHeader slim compact eyebrow="Rhodes Island // Sound Archive" title={<><span className="music-desktop-heading">Music</span><span className="music-phone-heading">{label}</span></>} actions={<>
    <div className="music-desktop-heading"><MusicGameSetting header /></div>
    <div className="music-phone-header-actions">
      {current === 'player' && <Link href={MUSIC_VIEW_HREF.library} shallow scroll={false} prefetch={false} className="ghost btn-icon" aria-label="Back to Library" title="Back to Library"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></Link>}
      <button type="button" className="ghost btn-icon" aria-label="Music menu" aria-haspopup="dialog" aria-expanded={open} aria-controls="music-navigation-dropdown" onClick={onOpen}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
      </button>
    </div>
  </>} />;
}
