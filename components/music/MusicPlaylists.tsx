import { useEffect, useRef, useState } from 'react';
import LoadOnScroll from '@/components/ui/LoadOnScroll';
import RecordDialog from '@/components/ui/RecordDialog';
import StyledSelect from '@/components/ui/StyledSelect';
import { useMusicPlayer } from '@/lib/music/musicPlayerContext';
import { downloadBlob } from '@/lib/ui/downloadBlob';
import { MUSIC_FAVORITES_EVENT, MUSIC_FAVORITES_KEY } from '@/lib/music/musicFavorites';
import { formatPlaylistFile, MAX_PLAYLIST_BYTES, mergePlaylists, MUSIC_PLAYLISTS_EVENT, MUSIC_PLAYLISTS_KEY, readPlaylists, validatePlaylists, writePlaylists, initializeFavoritesPlaylist, FAVORITES_PLAYLIST_ID, isFavoritesPlaylistName, type MusicPlaylist } from '@/lib/music/musicPlaylists';
import { parseMusicData } from '@/lib/music/musicData';

export default function MusicPlaylists({ songs }: { songs: { videoId: string; title: string }[] }) {
  const player = useMusicPlayer();
  const [open, setOpen] = useState(false);
  const [playlists, setPlaylists] = useState<MusicPlaylist[]>([]);
  const [selected, setSelected] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [undo, setUndo] = useState<MusicPlaylist[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(50);
  const titles = new Map(songs.map(song => [song.videoId, song.title]));
  const trigger = useRef<HTMLButtonElement>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const read = () => { try { setPlaylists(readPlaylists(window.localStorage)); } catch { setPlaylists([]); } };
    const storage = (e: StorageEvent) => { if (e.key === MUSIC_PLAYLISTS_KEY || e.key === MUSIC_FAVORITES_KEY || e.key === null) read(); };
    try { initializeFavoritesPlaylist(window.localStorage); window.dispatchEvent(new Event(MUSIC_FAVORITES_EVENT)); } catch { /* Read-only storage still shows the default list. */ }
    read();
    window.addEventListener(MUSIC_PLAYLISTS_EVENT, read);
    window.addEventListener(MUSIC_FAVORITES_EVENT, read);
    window.addEventListener('storage', storage);
    return () => { window.removeEventListener(MUSIC_PLAYLISTS_EVENT, read); window.removeEventListener(MUSIC_FAVORITES_EVENT, read); window.removeEventListener('storage', storage); };
  }, []);
  const chosen = playlists.find(p => p.id === selected) ?? playlists[0];
  const order = player.shuffle && player.shuffleOrder ? player.shuffleOrder.map(i => player.queue[i]).filter(Boolean) : player.queue;
  function store(next: MusicPlaylist[], message: string) {
    try {
      validatePlaylists(next);
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'This playlist could not be saved.');
      return false;
    }
    try {
      writePlaylists(window.localStorage, next);
      window.dispatchEvent(new Event(MUSIC_FAVORITES_EVENT));
      setUndo(playlists);
      window.dispatchEvent(new Event(MUSIC_PLAYLISTS_EVENT));
      setNote(message);
      return true;
    } catch {
      setNote('This browser could not save the playlists.');
      return false;
    }
  }
  function create(favorites: boolean) {
    const ordered = order.map(t => t.id);
    const tracks = favorites ? [...new Set([...ordered, ...songs.map(s => s.videoId)])].filter(id => player.favorites.has(id)) : ordered;
    const title = name.trim();
    if (!title) { setNote('Enter a playlist name.'); return; }
    if (isFavoritesPlaylistName(title) || playlists.some(p => p.name === title)) { setNote('Choose a different name for this playlist.'); return; }
    const next = { id: crypto.randomUUID(), name: title, tracks };
    if (store([...playlists, next], `Saved ${title}.`)) { setSelected(next.id); setName(''); }
  }
  function close() { setOpen(false); trigger.current?.focus(); }
  async function importFile(input: File | undefined) {
    if (!input) return;
    setBusy(true);
    try {
      if (input.size > MAX_PLAYLIST_BYTES) throw new Error('Choose a playlist file smaller than 2 MB.');
      const imported = parseMusicData(await input.text());
      // Read again after the asynchronous file read so an import cannot overwrite a newer tab's save.
      const latest = readPlaylists(window.localStorage);
      if (imported.favorites) {
        latest[0] = { ...latest[0], tracks: [...new Set([...latest[0].tracks, ...imported.favorites])] };
      }
      const merged = mergePlaylists(latest, imported.playlists, () => crypto.randomUUID());
      validatePlaylists(merged.playlists);
      if (!merged.added && !imported.favorites) setNote('These playlists are already saved.');
      else store(merged.playlists, merged.added ? `Imported ${merged.added} ${merged.added === 1 ? 'playlist' : 'playlists'}.` : 'Imported favourites.');
    } catch (error) { setNote(error instanceof Error ? error.message : 'This file could not be read.'); }
    finally { setBusy(false); if (file.current) file.current.value = ''; }
  }
  async function play(all = false) {
    if (!all && !chosen) return;
    setBusy(true);
    try {
      const count = await player.playPlaylist(all ? null : chosen.tracks, all ? undefined : chosen.id);
      setNote(count ? `Playing ${all ? 'all songs' : chosen.name}.${!all && count < chosen.tracks.length ? ' Unavailable or stream-filtered songs were skipped.' : ''}` : 'No playable songs in this playlist with the current filters.');
    } catch { setNote('The music catalogue could not be loaded. Try again.'); }
    finally { setBusy(false); }
  }
  function exportFile(all: boolean) {
    const list = all ? playlists : chosen ? [chosen] : [];
    if (!list.length) return;
    downloadBlob(new Blob([formatPlaylistFile(list)], { type: 'application/json' }), `arkpedia-playlists-${new Date().toISOString().slice(0, 10)}.json`);
    setNote(all ? 'Exported all playlists.' : `Exported ${chosen?.name}.`);
  }
  return <>
    <button ref={trigger} type="button" className="ghost btn-sm" onClick={() => setOpen(true)}>Playlists</button>
    {open && <RecordDialog label="Music playlists" onClose={close} className="music-playlists-dialog">
      <h2 className="section-title">Playlists</h2>
      <div className="music-playlists-toolbar">
        <button type="button" className="ghost btn-sm" disabled={busy} onClick={() => file.current?.click()}>Import playlists</button>
        <button type="button" className="ghost btn-sm" disabled={!playlists.length || busy} onClick={() => exportFile(true)}>Export all</button>
        <button type="button" className="ghost btn-sm" disabled={!player.ready || busy} onClick={() => void play(true)}>Play all songs</button>
        {undo && <button type="button" className="ghost btn-sm" disabled={busy} onClick={() => { const previous = undo; if (store(previous, 'Undid the last playlist change.')) setUndo(null); }}>Undo</button>}
        <input ref={file} type="file" accept=".json,application/json" hidden onChange={e => void importFile(e.target.files?.[0])} />
      </div>
      <p className="hint">Import Arkpedia playlist files; existing playlists are kept.</p>
      <div className="music-playlists-toolbar">
        <input type="text" aria-label="New playlist name" placeholder="Playlist name…" maxLength={100} value={name} onChange={e => setName(e.target.value)} />
        <button type="button" className="ghost btn-sm" disabled={!order.length || busy} onClick={() => create(false)}>Save queue</button>
        <button type="button" className="ghost btn-sm" disabled={!songs.some(t => player.favorites.has(t.videoId)) && !order.some(t => player.favorites.has(t.id)) || busy} onClick={() => create(true)}>Save favorites</button>
      </div>
      {chosen ? <>
        <div className="music-playlists-toolbar">
          <StyledSelect label="Saved playlist" value={chosen.id} options={playlists.map(p => ({ value: p.id, label: p.name }))} onChange={id => { setSelected(id); setVisible(50); }} />
          <button type="button" className="primary btn-sm" disabled={!chosen.tracks.length || !player.ready || busy} onClick={() => void play()}>Play playlist</button>
          <button type="button" className="ghost btn-sm" disabled={busy} onClick={() => exportFile(false)}>Export playlist</button>
          <button type="button" className="ghost btn-sm" disabled={!player.videoId || busy || chosen.tracks.includes(player.videoId)} onClick={() => store(playlists.map(p => p.id === chosen.id ? { ...p, tracks: [...p.tracks, player.videoId] } : p), `Added the playing song to ${chosen.name}.`)}>Add playing song</button>
          <button type="button" className="ghost btn-sm" disabled={busy || chosen.id === FAVORITES_PLAYLIST_ID} onClick={() => store(playlists.filter(p => p.id !== chosen.id), `Removed ${chosen.name}. Use Undo to restore it.`)}>Delete playlist</button>
        </div>
        <div className="music-playlist-tracks"><ol>
          {chosen.tracks.slice(0, visible).map(id => <li key={id}>{titles.get(id) ?? player.queue.find(t => t.id === id)?.title ?? `Unavailable song (${id})`}</li>)}
        </ol>
        <LoadOnScroll shown={visible} total={chosen.tracks.length} onMore={() => setVisible(n => n + 50)} /></div>
      </> : <p className="hint">Save your queue or favorites to create a playlist.</p>}
      <p className="music-playlist-status hint" role="status">{note || '\u00a0'}</p>
    </RecordDialog>}
  </>;
}
