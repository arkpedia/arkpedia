import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAnchoredPopover } from '@/components/ui/useAnchoredPopover';
import XButton from '@/components/ui/XButton';
import { useMusicPlayer } from '@/lib/music/musicPlayerContext';
import { PlaylistOptions } from './SongPlaylistPicker';
import TransportIcon from './TransportIcons';
import { useCrossFadeTitle } from '@/lib/music/useCrossFadeTitle';
import { MUSIC_VIEW_HREF, type MusicView } from './MusicNav';
import DataSaverSetting from './DataSaverSetting';

/**
 * The player bar's More (⋯): Add to playlist and Open queue as written items, the same anchored
 * dialog as a song row's More (SongActionsMenu), and the player's settings (Data saver), so every
 * bar shows it at every width: the one place a phone and a desktop both reach them. Escape and
 * Close give focus back to the ⋯.
 *
 * Favourite, Shuffle and Repeat are not here: every form of the bar shows them as buttons of its
 * own at every width (the heart beside the song on a phone, in the left group on a wide bar;
 * Shuffle and Repeat on the right), so they were each listed twice (the maintainer, 2026-10-14:
 * "we don't need the shuffle and repeat option in that menu when it's in the player").
 */
export default function PlayerMoreMenu({ onFullPlayer, view }: { onFullPlayer?: boolean; view?: MusicView }) {
  const { videoId, title, currentTrack } = useMusicPlayer();
  const { open, setOpen, close, buttonRef, menuRef, menuStyle } = useAnchoredPopover(300);
  const [section, setSection] = useState<'player' | 'playlists'>('player');
  const id = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (open && section === 'player') closeRef.current?.focus({ preventScroll: true }); }, [open, section]);
  const { displayName: songTitle } = useCrossFadeTitle(currentTrack?.title || title || 'This song', currentTrack?.altTitle);
  function dismiss() { close(); buttonRef.current?.focus({ preventScroll: true }); }
  return <>
    <button ref={buttonRef} type="button" className="ghost filter-chip music-player-more-btn" aria-label="More player actions" title="More player actions"
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => { setSection('player'); setOpen(value => !value); }}>
      <TransportIcon name="more" />
    </button>
    {open && createPortal(<div id={id} ref={menuRef} className="music-song-playlists-popover music-song-actions-menu" style={menuStyle}
      role="dialog" aria-label={section === 'playlists' ? 'Add to playlists' : 'Player actions'}
      onBlur={event => { const next = event.relatedTarget as Node | null; if (next && !event.currentTarget.contains(next) && !buttonRef.current?.contains(next)) close(); }}>
      {section === 'playlists' ? <PlaylistOptions song={{ id: videoId, title: songTitle }} onClose={dismiss} onBack={() => setSection('player')} /> : <>
        <div className="music-song-playlist-heading">
          <b>{videoId ? songTitle : 'Player'}</b>
          <XButton ref={closeRef} label="Close player actions" onClick={dismiss} />
        </div>
        <div className="music-song-menu-options">
          <button type="button" className="ghost" disabled={!videoId} onClick={() => setSection('playlists')}>
            <TransportIcon name="plus" />Add to playlist<span aria-hidden="true">›</span>
          </button>
          <Link href={view === 'queue' ? MUSIC_VIEW_HREF.player : MUSIC_VIEW_HREF.queue} shallow={onFullPlayer} scroll={false} prefetch={false} className="ghost music-player-more-link" onClick={() => close()}>
            <TransportIcon name={view === 'queue' ? 'note' : 'queue'} />{view === 'queue' ? 'Now playing' : 'Open queue'}
          </Link>
          <DataSaverSetting />
        </div>
      </>}
    </div>, document.body)}
  </>;
}
