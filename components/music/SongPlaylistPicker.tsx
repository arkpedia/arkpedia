import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAnchoredPopover } from '@/components/ui/useAnchoredPopover';
import XButton from '@/components/ui/XButton';
import TransportIcon from './TransportIcons';
import { useMusicPlayer } from '@/lib/music/musicPlayerContext';
import { MUSIC_FAVORITES_EVENT, MUSIC_FAVORITES_KEY } from '@/lib/music/musicFavorites';
import { addSongToPlaylists, MUSIC_PLAYLISTS_EVENT, MUSIC_PLAYLISTS_KEY, readPlaylists, writePlaylists, isFavoritesPlaylistName, type MusicPlaylist } from '@/lib/music/musicPlaylists';

type Song = { id: string; title: string };

/** `row`: a song row's icon action (components/music/SongRow.tsx), named and with the rows'
 *  hover/focus tooltip, so it reads apart from Add to queue; the player bar keeps its square +
 *  (`player`). */
export default function SongPlaylistPicker({ song, player = false, row = false }: { song: Song; player?: boolean; row?: boolean }) {
  const { open, setOpen, close, buttonRef, menuRef, menuStyle } = useAnchoredPopover(320);
  const id = useId();
  useEffect(() => { close(); }, [song.id, close]);
  function dismiss() {
    close();
    buttonRef.current?.focus({ preventScroll: true });
  }
  return <>
    <button ref={buttonRef} type="button" className={player ? "filter-chip music-playlist-add-btn" : row ? "ghost music-song-action" : "ghost"} disabled={!song.id} onClick={() => setOpen(value => !value)}
      aria-label={row ? `Add to playlist: ${song.title}` : `Add ${song.title} to playlists`} title={row ? undefined : 'Add to playlist'} data-tip={row ? 'Add to playlist' : undefined}
      aria-expanded={open} aria-haspopup="dialog" aria-controls={open ? id : undefined}>
      <TransportIcon name="plus" size={18} />
    </button>
    {open && createPortal(<div id={id} ref={menuRef} role="dialog" aria-label="Add to playlists"
      data-music-player-popover={player ? "" : undefined} className="music-song-playlists-popover" style={menuStyle}
      onBlur={event => {
        const next = event.relatedTarget as Node | null;
        if (next && !event.currentTarget.contains(next) && !buttonRef.current?.contains(next)) close();
      }}>
      <PlaylistOptions song={song} onClose={dismiss} />
    </div>, document.body)}
  </>;
}

export function PlaylistOptions({ song, onClose, onBack }: { song: Song; onClose: () => void; onBack?: () => void }) {
  const { playingPlaylistId } = useMusicPlayer();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus({ preventScroll: true }); }, []);
  const [playlists, setPlaylists] = useState<MusicPlaylist[]>([]);
  const [selected, setSelected] = useState<string[]>(() => playingPlaylistId ? [playingPlaylistId] : []);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    const read = () => { try { setPlaylists(readPlaylists(window.localStorage)); } catch { setNote('This browser could not load your playlists.'); } };
    const storage = (event: StorageEvent) => { if (event.key === MUSIC_PLAYLISTS_KEY || event.key === MUSIC_FAVORITES_KEY || event.key === null) read(); };
    read();
    window.addEventListener(MUSIC_PLAYLISTS_EVENT, read);
    window.addEventListener(MUSIC_FAVORITES_EVENT, read);
    window.addEventListener('storage', storage);
    return () => { window.removeEventListener(MUSIC_PLAYLISTS_EVENT, read); window.removeEventListener(MUSIC_FAVORITES_EVENT, read); window.removeEventListener('storage', storage); };
  }, []);
  const pending = selected.filter(id => playlists.some(p => p.id === id && !p.tracks.includes(song.id)));
  function store(next: MusicPlaylist[]) {
    writePlaylists(window.localStorage, next);
    window.dispatchEvent(new Event(MUSIC_FAVORITES_EVENT));
    window.dispatchEvent(new Event(MUSIC_PLAYLISTS_EVENT));
  }
  function add() {
    try {
      // Preserve edits made in other tabs while this picker was open.
      store(addSongToPlaylists(readPlaylists(window.localStorage), pending, song.id));
      setSelected([]);
      setNote(`Added to ${pending.length === 1 ? '1 playlist' : `${pending.length} playlists`}.`);
    } catch (error) { setNote(error instanceof Error ? error.message : 'This browser could not save your playlists.'); }
  }
  function create() {
    try {
      const title = name.trim();
      if (!title) throw new Error('Enter a playlist name.');
      const latest = readPlaylists(window.localStorage);
      if (isFavoritesPlaylistName(title) || latest.some(p => p.name === title)) throw new Error('Choose a different name for this playlist.');
      store([...latest, { id: crypto.randomUUID(), name: title, tracks: [song.id] }]);
      setName('');
      setNote(`Created ${title} and added this song.`);
    } catch (error) { setNote(error instanceof Error ? error.message : 'This browser could not save your playlists.'); }
  }
  return <>
    <div className="music-song-playlist-heading">
      {onBack && <button type="button" className="ghost btn-icon btn-sm" aria-label="Back to song actions" onClick={onBack}><TransportIcon name="back" /></button>}
      <b>Add to playlists</b>
      <XButton ref={closeRef} label="Close playlist picker" onClick={onClose} />
    </div>
    <p className="music-song-playlist-title">{song.title}</p>
    <div className="music-song-playlist-options">
      {playlists.length ? playlists.map(p => {
        const added = p.tracks.includes(song.id);
        return <label key={p.id} className="check music-song-playlist-option">
          <input type="checkbox" checked={added || selected.includes(p.id)} disabled={added} onChange={event => setSelected(ids => event.target.checked ? [...ids, p.id] : ids.filter(id => id !== p.id))} />
          <span>{p.name}</span>
          {added && <small className="hint">Added ✓</small>}
        </label>;
      }) : <p className="hint">No saved playlists yet.</p>}
    </div>
    <div className="music-song-playlist-add">
      <button type="button" className="primary btn-sm" disabled={!pending.length} onClick={add}>Add to playlists</button>
    </div>
    <form className="music-song-playlist-create" onSubmit={event => { event.preventDefault(); create(); }}>
      <input type="text" aria-label="New playlist name" placeholder="Playlist name…" maxLength={100} value={name} onChange={event => setName(event.target.value)} />
      <button type="submit" className="ghost btn-sm">Create new playlist</button>
    </form>
    <p className="music-playlist-status hint" role="status">{note || '\u00a0'}</p>
  </>;
}
