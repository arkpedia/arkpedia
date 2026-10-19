import { clearNoAutoplay } from '@/lib/music/noAutoplay';
import Link from 'next/link';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useMusicPlayer, type QueueTrack } from '@/lib/music/musicPlayerContext';
import { MUSIC_PLAYLISTS_EVENT, readPlaylists } from '@/lib/music/musicPlaylists';
import LoadOnScroll from '@/components/ui/LoadOnScroll';
import SearchInput from '@/components/ui/SearchInput';
import SongRow from './SongRow';
import TransportIcon from './TransportIcons';
import { useSongQueueDrag } from './useSongQueueDrag';
import { songTitle } from '@/lib/music/musicPolish';
import { createSongIndex } from '@/lib/music/songSearch';
import { MUSIC_VIEW_HREF } from './MusicNav';

const PAGE_SIZE = 50;

/** The saved playlist's name, read where the playlists live (localStorage). */
function usePlaylistName(id: string | null): string | null {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    if (!id) { setName(null); return; }
    const read = () => { try { setName(readPlaylists(window.localStorage).find(p => p.id === id)?.name ?? null); } catch { setName(null); } };
    read();
    window.addEventListener(MUSIC_PLAYLISTS_EVENT, read);
    return () => window.removeEventListener(MUSIC_PLAYLISTS_EVENT, read);
  }, [id]);
  return name;
}

/**
 * What plays, in the order it plays: the song playing now, then "Next in queue" (the songs the
 * reader queued with Play next or Add to queue), then the rest of where the queue came from (every
 * song, or a saved playlist), then the songs already played, which come round again on Repeat all.
 * One scrolling list (the drag controller's [data-song-list]), so a song can be dragged from any
 * part to any other; the song playing stays put. Clear queue takes out everything but the song
 * playing, with Undo. The queue's own search narrows these rows and nothing else.
 */
export default function MusicQueue({ shown }: { shown: boolean }) {
  const {
    queue, queueIndex, queueLoading, shuffle, shuffleOrder, shufflePosition, videoId, favorites, queued, queueSource, playingPlaylistId,
    canUndoClear, playQueueIndex, reorderQueue, reorderShuffleOrder, moveQueueItemToTop, removeFromQueue, toggleFavorite, noAutoplay, toggleNoAutoplay, clearQueue,
    undoClearQueue, autoplay, autoplayTracks, autoplayVideoId, currentTrack, setAutoplay, queueSong, playNow,
  } = useMusicPlayer();
  const playlistName = usePlaylistName(queueSource === 'playlist' ? playingPlaylistId : null);
  const source = queueSource === 'playlist' ? playlistName ?? 'a saved playlist' : 'your choices';
  const [showAutoplay, setShowAutoplay] = useState(false);
  const [autoplayVisible, setAutoplayVisible] = useState(50);

  const displayList = useMemo(() => (shuffle && shuffleOrder
    ? shuffleOrder.map((queueIdx, displayPos) => ({ song: queue[queueIdx], queueIdx, displayPos }))
    : queue.map((song, queueIdx) => ({ song, queueIdx, displayPos: queueIdx }))).filter(entry => entry.song), [queue, shuffle, shuffleOrder]);
  const current = videoId && !autoplayVideoId && queue.some(track => track.id === videoId) ? (shuffle && shuffleOrder ? shufflePosition : queueIndex) : -1;
  const playing = displayList[current]?.song.id === videoId && Boolean(videoId);
  const boundary = autoplayVideoId && queue.length && !queued.has(queue[queueIndex]?.id) ? (shuffle && shuffleOrder ? shufflePosition : queueIndex) : current;

  const drag = useSongQueueDrag((from, to) => {
    if (from < 0 || to < 0 || from >= displayList.length || to >= displayList.length) return;
    // Nothing moves above the song playing, nor the song playing itself.
    if (from === current) return;
    const target = to <= current && from > current ? current + 1 : to;
    if (shuffle) reorderShuffleOrder(from, target);
    else reorderQueue(displayList[from].queueIdx, displayList[target].queueIdx);
  }, shuffle ? shuffleOrder : queue);
  const dropSide = (position: number): 'before' | 'after' | null =>
    drag.dragPos === null || drag.overPos !== position || drag.dragPos === position ? null
      : drag.dragPos < position ? 'after' : 'before';

  const [search, setSearch] = useState('');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [showHistory, setShowHistory] = useState(false);
  const q = search.trim();
  // The shared song search (lib/music/songSearch.ts), as a filter: the queue keeps its play order.
  const searchIndex = useMemo(() => createSongIndex([...queue, ...autoplayTracks], track => track), [queue, autoplayTracks]);
  const matches = useMemo(() => searchIndex.matches(search), [searchIndex, search]);

  let run = 0;
  while (boundary + 1 + run < displayList.length && queued.has(displayList[boundary + 1 + run].song.id)) run += 1;
  const nowRow = displayList[current] ? [displayList[current]] : [];
  const nextInQueue = displayList.slice(boundary + 1, boundary + 1 + run);
  const rest = displayList.slice(boundary + 1 + run);
  const history = boundary >= 0 ? displayList.slice(0, autoplayVideoId ? boundary + 1 : current) : [];

  const sections = [
    { key: 'now', title: playing ? 'Now playing' : 'Up first', rows: nowRow.filter(e => matches(e.song)), offset: 0 },
    { key: 'queued', title: 'Next in queue', rows: nextInQueue.filter(e => matches(e.song)), offset: 1 },
    { key: 'rest', title: 'Next in your queue', rows: rest.filter(e => matches(e.song)), offset: 1 + run },
  ];
  const restShown = q ? sections[2].rows : sections[2].rows.slice(0, visible);
  const historyRows = history.filter(e => matches(e.song));

  const row = (entry: { song: QueueTrack; queueIdx: number; displayPos: number }) => {
    const { song, queueIdx, displayPos } = entry;
    const isCurrent = current >= 0 && displayPos === current;
    const canUp = displayPos > current + 1 || (displayPos < current && displayPos > 0);
    const canDown = displayPos < displayList.length - 1 && displayPos !== current && displayPos !== current - 1;
    return <SongRow
      key={song.id}
      marker="music-queue-row"
      song={song}
      active={isCurrent && playing}
      current={isCurrent}
      data={{ 'display-pos': displayPos }}
      onPlay={() => playQueueIndex(queueIdx)}
      drag={{
        locked: isCurrent,
        dragging: drag.dragPos === displayPos,
        dropSide: dropSide(displayPos),
        onDragStart: e => drag.startNative(e, displayPos, song.title),
        onDragEnd: drag.cancel,
        onPointerDown: e => drag.startPointer(e, displayPos, song.title),
      }}
      actions={{
        playNext: isCurrent ? undefined : () => moveQueueItemToTop(queueIdx),
        favorite: { on: favorites.has(song.id), toggle: () => toggleFavorite(song.id) },
        playlist: true,
        remove: isCurrent ? undefined : { run: () => removeFromQueue(queueIdx), label: 'Remove from queue' },
        reorder: isCurrent ? undefined : { canUp, canDown, up: () => drag.move(displayPos, displayPos - 1), down: () => drag.move(displayPos, displayPos + 1) },
      }}
    />;
  };

  const upcoming = displayList.length - boundary - 1;
  return (
    <section className="music-queue-panel music-queue-view" aria-labelledby="music-queue-heading">
      <div className="music-song-list-heading">
        <h2 className="section-title" id="music-queue-heading">Your queue</h2>
        <div className="music-queue-tools">
          {canUndoClear
            ? <button type="button" className="ghost btn-sm" onClick={undoClearQueue}>Undo clear</button>
            : <button type="button" className="ghost btn-sm" onClick={clearQueue} disabled={!queue.length || (queue.length === 1 && current >= 0)}>Clear queue</button>}
        </div>
      </div>
      {queueSource === 'playlist' && <p className="hint music-view-hint">Playing from <b>{source}</b>.</p>}
      {autoplayVideoId && currentTrack && <p className="hint music-view-hint">Autoplay now: <Link href={MUSIC_VIEW_HREF.player} shallow scroll={false}>{songTitle(currentTrack.title, currentTrack.altTitle)}</Link></p>}
      <SearchInput label="Search the queue" name="queue-search" placeholder="Search the queue…" value={search} onChange={setSearch} />
      <div className={`music-queue-list${drag.nativeDragging ? ' music-queue-native-drag' : ''}`} data-song-list>
        {queueLoading && !displayList.length && <p className="hint" role="status">Loading the queue…</p>}
        {!queueLoading && !displayList.length && <p className="hint">Your queue is empty. Pick songs from the <Link href={MUSIC_VIEW_HREF.library} shallow scroll={false} prefetch={false}>Library</Link> or Discover.</p>}
        {sections.map(section => section.rows.length > 0 && (
          <Fragment key={section.key}>
            <h3 className="music-queue-section-title">{section.title}{section.key === 'queued' && <span className="music-heading-count"> · {nextInQueue.length}</span>}</h3>
            {(section.key === 'rest' ? restShown : section.rows).map(entry => row(entry))}
          </Fragment>
        ))}
        {!q && shown && <LoadOnScroll shown={visible} total={sections[2].rows.length} onMore={() => setVisible(n => n + PAGE_SIZE)} />}
        {displayList.length > 0 && upcoming === 0 && !q && !autoplay && (
          <div className="music-queue-empty-next">
            <p className="hint music-queue-empty-next-text">Nothing plays after this song.{history.length > 0 ? ' Repeat all plays the songs below again.' : ''}</p>
            <div className="music-queue-tools">
              <Link href={MUSIC_VIEW_HREF.library} shallow scroll={false} prefetch={false} className="ghost btn-sm">Add from Library</Link>

            </div>
          </div>
        )}
        {historyRows.length > 0 && (visible >= sections[2].rows.length || q) && <>
          <h3 className="music-queue-section-title">
            <button type="button" className="btn-bare music-queue-history-toggle" aria-expanded={showHistory || Boolean(q)} onClick={() => setShowHistory(v => !v)}>
              Played earlier <span className="music-heading-count">· {history.length}</span>
              <TransportIcon name={showHistory || q ? 'up' : 'down'} size={14} />
            </button>
          </h3>
          {(showHistory || q) && historyRows.map(entry => row(entry))}
        </>}
        {q && sections.every(s => !s.rows.length) && !historyRows.length && <p className="hint">No songs in the queue match your search.</p>}
        <section className="music-autoplay" aria-label="Autoplay from library">
          <div className="music-autoplay-heading">
            <button type="button" className="btn-bare music-queue-history-toggle" aria-expanded={showAutoplay} onClick={() => setShowAutoplay(value => !value)}>
              Autoplay from library <TransportIcon name={showAutoplay ? 'up' : 'down'} size={14} />
            </button>
            <label className="check"><input type="checkbox" checked={autoplay} onChange={event => setAutoplay(event.target.checked)} />On</label>
          </div>
          {showAutoplay && <>
            <p className="hint">{autoplay ? 'Plays after your queue ends. Repeat all keeps repeating your chosen queue.' : 'Off. Only your chosen songs will play.'}</p>
            {noAutoplay.size > 0 && <p className="hint music-autoplay-kept-out">
              {noAutoplay.size === 1 ? '1 song is' : `${noAutoplay.size} songs are`} kept out of autoplay.{' '}
              <button type="button" className="ghost btn-sm" onClick={() => clearNoAutoplay()}>Let {noAutoplay.size === 1 ? 'it' : 'them all'} back</button>
            </p>}
            <div className="music-autoplay-list">
              {autoplayTracks.filter(matches).slice(0, autoplayVisible).map(track => <SongRow key={track.id} marker="music-autoplay-row" song={track}
                active={track.id === videoId} onPlay={() => playNow(track.id)}
                actions={{
                  playNow: () => playNow(track.id),
                  playNext: () => void queueSong(track.id, 'next'),
                  addToQueue: () => void queueSong(track.id, 'last'),
                  favorite: { on: favorites.has(track.id), toggle: () => toggleFavorite(track.id) },
                  noAutoplay: { on: false, toggle: () => toggleNoAutoplay(track.id) },
                  playlist: true,
                }} />)}
              <LoadOnScroll shown={autoplayVisible} total={autoplayTracks.filter(matches).length} onMore={() => setAutoplayVisible(value => value + 50)} />
            </div>
          </>}
        </section>
      </div>
      {drag.feedback}
    </section>
  );
}
