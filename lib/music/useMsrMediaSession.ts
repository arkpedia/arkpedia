import { useEffect, useRef, useState } from 'react';
import { songTitle } from './musicPolish';
import { MSR_LABEL } from './songArt';

interface SessionTrack {
  title: string;
  altTitle?: string | null;
  album?: string | null;
}

/** What the page says of the song beyond its title (lib/music/songArt.ts): its artist, the
 *  catalogue's or Monster Siren's, and its one picture. `artworkPending`: Monster Siren's cover may
 *  still come (its art is being asked for), so the picture waits for it a moment. */
interface SessionArt {
  artist: string | null;
  album: string | null;
  artwork: MediaImage[];
  artworkPending: boolean;
}

interface SessionActions {
  play: () => void;
  pause: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
}

interface SessionOptions {
  /** A song is loaded and Monster Siren's audio plays it (the player's engineKind). */
  msr: boolean;
  /** The track id loaded, which the picture's wait is counted for. */
  trackId: string;
  track: SessionTrack | undefined;
  /** Sound is coming out: the engine heard the clock move (lib/music/playbackEngine.ts). A play
   *  asked for and still loading is not playing, here or on the lock screen. */
  playing: boolean;
  art: SessionArt;
  actions: SessionActions;
  /** Where the song is and how long it is, read as the state changes. */
  position: () => { seconds: number; duration: number };
  /** The <audio> Monster Siren plays through, whose events keep the lock screen's clock true. */
  element: HTMLAudioElement | null;
}

const ACTIONS = ['play', 'pause', 'nexttrack', 'previoustrack', 'seekto'] as const;
/** How long the lock screen's picture waits for Monster Siren's cover before taking the next best. */
export const ARTWORK_WAIT_MS = 1500;
/** How often, while playing, the lock screen is told where the song is (besides every change). */
const POSITION_EVERY_MS = 5000;

/**
 * The lock screen's and the media keys' view of a song played from Monster Siren (the Media
 * Session API). A song played from YouTube plays inside YouTube's iframe, which tells the
 * browser about it itself; one played from Monster Siren plays from this page's own <audio>
 * (lib/music/playbackEngine.ts) -- every song with a Monster Siren id, unless Data saver is on --
 * so the page says what it is -- title, artist, album and cover -- and takes play, pause, next,
 * previous and seek from there, and says how long it is and where it is. While YouTube plays the
 * page says nothing and leaves the session to YouTube.
 *
 * The picture is one image (lib/music/songArt.ts's sessionArtwork), set once: while Monster
 * Siren's cover is still being asked for, the title and artist are set with no picture, and the
 * picture follows when the cover answers or after ARTWORK_WAIT_MS -- never the site's icon first
 * and the cover after, which Safari may not swap.
 *
 * The lock screen runs its own clock from the position it was last given while it is told
 * "playing": an iPhone ran it to 1:41 over a song that stayed silent at 0:00. So it is told
 * "playing" only while sound is coming out (`playing`), "paused" while a play is loading or the
 * audio waits for data, and where the song is at every play, pause, seek, rate change and wait,
 * and every few seconds while it plays.
 */
export function useMsrMediaSession({ msr, trackId, track, playing, art, actions, position, element }: SessionOptions) {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const positionRef = useRef(position);
  positionRef.current = position;
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const title = track ? songTitle(track.title, track.altTitle) : '';
  const artist = art.artist ?? MSR_LABEL;
  const album = track?.album ?? art.album ?? '';

  // The picture waits for Monster Siren's cover, a moment at most, once per track.
  const [waitedFor, setWaitedFor] = useState('');
  useEffect(() => {
    if (!msr || !art.artworkPending) return;
    const timer = window.setTimeout(() => setWaitedFor(trackId), ARTWORK_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [msr, trackId, art.artworkPending]);
  const holdArtwork = art.artworkPending && waitedFor !== trackId;
  // A key for the picture, so the metadata is set again only when it changes.
  const artworkKey = holdArtwork ? '[]' : JSON.stringify(art.artwork);

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
        const at = positionRef.current();
        tell(session, { seconds: details.seekTime, duration: at.duration }, element);
      },
    };
    for (const action of ACTIONS) {
      try { session.setActionHandler(action, handlers[action]); } catch { /* not supported here */ }
    }
  }, [msr, title, artist, album, artworkKey, element]);

  // Playing or paused, as the sound is, and where the song is.
  useEffect(() => {
    const session = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
    if (!session || !msr) return;
    session.playbackState = playing ? 'playing' : 'paused';
    tell(session, positionRef.current(), element);
  }, [msr, playing, title, element]);

  // The element's own changes, between the player's.
  useEffect(() => {
    const session = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
    if (!session || !msr || !element) return;
    let toldAt = 0;
    const update = () => {
      toldAt = Date.now();
      tell(session, positionRef.current(), element);
    };
    // Waiting for data: the lock screen's clock stops at once, before the player's state follows.
    const waiting = () => {
      session.playbackState = 'paused';
      update();
    };
    const ticking = () => { if (playingRef.current && Date.now() - toldAt >= POSITION_EVERY_MS) update(); };
    const changes = ['playing', 'pause', 'seeked', 'ratechange', 'durationchange'] as const;
    for (const type of changes) element.addEventListener(type, update);
    element.addEventListener('waiting', waiting);
    element.addEventListener('timeupdate', ticking);
    return () => {
      for (const type of changes) element.removeEventListener(type, update);
      element.removeEventListener('waiting', waiting);
      element.removeEventListener('timeupdate', ticking);
    };
  }, [msr, element]);
}

/** The lock screen's position: where the song is, how long it is, at the element's rate. Whether
 *  its clock runs is playbackState's to say (a rate of 0 is not allowed). */
function tell(session: MediaSession, at: { seconds: number; duration: number }, element: HTMLAudioElement | null) {
  if (!(at.duration > 0) || !Number.isFinite(at.duration) || typeof session.setPositionState !== 'function') return;
  const rate = element && element.playbackRate > 0 ? element.playbackRate : 1;
  try {
    session.setPositionState({ duration: at.duration, position: Math.min(Math.max(0, at.seconds || 0), at.duration), playbackRate: rate });
  } catch { /* not supported here */ }
}
