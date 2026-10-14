import { GetStaticProps } from 'next';
import Head from 'next/head';
import Image, { ContentImg } from '@/components/content/ContentImage';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getAllSongModalLookup, writeLyricsFilesToPublic, SongModalLookupEntry } from '@/lib/music/albumsDataServer';
import { withContentPage } from '@/lib/content/server';
import { useContentUrl } from '@/lib/content/context';
import type { LyricLine } from '@/lib/music/albumsDataServer';
import { useMusicPlayer } from '@/lib/music/musicPlayerContext';
import { songTitle, upcomingIndices, lyricPreview } from '@/lib/music/musicPolish';
import { useCrossFadeTitle } from '@/lib/music/useCrossFadeTitle';
import { lyricsPath, youtubeWatchUrl } from '@/lib/music/trackId';
import MusicWaveVisualizer from '@/components/music/MusicWaveVisualizer';
import MusicPlaylists from '@/components/music/MusicPlaylists';
import MusicLibrary from '@/components/music/MusicLibrary';
import MusicQueue from '@/components/music/MusicQueue';
import MusicNav, { MUSIC_VIEW_HREF } from '@/components/music/MusicNav';
import MusicTransportBar from '@/components/music/MusicTransportBar';
import SongRow from '@/components/music/SongRow';
import PageHeader from '@/components/ui/PageHeader';
import { hiddenUnless } from '@/lib/ui/inert';
import { isDirectImage } from '@/lib/music/songArt';

interface Props {
  songLookup: SongModalLookupEntry[];
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Displays the role exactly as it appears in the source JSON (artist,
// performer, composer, arranger, producer, lyrics), just capitalized
// -- not translated into different wording (e.g. "Singer" for
// "artist"), which was the actual bug: it made the label look
// disconnected from what's really in the data.
function formatRoleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

// Module-level per-song cache -- same pattern as SongDetailModal.tsx
// used before it: each song's lyrics are fetched at most once per
// session, from lyrics/{track}.json (lib/music/trackId.ts lyricsPath), not embedded in this page's own
// static props.
//
// The address is passed in rather than built here: this is module scope, so it
// cannot read the release from context, and a lyric file belongs to a release the
// same way a stage detail does. A required parameter rather than an optional one
// so a caller cannot quietly fall back to the deploy-time copy. The cache is keyed
// by the resolved URL for the same reason -- a new release must not be answered
// from the previous release's lyrics.
const lyricsCache = new Map<string, LyricLine[]>();
const lyricsPromises = new Map<string, Promise<LyricLine[]>>();
function fetchLyricsFor(url: string): Promise<LyricLine[]> {
  const cached = lyricsCache.get(url);
  if (cached) return Promise.resolve(cached);
  let promise = lyricsPromises.get(url);
  if (!promise) {
    promise = fetch(url)
      .then((res) => res.json())
      .then((lines: LyricLine[]) => {
        lyricsCache.set(url, lines);
        return lines;
      })
      .catch(() => {
        lyricsPromises.delete(url);
        return [];
      });
    lyricsPromises.set(url, promise);
  }
  return promise;
}

export default function MusicPage({ songLookup }: Props) {
  const contentUrl = useContentUrl();
  const {
    ready,
    isPlaying,
    title,
    videoId,
    volume,
    shuffle,
    repeatMode,
    currentTime,
    queue,
    currentTrack, autoplay, autoplayTracks, autoplayVideoId, queued, playNow,
    queueIndex,
    shuffleOrder,
    shufflePosition,
    queueLoading,
    initializePlayer,
    playQueueIndex,
    favorites,
    toggleFavorite,
    nowPlayingCover: fallbackCover,
    nowPlayingArtist,
  } = useMusicPlayer();
  const router = useRouter();

  // The YouTube player otherwise only starts initializing on an
  // explicit action elsewhere (pressing play, expanding the mini-
  // player) -- visiting this dedicated page is a clear enough signal
  // of intent to start it proactively instead of leaving "Now Playing"
  // stuck on "Loading..." until something else triggers it.
  useEffect(() => {
    initializePlayer();
  }, [initializePlayer]);

  // The view is the address (?view=library|player|queue), and the nav and the transport link
  // to each with a shallow push: Back and Forward step between them, a view can be reloaded or
  // shared, and the player under them never reloads. With no ?view the page opens where there is
  // something to do: Now playing when a song has played this session, else the Library. Decided
  // once, on mount (the player context outlives the page, so a song started elsewhere is known
  // here), so the view never swaps under the reader; server and client both start from "nothing
  // played", and the URL's view applies once the router has read it.
  const [initialView] = useState<'player' | 'library'>(() => (videoId ? 'player' : 'library'));
  const viewParam = router.isReady ? router.query.view : undefined;
  const view: 'player' | 'queue' | 'library' = viewParam === 'queue' || viewParam === 'player' || viewParam === 'library' ? viewParam : initialView;
  const [mobileShowLyrics, setMobileShowLyrics] = useState(false);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [lyricsLoading, setLyricsLoading] = useState(false);


  const detailByVideoId = useMemo(() => new Map(songLookup.map((s) => [s.videoId, s])), [songLookup]);
  const currentDetail = detailByVideoId.get(videoId);
  // The album's cover: from this page's release props, else from the player's catalogue (a song
  // a release compiled before Monster Siren songs were listed here has its cover only there),
  // else the player's fallback: Monster Siren's own cover or the YouTube thumbnail (lib/music/songArt.ts).
  const nowPlayingCover = currentDetail?.coverPath ?? currentTrack?.cover ?? fallbackCover ?? null;

  // From this page's release props, like the credits: a lyric file is published for exactly
  // the songs whose lyrics parse, which is what this flag says, so the Lyrics button never
  // offers a file the release does not have.
  const hasLyrics = Boolean(currentDetail?.hasLyrics);

  // If the currently-playing song has no lyrics, force back to the
  // album art view. Without this, a listener viewing lyrics for one
  // song who then advances (or auto-advances) into a song with none
  // gets stuck: mobileShowLyrics stays true, the lyrics panel keeps
  // showing (now just "No lyrics available"), and the only button that
  // could toggle it back only renders when hasLyrics is true -- so it
  // vanishes right when it's needed most, with the panel showing
  // itself but nothing on it and no way out.
  useEffect(() => {
    if (!hasLyrics) setMobileShowLyrics(false);
  }, [hasLyrics]);

  // Fetch (or reuse the cached) lyrics whenever the playing song
  // changes -- not on every render, and not preloaded for the whole
  // catalog.
  useEffect(() => {
    if (!videoId || !hasLyrics) {
      setLyrics([]);
      return;
    }
    let cancelled = false;
    setLyricsLoading(true);
    fetchLyricsFor(contentUrl(lyricsPath(videoId))).then((lines) => {
      if (!cancelled) {
        setLyrics(lines);
        setLyricsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [videoId, hasLyrics, contentUrl]);

  // The currently-singing line -- the last line whose own timestamp
  // has already passed, per the actual playback position.
  const activeLineIndex = useMemo(() => {
    if (!lyrics.some(line => line.time > 0)) return -1;
    let idx = -1;
    for (let i = 0; i < lyrics.length; i++) {
      if (lyrics[i].time <= currentTime) idx = i;
      else break;
    }
    return idx;
  }, [lyrics, currentTime]);

  // Auto-scrolls the active line to center as playback advances
  // (karaoke-style), but a manual scroll pauses that for a few seconds
  // so looking ahead/back at other lyrics isn't immediately fought by
  // the next auto-scroll tick -- same "pause after manual interaction"
  // pattern used elsewhere on this site (e.g. the nav's hover-expand).
  const activeLineRef = useRef<HTMLParagraphElement | null>(null);
  const suppressAutoScrollRef = useRef(false);
  const suppressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Not while the song list is shown: the player behind it is hidden, and centring its line
    // would scroll the page instead.
    if (suppressAutoScrollRef.current || view !== 'player' || !mobileShowLyrics) return;
    // Honors the reduced-motion preference: the active line still gets
    // centered (that's function, not decoration), just without
    // animating the travel there.
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const line = activeLineRef.current;
    const panel = line?.parentElement;
    if (line && panel) panel.scrollTo({ top: panel.scrollTop + line.getBoundingClientRect().top - panel.getBoundingClientRect().top - (panel.clientHeight - line.clientHeight) / 2, behavior: smooth ? 'smooth' : 'auto' });
  }, [activeLineIndex, view, mobileShowLyrics]);

  useEffect(() => {
    return () => {
      if (suppressTimeoutRef.current) clearTimeout(suppressTimeoutRef.current);
    };
  }, []);

  function handleLyricsScroll() {
    suppressAutoScrollRef.current = true;
    if (suppressTimeoutRef.current) clearTimeout(suppressTimeoutRef.current);
    suppressTimeoutRef.current = setTimeout(() => {
      suppressAutoScrollRef.current = false;
    }, 4000);
  }

  // A Monster Siren song (lib/music/trackId.ts) has no YouTube page to link to.
  const youtubeUrl = youtubeWatchUrl(videoId);
  const catalogTitle = currentTrack?.title || title || 'Nothing playing yet';
  const { displayName: nowPlayingName, fading: titleFading } = useCrossFadeTitle(catalogTitle, currentTrack?.altTitle);

  // Screen-reader announcement when the track changes -- the visible title swap is purely
  // visual. The first track a session sees is seeded WITHOUT announcing: hydration picking up a
  // loaded queue should not speak a title nobody asked for. (The global mini player runs the same
  // announcer elsewhere and stays quiet in the music section, so a change is spoken once.)
  const [nowPlayingAnnouncement, setNowPlayingAnnouncement] = useState('');
  const announcedVideoIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!videoId) return;
    if (announcedVideoIdRef.current === null) {
      announcedVideoIdRef.current = videoId;
      return;
    }
    if (announcedVideoIdRef.current !== videoId) {
      announcedVideoIdRef.current = videoId;
      setNowPlayingAnnouncement(`Now playing: ${catalogTitle}`);
    }
  }, [videoId, catalogTitle]);

  // Up next on Now playing: the next three in the order they play, each a press away. Always three
  // rows tall, so the player (which sets the views' height) does not grow as the queue arrives.
  const order = shuffle && shuffleOrder ? shuffleOrder : queue.map((_, i) => i);
  const position = shuffle && shuffleOrder ? shufflePosition : queueIndex;
  const pending = autoplayVideoId ? order.filter(index => queued.has(queue[index]?.id)) : [];
  const nextPosition = autoplayVideoId ? pending.length ? order.indexOf(pending[0]) - 1 : order.length - 1 : videoId ? position : -1;
  const nextChosen = upcomingIndices(order, nextPosition, repeatMode).map(index => ({ song: queue[index], index })).filter(e => e.song);
  const upNext = repeatMode === 'one' ? [] : [...nextChosen, ...(autoplay && (repeatMode !== 'all' || !queue.length) ? autoplayTracks.slice(0, 3 - nextChosen.length).map(song => ({ song, index: -1 })) : [])];
  const preview = lyricPreview(lyrics, currentTime);

  return (
    <>
      <Head><title>{`${view === 'library' ? 'Library' : view === 'queue' ? 'Queue' : 'Now playing'} · Music — Arkpedia`}</title></Head>

      <PageHeader slim compact eyebrow="Sound Archive" title="Music" actions={<MusicPlaylists songs={songLookup} />} />
      <main className="music-player-page">
        <MusicNav current={view} />
        <div className="visually-hidden" aria-live="polite">
          {nowPlayingAnnouncement}
        </div>
        {/* The three views in one place (the Anti-Page Jump rule's swap in place): Now playing
            always lays out and so sets the place's height, hidden and inert while Library or
            Queue lies over it, and those two keep their own size contained, so switching changes
            nothing above or below. Library and Queue stay mounted while hidden: their searches and
            scroll positions survive a trip to the other and back. */}
        {/* A view counts as opened (loads its songs) only once the router has read ?view: the
            first render shows the default view, and must not load the Library behind a Queue. */}
        <div className="music-view" data-music-view={view}>
          <div className={`music-now-playing${view === 'player' ? '' : ' music-now-playing-behind'}`} aria-hidden={view === 'player' ? undefined : true} {...hiddenUnless(view === 'player')}>

            <div className="music-now-playing-cover-col">
              <div className="music-now-playing-cover">
                {nowPlayingCover && isDirectImage(nowPlayingCover) ? (
                  <ContentImg src={nowPlayingCover} alt={currentDetail?.albumName || currentTrack?.album || title} className="music-now-playing-cover-img" />
                ) : nowPlayingCover ? (
                  <Image src={nowPlayingCover} alt={currentDetail?.albumName || currentTrack?.album || title} fill sizes="280px" style={{ objectFit: 'cover' }} />
                ) : (
                  <span className="music-now-playing-cover-fallback">♪</span>
                )}
              </div>
            </div>

            <div className="music-now-playing-song-info">
              <h2>
                <span className={titleFading ? 'music-crossfade-text fading' : 'music-crossfade-text'}>
                  {ready ? nowPlayingName : 'Loading…'}
                </span>
              </h2>
              <div className="music-now-playing-credits">
                {currentDetail?.credits && currentDetail.credits.length > 0 ? (
                  currentDetail.credits.map((c) => (
                    <span key={c.role}>
                      <b>{formatRoleLabel(c.role)}:</b> {c.names.join(', ')}
                    </span>
                  ))
                ) : videoId && nowPlayingArtist ? (
                  /* A song the release has no credits for yet: the artist Monster Siren credits. */
                  <span><b>{formatRoleLabel('artist')}:</b> {nowPlayingArtist}</span>
                ) : (
                  /* Before anything is playing there is no song to be missing
                     credits FOR, and "not available" read as a failed load on a
                     page that had simply not been asked for anything yet. */
                  <span className="hint">
                    {videoId ? 'No credit information available.' : 'Pick a track to see its credits.'}
                  </span>
                )}
              </div>
            </div>

            {/* Fixed row -- always visible regardless of the mobile
                lyrics toggle below, since it sits between the two
                things that toggle (cover+info vs. lyrics) in DOM/grid
                order, not inside either of them. Add to Playlist and
                Watch on YouTube deliberately AREN'T here -- they stay
                paired together below the lyrics instead, see the
                "buttons" row further down. */}
            <div className="music-now-playing-actions">
              {hasLyrics && (
                <button type="button" aria-expanded={mobileShowLyrics} aria-controls="music-lyrics" className="ghost btn-sm music-mobile-lyrics-btn" onClick={() => setMobileShowLyrics((v) => !v)}>
                  {mobileShowLyrics ? 'Collapse lyrics' : 'Expand lyrics'}
                </button>
              )}
            </div>

            <div id="music-lyrics" className={`music-lyrics-scroll${mobileShowLyrics ? ' mobile-active' : ' music-lyrics-preview'}`} onScroll={handleLyricsScroll}>
              {hasLyrics ? (
                lyricsLoading ? (
                  <p className="hint">Loading lyrics…</p>
                ) : lyrics.length > 0 ? (
                  (mobileShowLyrics ? lyrics.map((line, i) => ({ line, active: i === activeLineIndex })) : preview).map(({ line, active }, i) => (
                    <p
                      key={i}
                      ref={active && mobileShowLyrics ? activeLineRef : undefined}
                      className={active ? 'music-lyric-line active' : 'music-lyric-line'}
                    >
                      {line.text}
                    </p>
                  ))
                ) : (
                  <p className="hint">Lyrics couldn&apos;t be loaded.</p>
                )
              ) : (
                <p className="hint">
                  {videoId ? 'No lyrics available for this song.' : 'Pick a track to see its lyrics.'}
                </p>
              )}
            </div>

            {isPlaying && <MusicWaveVisualizer volume={volume} className={mobileShowLyrics ? 'mobile-active' : ''} />}

            <div className="music-up-next" aria-labelledby="music-up-next-heading">
              <div className="music-up-next-heading">
                <h3 id="music-up-next-heading">Up next</h3>
                <Link href={MUSIC_VIEW_HREF.queue} shallow scroll={false} prefetch={false} className="ghost btn-sm">Open queue</Link>
              </div>
              <ol className="music-up-next-list">
                {[0, 1, 2].map(i => {
                  const entry = upNext[i];
                  return <li key={entry?.song.id ?? `empty-${i}`}>
                    {entry
                      ? <SongRow marker="music-up-next-row" song={entry.song}
                        onPlay={() => entry.index < 0 ? playNow(entry.song.id) : playQueueIndex(entry.index)}
                        actions={{
                          playNow: () => entry.index < 0 ? playNow(entry.song.id) : playQueueIndex(entry.index),
                          favorite: { on: favorites.has(entry.song.id), toggle: () => toggleFavorite(entry.song.id) },
                          playlist: true,
                        }} />
                      : <span className="music-up-next-empty">{i === 0 ? (repeatMode === 'one' ? 'Repeat one plays this song again.' : queueLoading ? 'Loading…' : 'Nothing after this song.') : '\u00a0'}</span>}
                  </li>;
                })}
              </ol>
            </div>

            <div className="music-now-playing-buttons">
              {youtubeUrl && (
                <a href={youtubeUrl} target="_blank" rel="noreferrer" className="ghost btn-sm music-watch-youtube-btn">
                  <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true">
                    <path d="M6 4 L16 10 L6 16 Z" />
                  </svg>
                  Watch on YouTube
                </a>
              )}
            </div>
          </div>
          <div className={`music-view-panel${view === 'queue' ? '' : ' music-view-behind'}`} aria-hidden={view === 'queue' ? undefined : true} {...hiddenUnless(view === 'queue')}>
            <MusicQueue shown={router.isReady && view === 'queue'} />
          </div>
          <div className={`music-view-panel${view === 'library' ? '' : ' music-view-behind'}`} aria-hidden={view === 'library' ? undefined : true} {...hiddenUnless(view === 'library')}>
            <MusicLibrary shown={router.isReady && view === 'library'} />
          </div>
        </div>

        <MusicTransportBar view={view} onFullPlayer coverPath={currentDetail || currentTrack ? nowPlayingCover : undefined} />
      </main>
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>("/music", async () => {
  // Written exactly once, here -- see writeLyricsFilesToPublic's own
  // comment in albumsDataServer.ts for why this page specifically, and
  // why writing to public/ from within getStaticProps is safe for a
  // static export build.
  //
  // This body only ever runs while prerendering or in local development:
  // withContentPage serves the published release at runtime, and listing the route
  // in scripts/content/pages.json excludes data/ and public/ from the function's
  // file trace. So the ISR function neither traces the local data tree nor tries to
  // rewrite public/ on Vercel's read-only filesystem -- the two things the previous
  // plain-static version of this page existed to avoid.
  writeLyricsFilesToPublic();
  const songLookup = getAllSongModalLookup();
  return { props: { songLookup } };
});
