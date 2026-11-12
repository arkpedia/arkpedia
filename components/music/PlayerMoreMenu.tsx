import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAnchoredPopover } from '@/components/ui/useAnchoredPopover';
import XButton from '@/components/ui/XButton';
import { useMusicPlayer } from '@/lib/music/musicPlayerContext';
import { youtubeWatchUrl } from '@/lib/music/trackId';
import { PlaylistOptions } from './SongPlaylistPicker';
import TransportIcon from './TransportIcons';
import { useCrossFadeTitle } from '@/lib/music/useCrossFadeTitle';
import DataSaverSetting from './DataSaverSetting';
import MusicGameSetting from './MusicGameSetting';

/** Extra player actions and settings that have no dedicated transport control.
 * Escape and Close return focus to More. */
export default function PlayerMoreMenu() {
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
          {videoId && youtubeWatchUrl(videoId) && <a href={youtubeWatchUrl(videoId)!} target="_blank" rel="noreferrer" className="ghost music-player-more-link" onClick={() => close()}>
            <TransportIcon name="youtube" />Open on YouTube
          </a>}
          <div className="music-settings">
            <DataSaverSetting />
            <MusicGameSetting />
          </div>
        </div>
      </>}
    </div>, document.body)}
  </>;
}
