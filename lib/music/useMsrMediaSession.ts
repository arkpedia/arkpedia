import { useEffect, useRef } from 'react';
import { songTitle } from './musicPolish';
import { MSR_LABEL } from './songArt';

interface SessionTrack {
  title: string;
  altTitle?: string | null;
  album?: string | null;
}

/** What the page says of the song beyond its title (lib/music/songArt.ts): its artist, the
 *  catalogue's or Monster Siren's, and its artwork, never an empty list. */
interface SessionArt {
  artist: string | null;
  album: string | null;
  artwork: MediaImage[];
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
 * The lock screen's and the media keys' view of a song played from Monster Siren (the Media
 * Session API). A song played from YouTube plays inside YouTube's iframe, which tells the
 * browser about it itself; one played from Monster Siren plays from this page's own <audio>
 * (lib/music/playbackEngine.ts) -- every song with a Monster Siren id, unless Data saver is on --
 * so the page says what it is -- title, artist, album and cover -- and takes play, pause, next,
 * previous and seek from there, and says how long it is and where it is. While YouTube plays the
 * page says nothing and leaves the session to YouTube.
 *
 * The artwork is a list of absolute, encoded addresses with their sizes and types, JPEGs first
 * (lib/music/songArt.ts's sessionArtwork): a song described with the site's WebP cover alone
 * showed a blank white square on an iPhone's lock screen.
 *
 * `msr`: a song is loaded and Monster Siren's audio plays it (the player's engineKind).
 * `position`: where the song is and how long it is, read as the state changes.
 */
export function useMsrMediaSession(msr: boolean, track: SessionTrack | undefined, isPlaying: boolean,
  art: SessionArt, actions: SessionActions, position?: () => { seconds: number; duration: number }) {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const positionRef = useRef(position);
  positionRef.current = position;
  const title = track ? songTitle(track.title, track.altTitle) : '';
  const artist = art.artist ?? MSR_LABEL;
  const album = track?.album ?? art.album ?? '';
  // A key for the list, so the metadata is set again only when an entry changes.
  const artworkKey = JSON.stringify(art.artwork);

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
    session.metadata = new MediaMetadata({ title, artist, album, artwork: JSON.parse(artworkKey) as MediaImage[] });
    const handlers: Record<(typeof ACTIONS)[number], MediaSessionActionHandler> = {
      play: () => actionsRef.current.play(),
      pause: () => actionsRef.current.pause(),
      nexttrack: () => actionsRef.current.next(),
      previoustrack: () => actionsRef.current.previous(),
      seekto: (details) => {
        if (typeof details.seekTime !== 'number') return;
        actionsRef.current.seek(details.seekTime);
        const at = positionRef.current?.();
        if (at && at.duration > 0 && typeof session.setPositionState === 'function') {
          try { session.setPositionState({ duration: at.duration, position: Math.min(Math.max(0, details.seekTime), at.duration), playbackRate: 1 }); } catch { /* not supported here */ }
        }
      },
    };
    for (const action of ACTIONS) {
      try { session.setActionHandler(action, handlers[action]); } catch { /* not supported here */ }
    }
  }, [msr, title, artist, album, artworkKey]);

  useEffect(() => {
    const session = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
    if (!session || !msr) return;
    session.playbackState = isPlaying ? 'playing' : 'paused';
    // The lock screen's progress bar runs from here by itself while playing.
    const at = positionRef.current?.();
    if (!at || !(at.duration > 0) || typeof session.setPositionState !== 'function') return;
    try {
      session.setPositionState({ duration: at.duration, position: Math.min(Math.max(0, at.seconds), at.duration), playbackRate: 1 });
    } catch { /* not supported here */ }
  }, [msr, isPlaying, title]);
}
