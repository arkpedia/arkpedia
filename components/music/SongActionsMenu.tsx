import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAnchoredPopover } from '@/components/ui/useAnchoredPopover';
import XButton from '@/components/ui/XButton';
import TransportIcon from './TransportIcons';
import { PlaylistOptions } from './SongPlaylistPicker';

export default function SongActionsMenu({ song, isFavorite, isActive, canMoveUp, canMoveDown, onFavorite, onPlayNext, onMoveUp, onMoveDown, onRemove }: {
  song: { id: string; title: string }; isFavorite: boolean; isActive?: boolean;
  canMoveUp?: boolean; canMoveDown?: boolean;
  onFavorite: () => void; onPlayNext?: () => void; onMoveUp?: () => void; onMoveDown?: () => void; onRemove?: () => void;
}) {
  const { open, setOpen, close, buttonRef, menuRef, menuStyle } = useAnchoredPopover(320);
  const [section, setSection] = useState<'actions' | 'playlists' | 'reorder'>('actions');
  const id = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (open && section !== 'playlists') closeRef.current?.focus({ preventScroll: true }); }, [open, section]);
  function dismiss() { close(); buttonRef.current?.focus({ preventScroll: true }); }
  function action(run: () => void) { run(); dismiss(); }
  return <>
    <button ref={buttonRef} type="button" className="ghost music-song-more" aria-label={`Actions for ${song.title}`}
      title="Song actions" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => { setSection('actions'); setOpen(value => !value); }}>
      <TransportIcon name="more" />
    </button>
    {open && createPortal(<div id={id} ref={menuRef} className="music-song-playlists-popover music-song-actions-menu" style={menuStyle}
      role="dialog" aria-label={section === 'playlists' ? 'Add to playlists' : section === 'reorder' ? 'Reorder song' : 'Song actions'}
      onBlur={event => { const next = event.relatedTarget as Node | null; if (next && !event.currentTarget.contains(next) && !buttonRef.current?.contains(next)) close(); }}>
      {section === 'playlists' ? <PlaylistOptions song={song} onClose={dismiss} onBack={() => setSection('actions')} /> : <>
        <div className="music-song-playlist-heading">
          {section === 'reorder' && <button type="button" className="ghost btn-icon btn-sm" aria-label="Back to song actions" onClick={() => setSection('actions')}><TransportIcon name="back" /></button>}
          <b>{section === 'reorder' ? 'Reorder song' : song.title}</b>
          <XButton ref={closeRef} label="Close song actions" onClick={dismiss} />
        </div>
        <div className="music-song-menu-options">
          {section === 'actions' ? <>
            <button type="button" className="ghost music-song-favorite" aria-pressed={isFavorite} onClick={() => action(onFavorite)}
              aria-label={`${isFavorite ? 'Remove' : 'Add'} ${song.title} ${isFavorite ? 'from' : 'to'} favorites`}>
              <TransportIcon name="heart" />{isFavorite ? 'Remove from favourites' : 'Add to favourites'}
            </button>
            <button type="button" className="ghost" onClick={() => setSection('playlists')}><TransportIcon name="plus" />Add to playlists<span aria-hidden="true">›</span></button>
            {onMoveUp && onMoveDown && onPlayNext && <button type="button" className="ghost" onClick={() => setSection('reorder')}><TransportIcon name="reorder" />Reorder<span aria-hidden="true">›</span></button>}
            {onRemove && <button type="button" className="ghost" disabled={isActive} onClick={() => action(onRemove)}><TransportIcon name="trash" />Remove</button>}
          </> : <>
            <button type="button" className="ghost" disabled={!canMoveUp} onClick={() => action(() => onMoveUp?.())}><TransportIcon name="up" />Move up</button>
            <button type="button" className="ghost" disabled={!canMoveDown} onClick={() => action(() => onMoveDown?.())}><TransportIcon name="down" />Move down</button>
            <button type="button" className="ghost" disabled={isActive} onClick={() => action(() => onPlayNext?.())}><TransportIcon name="next" />Play next</button>
          </>}
        </div>
      </>}
    </div>, document.body)}
  </>;
}
