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

const REPEAT_LABEL = { off: 'Off', one: 'This song', all: 'All' } as const;

/**
 * The player bar's More (⋯): on its one-row forms -- a phone's mini player and Discover's bar --
 * which have room for the song, Previous, Play and Next only, it holds Favourite, Shuffle, Repeat,
 * Add to playlist and Open queue as written items, each saying its state (aria-pressed on the
 * toggles), the same anchored dialog as a song row's More (SongActionsMenu). Escape and Close give
 * focus back to the ⋯; Before this, a phone reached Favourite, Shuffle and Repeat only on Now
 * playing. It is also where the player's settings live (Data saver), so the full bar shows it at
 * every width too: the one place a phone and a desktop both reach them.
 */
export default function PlayerMoreMenu({ onFullPlayer, view }: { onFullPlayer?: boolean; view?: MusicView }) {
  const { videoId, title, currentTrack, favorites, shuffle, repeatMode, toggleFavorite, toggleShuffle, cycleRepeat } = useMusicPlayer();
  const { open, setOpen, close, buttonRef, menuRef, menuStyle } = useAnchoredPopover(300);
  const [section, setSection] = useState<'player' | 'playlists'>('player');
  const id = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (open && section === 'player') closeRef.current?.focus({ preventScroll: true }); }, [open, section]);
  const { displayName: songTitle } = useCrossFadeTitle(currentTrack?.title || title || 'This song', currentTrack?.altTitle);
  const isFav = Boolean(videoId) && favorites.has(videoId);
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
          {/* Toggles stay open, so the new state can be read; Repeat steps Off, This song, All. */}
          <button type="button" className="ghost music-song-favorite" aria-pressed={isFav} disabled={!videoId} onClick={() => toggleFavorite(videoId)}>
            <TransportIcon name="heart" />{isFav ? 'Unfavourite' : 'Favourite'}
          </button>
          <button type="button" className="ghost" aria-pressed={shuffle} onClick={toggleShuffle}>
            <TransportIcon name="shuffle" />Shuffle<span aria-hidden="true">{shuffle ? 'On' : 'Off'}</span>
          </button>
          {/* Three states, so the name says which (as the transport's Repeat does), not a pressed flag. */}
          <button type="button" className="ghost" aria-label={`Repeat: ${REPEAT_LABEL[repeatMode]}`} onClick={cycleRepeat}>
            <TransportIcon name="repeat" />Repeat<span aria-hidden="true">{REPEAT_LABEL[repeatMode]}</span>
          </button>
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
