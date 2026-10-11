import { useEffect, useState } from 'react';
import ImportDialog from '@/components/account/ImportDialog';
import { addSongToPlaylists, MUSIC_PLAYLISTS_EVENT, MUSIC_PLAYLISTS_KEY, readPlaylists, validatePlaylists, type MusicPlaylist } from '@/lib/music/musicPlaylists';

export default function SongPlaylistDialog({ song, onClose }: { song: { id: string; title: string }; onClose: () => void }) {
  const [playlists, setPlaylists] = useState<MusicPlaylist[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    const read = () => { try { setPlaylists(readPlaylists(window.localStorage)); } catch { setNote('This browser could not load your playlists.'); } };
    const storage = (event: StorageEvent) => { if (event.key === MUSIC_PLAYLISTS_KEY || event.key === null) read(); };
    read();
    window.addEventListener(MUSIC_PLAYLISTS_EVENT, read);
    window.addEventListener('storage', storage);
    return () => { window.removeEventListener(MUSIC_PLAYLISTS_EVENT, read); window.removeEventListener('storage', storage); };
  }, []);
  const pending = selected.filter(id => playlists.some(p => p.id === id && !p.tracks.includes(song.id)));
  function store(next: MusicPlaylist[]) {
    window.localStorage.setItem(MUSIC_PLAYLISTS_KEY, JSON.stringify(validatePlaylists(next)));
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
      if (latest.some(p => p.name === title)) throw new Error('Choose a different name for this playlist.');
      store([...latest, { id: crypto.randomUUID(), name: title, tracks: [song.id] }]);
      setName('');
      setNote(`Created ${title} and added this song.`);
    } catch (error) { setNote(error instanceof Error ? error.message : 'This browser could not save your playlists.'); }
  }
  return <ImportDialog title="Add to playlists" onClose={onClose} className="music-song-playlists-dialog">
    <p className="music-song-playlist-title">{song.title}</p>
    <div className="music-song-playlist-options">
      {playlists.length ? playlists.map(p => {
        const added = p.tracks.includes(song.id);
        return <label key={p.id} className="music-song-playlist-option">
          <input type="checkbox" checked={added || selected.includes(p.id)} disabled={added} onChange={event => setSelected(ids => event.target.checked ? [...ids, p.id] : ids.filter(id => id !== p.id))} />
          <span>{p.name}</span>
          {added && <small className="hint">Added</small>}
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
  </ImportDialog>;
}
