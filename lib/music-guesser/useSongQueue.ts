import { useEffect, useMemo, useRef } from 'react';
import { pickSong } from './game';
import type { ClipStartPosition, SongChoice } from './game';
import { SongClipCache } from './songClipCache';

export function useSongQueue(songs: SongChoice[], currentId: string | undefined, startPosition: ClipStartPosition = 'beginning') {
  const cache = useMemo(() => new SongClipCache(undefined, startPosition === 'beginning'), [startPosition]);
  const upcoming = useRef<SongChoice | null>(null);
  const recent = useRef<string[]>([]);

  useEffect(() => {
    let disposed = false;
    if (!upcoming.current || upcoming.current.id === currentId || !songs.some((song) => song.id === upcoming.current?.id)) {
      upcoming.current = pickSong(songs, recent.current);
    }
    const nextId = upcoming.current?.id;
    cache.retain([currentId, nextId].filter((id): id is string => Boolean(id)));
    const preload = () => {
      if (!disposed && nextId) void cache.load(nextId).catch(() => { /* retry when this song is selected */ });
    };
    // Finish the current song first so preloading cannot compete with its
    // download/decode. On the selection screen, prepare the first song now.
    if (currentId) void cache.load(currentId).then(preload, preload);
    else preload();
    return () => { disposed = true; };
  }, [cache, songs, currentId]);

  useEffect(() => () => cache.clear(), [cache]);

  function takeNext() {
    const song = upcoming.current && songs.some((candidate) => candidate.id === upcoming.current?.id)
      ? upcoming.current : pickSong(songs, recent.current);
    upcoming.current = null;
    if (song) recent.current = [...recent.current, song.id].slice(-50);
    return song;
  }

  return { cache, takeNext };
}
