import Link from 'next/link';
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMusicPlayer, type QueueTrack } from '@/lib/music/musicPlayerContext';
import { useCrossFadeTitle } from '@/lib/music/useCrossFadeTitle';
import { MUSIC_PLAYLISTS_EVENT, readPlaylists } from '@/lib/music/musicPlaylists';
import LoadOnScroll from '@/components/ui/LoadOnScroll';
import SearchInput from '@/components/ui/SearchInput';
import XButton from '@/components/ui/XButton';
import SongActionsMenu from './SongActionsMenu';
import SongPlaylistPicker from './SongPlaylistPicker';
import TransportIcon from './TransportIcons';
import { useSongQueueDrag } from './useSongQueueDrag';
import { MUSIC_VIEW_HREF } from './MusicNav';

// Each row its own component, so each can call useCrossFadeTitle (hooks cannot run in a loop).
interface QueueRowProps {
  song: QueueTrack;
  displayPos: number;
  /** What the index column shows: the row's place in what plays next, or nothing. */
  label: ReactNode;
  isActive: boolean;
  /** The song playing (or cued to start): not dragged, moved or removed from here. */
  isCurrent: boolean;
  isDragging: boolean;
  /** Where the dragged song would land if dropped now: the line above or below this row. */
  dropSide: 'before' | 'after' | null;
  onTap: () => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onPointerDrag: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onPushToTop: () => void;
  onRemove: () => void;
  isFavorite: boolean;
  onFavorite: () => void;
}

function QueueRow({
  song, displayPos, label, isActive, isCurrent, isDragging, dropSide, onTap, onDragStart, onDragEnd,
  onPointerDrag, onMoveUp, onMoveDown, canMoveUp, canMoveDown, onPushToTop, onRemove, isFavorite, onFavorite,
}: QueueRowProps) {
  const { displayName, fading } = useCrossFadeTitle(song.title, song.altTitle);
  return (
    <div
      className={`music-queue-row${isActive ? ' active' : ''}${isCurrent ? ' current' : ''}${isDragging ? ' dragging' : ''}${dropSide ? ` drop-${dropSide}` : ''}`}
      draggable={!isCurrent}
      onDragStart={isCurrent ? undefined : onDragStart}
      onDragEnd={onDragEnd}
      data-display-pos={displayPos}
      data-song-id={song.id}
    >
      {isCurrent
        ? <span className="music-queue-drag-handle music-queue-drag-handle-spacer" aria-hidden="true" />
        : <button type="button" className="btn-bare btn-icon btn-sm music-queue-drag-handle"
          aria-label={`Reorder ${song.title}`} title="Drag to reorder; arrow keys move one position"
          onPointerDown={onPointerDrag} onKeyDown={event => {
            if (event.key === 'ArrowUp' && canMoveUp) { event.preventDefault(); onMoveUp(); }
            if (event.key === 'ArrowDown' && canMoveDown) { event.preventDefault(); onMoveDown(); }
          }}>⠿</button>}
      <span className="music-queue-row-index">{label}</span>
      <button
        type="button"
        className={fading ? 'btn-bare music-queue-row-title music-crossfade-text fading' : 'btn-bare music-queue-row-title music-crossfade-text'}
        title={song.title}
        onClick={onTap}
      >
        {displayName}
        {song.artist && <span className="music-library-row-artist"> · {song.artist}</span>}
      </button>
      <div className="music-queue-row-actions music-song-desktop-actions">
        <button type="button" className="ghost music-song-favorite" onClick={onFavorite} aria-pressed={isFavorite}
          aria-label={`Favourite: ${song.title}`} title={isFavorite ? 'Unfavourite' : 'Favourite'}>
          <TransportIcon name="heart" size={18} />
        </button>
        <SongPlaylistPicker song={song} text />
        {!isCurrent && <button type="button" className="ghost music-row-text-btn" onClick={onPushToTop} aria-label={`Play next: ${song.title}`}>
          <TransportIcon name="playNext" size={16} />Play next
        </button>}
        <XButton
          onClick={onRemove}
          disabled={isCurrent}
          label="Remove"
          title={isCurrent ? "Can't remove the currently-playing track" : 'Remove from queue'}
        />
      </div>
      <div className="music-queue-row-actions music-song-mobile-actions">
        <SongActionsMenu song={song} isFavorite={isFavorite} isActive={isCurrent} onFavorite={onFavorite}
          canMoveUp={canMoveUp} canMoveDown={canMoveDown} onMoveUp={onMoveUp} onMoveDown={onMoveDown}
          onPlayNext={onPushToTop} onRemove={onRemove} />
      </div>
    </div>
  );
}

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
    canUndoClear, playQueueIndex, reorderQueue, reorderShuffleOrder, moveQueueItemToTop, removeFromQueue, toggleFavorite, clearQueue,
    undoClearQueue, playPlaylist, ready,
  } = useMusicPlayer();
  const playlistName = usePlaylistName(queueSource === 'playlist' ? playingPlaylistId : null);
  const source = queueSource === 'playlist' ? playlistName ?? 'a saved playlist' : queueSource === 'custom' ? 'your queue' : 'all songs';

  const displayList = useMemo(() => (shuffle && shuffleOrder
    ? shuffleOrder.map((queueIdx, displayPos) => ({ song: queue[queueIdx], queueIdx, displayPos }))
    : queue.map((song, queueIdx) => ({ song, queueIdx, displayPos: queueIdx }))).filter(entry => entry.song), [queue, shuffle, shuffleOrder]);
  const current = Math.min(shuffle && shuffleOrder ? shufflePosition : queueIndex, Math.max(0, displayList.length - 1));
  const playing = displayList[current]?.song.id === videoId && Boolean(videoId);

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
  const q = search.trim().toLowerCase();
  const matches = (song: QueueTrack) => !q || song.title.toLowerCase().includes(q) || Boolean(song.altTitle?.toLowerCase().includes(q))
    || Boolean(song.artist?.toLowerCase().includes(q));

  let run = 0;
  while (current + 1 + run < displayList.length && queued.has(displayList[current + 1 + run].song.id)) run += 1;
  const nowRow = displayList[current] ? [displayList[current]] : [];
  const nextInQueue = displayList.slice(current + 1, current + 1 + run);
  const rest = displayList.slice(current + 1 + run);
  const history = displayList.slice(0, current);

  const sections = [
    { key: 'now', title: playing ? 'Now playing' : 'Up first', rows: nowRow.filter(e => matches(e.song)), offset: 0 },
    { key: 'queued', title: 'Next in queue', rows: nextInQueue.filter(e => matches(e.song)), offset: 1 },
    { key: 'rest', title: `Next from ${source}`, rows: rest.filter(e => matches(e.song)), offset: 1 + run },
  ];
  const restShown = q ? sections[2].rows : sections[2].rows.slice(0, visible);
  const historyRows = history.filter(e => matches(e.song));

  const row = (entry: { song: QueueTrack; queueIdx: number; displayPos: number }, label: ReactNode) => {
    const { song, queueIdx, displayPos } = entry;
    const isCurrent = displayPos === current;
    return <QueueRow
      key={song.id}
      song={song}
      label={label}
      isFavorite={favorites.has(song.id)}
      onFavorite={() => toggleFavorite(song.id)}
      displayPos={displayPos}
      isActive={isCurrent && playing}
      isCurrent={isCurrent}
      isDragging={drag.dragPos === displayPos}
      dropSide={dropSide(displayPos)}
      onTap={() => playQueueIndex(queueIdx)}
      onDragStart={e => drag.startNative(e, displayPos, song.title)}
      onDragEnd={drag.cancel}
      onPointerDrag={e => drag.startPointer(e, displayPos, song.title)}
      canMoveUp={displayPos > current + 1 || (displayPos < current && displayPos > 0)}
      canMoveDown={displayPos < displayList.length - 1 && displayPos !== current && displayPos !== current - 1}
      onMoveUp={() => drag.move(displayPos, displayPos - 1)}
      onMoveDown={() => drag.move(displayPos, displayPos + 1)}
      onPushToTop={() => moveQueueItemToTop(queueIdx)}
      onRemove={() => removeFromQueue(queueIdx)}
    />;
  };

  const upcoming = displayList.length - current - 1;
  return (
    <section className="music-queue-panel music-queue-view" aria-labelledby="music-queue-heading">
      <div className="music-song-list-heading">
        <h2 className="section-title" id="music-queue-heading">Queue</h2>
        <div className="music-queue-tools">
          {canUndoClear
            ? <button type="button" className="ghost btn-sm" onClick={undoClearQueue}>Undo clear</button>
            : <button type="button" className="ghost btn-sm" onClick={clearQueue} disabled={upcoming <= 0 && history.length === 0}>Clear queue</button>}
        </div>
      </div>
      <p className="hint music-view-hint">
        Playing from <b>{source}</b>{displayList.length > 0 && <> · {upcoming} {upcoming === 1 ? 'song' : 'songs'} after this one</>}.
        {' '}Drag <span aria-hidden="true">⠿</span> to reorder; Library and Discover add songs.
      </p>
      <SearchInput label="Search the queue" name="queue-search" placeholder="Search the queue…" value={search} onChange={setSearch} />
      <div className={`music-queue-list${drag.nativeDragging ? ' music-queue-native-drag' : ''}`} data-song-list>
        {queueLoading && !displayList.length && <p className="hint" role="status">Loading the queue…</p>}
        {!queueLoading && !displayList.length && <p className="hint">The queue is empty. Add songs from the <Link href={MUSIC_VIEW_HREF.library} shallow scroll={false} prefetch={false}>Library</Link> or Discover.</p>}
        {sections.map(section => section.rows.length > 0 && (
          <Fragment key={section.key}>
            <h3 className="music-queue-section-title">{section.title}{section.key === 'queued' && <span className="music-heading-count"> · {nextInQueue.length}</span>}</h3>
            {(section.key === 'rest' ? restShown : section.rows).map(entry => row(entry,
              entry.displayPos === current ? <TransportIcon name={playing ? 'play' : 'next'} size={12} /> : entry.displayPos - current))}
          </Fragment>
        ))}
        {!q && shown && <LoadOnScroll shown={visible} total={sections[2].rows.length} onMore={() => setVisible(n => n + PAGE_SIZE)} />}
        {displayList.length > 0 && upcoming === 0 && !q && (
          <div className="music-queue-empty-next">
            <p className="hint music-queue-empty-next-text">Nothing plays after this song.{history.length > 0 ? ' Repeat all plays the songs below again.' : ''}</p>
            <div className="music-queue-tools">
              <Link href={MUSIC_VIEW_HREF.library} shallow scroll={false} prefetch={false} className="ghost btn-sm">Add from Library</Link>
              <button type="button" className="ghost btn-sm" disabled={!ready} onClick={() => void playPlaylist(null)}>Play all songs</button>
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
          {(showHistory || q) && historyRows.map(entry => row(entry, ''))}
        </>}
        {q && sections.every(s => !s.rows.length) && !historyRows.length && <p className="hint">No songs in the queue match your search.</p>}
      </div>
      {drag.feedback}
    </section>
  );
}
