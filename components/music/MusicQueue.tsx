import { clearNoAutoplay } from '@/lib/music/noAutoplay';
import Link from 'next/link';
import { Fragment, type ReactNode, useMemo, useRef, useState } from 'react';
import { useClientLayoutEffect } from '@/lib/ui/useClientLayoutEffect';
import { useMusicPlayer, type QueueTrack } from '@/lib/music/musicPlayerContext';
import LoadOnScroll from '@/components/ui/LoadOnScroll';
import SearchInput from '@/components/ui/SearchInput';
import InfoPopover from '@/components/ui/InfoPopover';
import AlbumCover from './AlbumCover';
import SongRow from './SongRow';
import TransportIcon from './TransportIcons';
import { useSongQueueDrag } from './useSongQueueDrag';
import { queuePlaybackPositions, songTitle } from '@/lib/music/musicPolish';
import { createSongIndex } from '@/lib/music/songSearch';
import { gameSearchNames, songAllowed } from '@/lib/music/songFilter';
import { MUSIC_VIEW_HREF } from './MusicNav';

const PAGE_SIZE = 50;

export default function MusicQueue({ shown, close }: { shown: boolean; close?: ReactNode }) {
  const {
    queue, queueIndex, queueLoading, excludeCopyrighted, includeEndfield, shuffle, shuffleOrder, shufflePosition, videoId, favorites, queued, queueSource, queueView, history, playHistory, libraryTracks, repeatMode,
    canUndoClear, playQueueIndex, reorderQueue, reorderShuffleOrder, moveQueueItemToTop, removeFromQueue, toggleFavorite, noAutoplay, toggleNoAutoplay, clearQueue,
    undoClearQueue, autoplay, autoplayTracks, autoplayVideoId, currentTrack, setAutoplay, queueSong, playNow,
  } = useMusicPlayer();
  const [showAutoplay, setShowAutoplay] = useState(false);
  const [autoplayVisible, setAutoplayVisible] = useState(50);

  const displayList = useMemo(() => (shuffle && shuffleOrder
    ? shuffleOrder.map((queueIdx, displayPos) => ({ song: queue[queueIdx], queueIdx, displayPos }))
    : queue.map((song, queueIdx) => ({ song, queueIdx, displayPos: queueIdx }))).filter(entry => entry.song), [queue, shuffle, shuffleOrder]);
  const { current, boundary: playingBoundary } = queuePlaybackPositions({ queue, queueIndex, position: shuffle && shuffleOrder ? shufflePosition : queueIndex, videoId, autoplayVideoId, queued });
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

  const list = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState(() => queueView.current.search);
  const [visible, setVisible] = useState(() => Math.max(PAGE_SIZE, queueView.current.visible));
  useClientLayoutEffect(() => {
    if (list.current && shown) list.current.scrollTop = queueView.current.scrollTop;
  }, [queueView, shown]);
  useClientLayoutEffect(() => {
    queueView.current.search = search;
    queueView.current.visible = visible;
  }, [queueView, search, visible]);
  const [showHistory, setShowHistory] = useState(false);
  const q = search.trim();
  // The shared song search (lib/music/songSearch.ts), as a filter: the queue keeps its play order.
  const searchIndex = useMemo(() => createSongIndex([...queue, ...autoplayTracks], track => ({ ...track, extra: gameSearchNames(track.game) })), [queue, autoplayTracks]);
  const matches = useMemo(() => searchIndex.matches(search), [searchIndex, search]);
  // Filtered once for the autoplay rows and their count.
  const autoplayShown = useMemo(() => autoplayTracks.filter(matches), [autoplayTracks, matches]);

  const tracksById = useMemo(() => new Map(libraryTracks.map(track => [track.id, track])), [libraryTracks]);
  const heard = history.tracks.map((id, position) => ({ track: tracksById.get(id), position }));
  const forward = heard.slice(history.position + 1).filter(entry => entry.track && songAllowed({ excludeCopyrighted, includeEndfield }, entry.track));
  const lastForward = forward.at(-1)?.track;
  const frontier = lastForward ? displayList.findIndex(entry => entry.song.id === lastForward.id) : playingBoundary;
  const boundary = lastForward && frontier < 0 ? displayList.length - 1 : frontier;
  const previous = heard.slice(0, history.position).reverse().filter(entry => entry.track && matches(entry.track));
  let run = 0;
  while (boundary + 1 + run < displayList.length && queued.has(displayList[boundary + 1 + run].song.id)) run += 1;
  const nowRow = displayList[current] ? [displayList[current]] : [];
  const nextInQueue = displayList.slice(boundary + 1, boundary + 1 + run);
  const rest = displayList.slice(boundary + 1 + run);

  const sections = [
    { key: 'now', title: playing ? 'Now playing' : 'Up first', rows: nowRow.filter(e => matches(e.song)), offset: 0 },
    { key: 'queued', title: 'Added by you', rows: nextInQueue.filter(e => matches(e.song)), offset: 1 },
    { key: 'rest', title: queueSource ? 'Next from ' + queueSource.name : 'Up next', rows: rest.filter(e => matches(e.song)), offset: 1 + run },
  ];
  const restShown = q ? sections[2].rows : sections[2].rows.slice(0, visible);


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
            : queue.length > 0 && <button type="button" className="ghost btn-sm" onClick={clearQueue} disabled={queue.length === 1 && current >= 0}>Clear queue</button>}
          {close}
        </div>
      </div>
      {queueSource && <p className="hint music-view-hint">Playing from <Link href={queueSource.href}>{queueSource.name}</Link></p>}
      {history.position > 0 && <button type="button" className="ghost btn-sm music-queue-history-toggle" aria-expanded={showHistory} onClick={() => setShowHistory(!showHistory)}>History · {history.position}</button>}
      {repeatMode === 'one' && currentTrack && <p className="hint">Repeat one · {songTitle(currentTrack.title, currentTrack.altTitle)}</p>}
      {autoplayVideoId && currentTrack && <Link href={MUSIC_VIEW_HREF.player} shallow scroll={false} className="music-queue-now">
        <span className="music-queue-now-art"><AlbumCover coverPath={currentTrack.cover ?? null} size={48} className="music-queue-now-cover" /></span>
        <span className="music-queue-now-copy"><span className="label-tag">{forward.length ? 'Now playing' : 'Autoplay now'}</span><b>{songTitle(currentTrack.title, currentTrack.altTitle)}</b><span>{currentTrack.artist || currentTrack.album}</span></span>
        <TransportIcon name="nowPlaying" size={22} />
      </Link>}
      {(queue.length > (close ? 12 : 0) || search) && <SearchInput label="Search the queue" name="queue-search" placeholder="Search the queue…" value={search} onChange={setSearch} />}
      <div ref={list} onScroll={event => { queueView.current.scrollTop = event.currentTarget.scrollTop; }} className={`music-queue-list${drag.nativeDragging ? ' music-queue-native-drag' : ''}`} data-song-list>
        {queueLoading && !displayList.length && <p className="hint" role="status">Loading the queue…</p>}
        {!queueLoading && !displayList.length && !autoplayVideoId && <div className="music-queue-empty-state"><TransportIcon name="queue" size={32} /><h3>Your queue is empty</h3><div className="music-queue-tools"><Link href={MUSIC_VIEW_HREF.library} shallow scroll={false} prefetch={false} className="ghost btn-sm">Browse Library</Link><Link href={MUSIC_VIEW_HREF.discover} scroll={false} prefetch={false} className="ghost btn-sm">Discover music</Link></div></div>}
        {showHistory && <section aria-label="History"><h3>Recently played</h3>{previous.map(({ track, position }) => track && <SongRow key={position} song={track} onPlay={() => playHistory(position)} actions={{ playlist: true }} />)}</section>}
        {sections.map(section => (section.rows.length > 0 || (section.key === 'now' && forward.length > 0)) && (
          <Fragment key={section.key}>
            {section.rows.length > 0 && <h3 className="music-queue-section-title">{section.title}{section.key === 'queued' && <span className="music-heading-count"> · {nextInQueue.length}</span>}</h3>}
            {(section.key === 'rest' ? restShown : section.rows).map(entry => row(entry))}
            {section.key === 'now' && forward.length > 0 && <><h3>Up next</h3>{forward.map(({ track, position }) => track && matches(track) && <SongRow key={position} song={track} onPlay={() => playHistory(position)} actions={{ playlist: true }} />)}</>}
          </Fragment>
        ))}
        {!q && shown && <LoadOnScroll shown={visible} total={sections[2].rows.length} onMore={() => setVisible(n => n + PAGE_SIZE)} />}
        {displayList.length > 0 && upcoming === 0 && !forward.length && !q && (!autoplay || repeatMode !== 'off') && (
          <div className="music-queue-empty-next">
            <p className="hint music-queue-empty-next-text">{repeatMode === 'all' ? 'Repeats from ' + songTitle(displayList[0].song.title, displayList[0].song.altTitle) : repeatMode === 'one' ? 'This song repeats.' : 'Nothing plays after this song.'}</p>
            <div className="music-queue-tools">
              <Link href={MUSIC_VIEW_HREF.library} shallow scroll={false} prefetch={false} className="ghost btn-sm">Add from Library</Link>

            </div>
          </div>
        )}
        {q && sections.every(s => !s.rows.length) && !(showHistory && previous.length) && !forward.some(entry => entry.track && matches(entry.track)) && <p className="hint">No songs in the queue match your search.</p>}
        <section className="music-autoplay" aria-label="Autoplay from library">
          <div className="music-autoplay-heading">
            <button type="button" className="btn-bare music-autoplay-disclosure" aria-label="Autoplay from library" aria-expanded={showAutoplay} onClick={() => setShowAutoplay(value => !value)}>
              <span className="music-autoplay-glyph"><TransportIcon name="shuffle" size={22} /></span>
              <span><b>Autoplay from library</b><span className="label-tag">{autoplayTracks.length} songs</span></span><TransportIcon name={showAutoplay ? 'up' : 'down'} size={14} />
            </button>
            <div className="music-autoplay-controls"><InfoPopover label="About autoplay"><p>{autoplay ? 'Plays after your queue ends. Repeat all keeps repeating your chosen queue.' : 'Off. Only your chosen songs will play.'}</p></InfoPopover><label className="check"><input type="checkbox" aria-label="Autoplay from library" checked={autoplay} onChange={event => setAutoplay(event.target.checked)} />{autoplay ? 'On' : 'Off'}</label></div>
          </div>
          {showAutoplay && <>
            {noAutoplay.size > 0 && <p className="hint music-autoplay-kept-out">
              {noAutoplay.size === 1 ? '1 song is' : `${noAutoplay.size} songs are`} kept out of autoplay.{' '}
              <button type="button" className="ghost btn-sm" onClick={() => clearNoAutoplay()}>Let {noAutoplay.size === 1 ? 'it' : 'them all'} back</button>
            </p>}
            <div className="music-autoplay-list">
              {autoplayShown.slice(0, autoplayVisible).map(track => <SongRow key={track.id} marker="music-autoplay-row" song={track}
                active={track.id === videoId} onPlay={() => playNow(track.id)}
                actions={{
                  playNow: () => playNow(track.id),
                  playNext: () => void queueSong(track.id, 'next'),
                  addToQueue: () => void queueSong(track.id, 'last'),
                  favorite: { on: favorites.has(track.id), toggle: () => toggleFavorite(track.id) },
                  noAutoplay: { on: false, toggle: () => toggleNoAutoplay(track.id) },
                  playlist: true,
                }} />)}
              <LoadOnScroll shown={autoplayVisible} total={autoplayShown.length} onMore={() => setAutoplayVisible(value => value + 50)} />
            </div>
          </>}
        </section>
      </div>
      {drag.feedback}
    </section>
  );
}
