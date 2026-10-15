import type { DragEvent, PointerEvent } from 'react';
import AlbumCover from './AlbumCover';
import SongActionsMenu from './SongActionsMenu';
import SongPlaylistPicker from './SongPlaylistPicker';
import TransportIcon from './TransportIcons';
import XButton from '@/components/ui/XButton';
import { songTitle } from '@/lib/music/musicPolish';

/**
 * Every song list's row: Discover's results, the Library (all songs and favourites), the Queue
 * (your queue and autoplay), Now playing's Up next and the saved playlists. One markup and one
 * CSS block (.music-song-row in styles/music/music.css), so a song looks the same wherever it is
 * listed: the album art at one size and inset, its title, then artist · album, and its actions
 * as icon buttons whose name shows on hover and focus (a phone has one More menu instead, beside
 * the heart: Favourite is one press on every row at every width, never inside a menu).
 *
 * Variants are modifiers of the same row, never other markup: the song playing (active, ▶ on its
 * art), the queue's current song (current: not dragged or removed), a queued badge, a draggable
 * queue row (its handle last, so the art keeps its inset), and a saved playlist's song the
 * catalogue no longer has (disabled). Before 2026-10-13 four views drew four rows, and
 * Discover's unplayable songs a fifth with its art flush against the edge. A song with no YouTube
 * upload is an ordinary row: the player plays it from Monster Siren (lib/music/trackId.ts).
 */
export interface SongRowSong {
  id: string;
  title: string;
  altTitle?: string | null;
  artist?: string | null;
  album?: string | null;
  cover?: string | null;
}

/** The actions a list offers; a missing one is left out on both the icon row and the menu. */
export interface SongRowActions {
  /** The phone menu's Play now (the row itself plays the song everywhere). */
  playNow?: () => void;
  playNext?: () => void;
  addToQueue?: () => void;
  favorite?: { on: boolean; toggle: () => void };
  playlist?: boolean;
  remove?: { run: () => void; label: string };
  reorder?: { canUp: boolean; canDown: boolean; up: () => void; down: () => void };
}

export interface SongRowDrag {
  /** The song playing: kept in place, so it has no handle (an empty slot keeps the column). */
  locked: boolean;
  dragging: boolean;
  dropSide: 'before' | 'after' | null;
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
}

export interface SongRowProps {
  song: SongRowSong;
  /** The list's own unstyled class (music-queue-row, music-library-row, ...), for tests and the
   *  drag controller: it rides on .music-song-row and styles nothing. */
  marker?: string;
  active?: boolean;
  current?: boolean;
  queued?: boolean;
  /** A saved playlist's song the catalogue no longer has: shown, not playable, no actions. */
  disabled?: boolean;
  onPlay?: () => void;
  actions?: SongRowActions;
  drag?: SongRowDrag;
  data?: Record<string, string | number>;
}

function ActionButton({ label, tip, icon, onClick, pressed }: { label: string; tip: string; icon: Parameters<typeof TransportIcon>[0]['name']; onClick: () => void; pressed?: boolean }) {
  return <button type="button" className={`ghost music-song-action${pressed !== undefined ? ' music-song-favorite' : ''}`} aria-label={label} data-tip={tip}
    aria-pressed={pressed} onClick={onClick}>
    <TransportIcon name={icon} size={18} />
  </button>;
}

export default function SongRow({ song, marker, active = false, current = false, queued = false, disabled = false, onPlay, actions = {}, drag, data }: SongRowProps) {
  const title = songTitle(song.title, song.altTitle);
  // The second line: artist · album. On a wide screen the album has its own column instead, so
  // the line keeps only what remains.
  const lead = song.artist;
  const classes = ['music-song-row', marker, active && 'active', current && 'current', queued && 'queued', disabled && 'disabled',
    drag && 'draggable', drag?.dragging && 'dragging', drag?.dropSide && `drop-${drag.dropSide}`].filter(Boolean).join(' ');
  const body = <>
    <span className="music-song-row-art">
      <AlbumCover coverPath={song.cover ?? null} size={40} className="music-song-row-cover" />
      {active && <span className="music-song-row-playing" aria-hidden="true"><TransportIcon name="play" size={14} /></span>}
    </span>
    <span className="music-song-row-text">
      <span className="music-song-row-title">{title}</span>
      {(lead || song.album) && <span className="music-song-row-sub">
        {lead}{lead && song.album && <span className="music-song-row-sub-album"> · </span>}{song.album && <span className="music-song-row-sub-album">{song.album}</span>}
      </span>}
    </span>
    {song.album && <span className="music-song-row-album">{song.album}</span>}
  </>;
  const { playNow, playNext, addToQueue, favorite, playlist, remove, reorder } = actions;
  const menu = !disabled && (favorite || playlist || playNow || playNext || addToQueue || remove || reorder);
  return <div className={classes} data-song-id={song.id} {...Object.fromEntries(Object.entries(data ?? {}).map(([key, value]) => [`data-${key}`, value]))}
    draggable={drag ? !drag.locked : undefined} onDragStart={drag && !drag.locked ? drag.onDragStart : undefined} onDragEnd={drag?.onDragEnd}>
    <button type="button" className="btn-bare music-song-row-main" disabled={disabled} title={title} aria-label={disabled ? title : active ? `${title}, playing now` : `Play ${title} now`} onClick={onPlay}>{body}</button>
    {queued && !active && <span className="music-song-row-badge">Queued</span>}
    {menu && <div className="music-song-row-actions music-song-desktop-actions">
      {playNext && <ActionButton label={`Play next: ${title}`} tip="Play next" icon="playNext" onClick={playNext} />}
      {addToQueue && <ActionButton label={`Add to queue: ${title}`} tip="Add to queue" icon="addToQueue" onClick={addToQueue} />}
      {favorite && <ActionButton label={`Favourite: ${title}`} tip={favorite.on ? 'Unfavourite' : 'Favourite'} icon="heart" pressed={favorite.on} onClick={favorite.toggle} />}
      {playlist && <SongPlaylistPicker row song={{ id: song.id, title }} />}
      {/* Remove is the site's × (XButton), as every remove/close icon is (tests/browser/x-buttons). */}
      {remove && <XButton label={`${remove.label}: ${title}`} data-tip={remove.label} onClick={remove.run} />}
    </div>}
    {menu && <div className="music-song-row-actions music-song-mobile-actions">
      {favorite && <ActionButton label={`Favourite: ${title}`} tip={favorite.on ? 'Unfavourite' : 'Favourite'} icon="heart" pressed={favorite.on} onClick={favorite.toggle} />}
      <SongActionsMenu song={{ id: song.id, title }} isActive={current || active}
        onPlayNow={playNow} onQueueNext={reorder ? undefined : playNext} onQueueLast={addToQueue}
        canMoveUp={reorder?.canUp} canMoveDown={reorder?.canDown} onMoveUp={reorder?.up} onMoveDown={reorder?.down}
        onPlayNext={reorder ? playNext : undefined} onRemove={remove?.run} />
    </div>}
    {drag && (drag.locked
      ? <span className="music-song-row-handle music-song-row-handle-spacer" aria-hidden="true" />
      : <button type="button" className="btn-bare music-song-row-handle music-queue-drag-handle" aria-label={`Reorder ${title}`} data-tip="Drag to reorder"
        onPointerDown={drag.onPointerDown} onKeyDown={event => {
          if (event.key === 'ArrowUp' && reorder?.canUp) { event.preventDefault(); reorder.up(); }
          if (event.key === 'ArrowDown' && reorder?.canDown) { event.preventDefault(); reorder.down(); }
        }}>⠿</button>)}
  </div>;
}
