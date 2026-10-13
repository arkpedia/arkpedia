import { useEffect, useRef } from 'react';
import { songTitle } from './musicPolish';
import { isMsrTrackId } from './trackId';

interface SessionTrack {
  title: string;
  altTitle?: string | null;
  artist?: string | null;
  album?: string | null;
  cover?: string | null;
}

interface SessionActions {
  play: () => void;
  pause: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
}

const ACTIONS = ['play', 'pause', 'nexttrack', 'previoustrack', 'seekto'] as const;

/**
 * The lock screen's and the media keys' view of a Monster Siren song (the Media Session API).
 * A YouTube song is played inside YouTube's iframe, which tells the browser about it itself; a
 * Monster Siren song plays from this page's own <audio> (lib/music/playbackEngine.ts), so the
 * page says what it is -- title, artist, album and cover -- and takes play, pause, next,
 * previous and seek from there. While a YouTube song plays the page says nothing and leaves the
 * session to YouTube.
 */
export function useMsrMediaSession(trackId: string, track: SessionTrack | undefined, isPlaying: boolean,
  coverUrl: (path: string) => string, actions: SessionActions) {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const msr = Boolean(trackId) && isMsrTrackId(trackId);
  const title = track ? songTitle(track.title, track.altTitle) : '';
  const artist = track?.artist ?? 'Monster Siren Records';
  const album = track?.album ?? '';
  const cover = track?.cover ? coverUrl(track.cover) : '';

  useEffect(() => {
    const session = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
    if (!session || typeof MediaMetadata === 'undefined') return;
    if (!msr) {
      session.metadata = null;
      session.playbackState = 'none';
      for (const action of ACTIONS) {
        try { session.setActionHandler(action, null); } catch { /* not supported here */ }
      }
      return;
    }
    session.metadata = new MediaMetadata({ title, artist, album, artwork: cover ? [{ src: cover }] : [] });
    const handlers: Record<(typeof ACTIONS)[number], MediaSessionActionHandler> = {
      play: () => actionsRef.current.play(),
      pause: () => actionsRef.current.pause(),
      nexttrack: () => actionsRef.current.next(),
      previoustrack: () => actionsRef.current.previous(),
      seekto: (details) => { if (typeof details.seekTime === 'number') actionsRef.current.seek(details.seekTime); },
    };
    for (const action of ACTIONS) {
      try { session.setActionHandler(action, handlers[action]); } catch { /* not supported here */ }
    }
  }, [msr, title, artist, album, cover]);

  useEffect(() => {
    const session = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
    if (session && msr) session.playbackState = isPlaying ? 'playing' : 'paused';
  }, [msr, isPlaying]);
}
