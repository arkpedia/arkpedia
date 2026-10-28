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
import { upcomingIndices } from '@/lib/music/musicPolish';
import { usePlayerMinimizeGesture } from '@/lib/music/usePlayerMinimizeGesture';
import { useCrossFadeTitle } from '@/lib/music/useCrossFadeTitle';
import { lyricsPath, youtubeWatchUrl } from '@/lib/music/trackId';
import MusicWaveVisualizer from '@/components/music/MusicWaveVisualizer';
import MusicPlaylists from '@/components/music/MusicPlaylists';
import MusicGameSetting from '@/components/music/MusicGameSetting';
import MusicLibrary from '@/components/music/MusicLibrary';
import MusicLyrics from '@/components/music/MusicLyrics';
import MusicQueue from '@/components/music/MusicQueue';
import MusicNav, { MUSIC_VIEW_HREF } from '@/components/music/MusicNav';
import MusicTransportBar from '@/components/music/MusicTransportBar';
import SongRow from '@/components/music/SongRow';
import MusicHeader from '@/components/music/MusicHeader';
import { hiddenUnless } from '@/lib/ui/inert';
import { isDirectImage } from '@/lib/music/songArt';
import { findSongVersion } from '@/lib/music/songVersions';
import { songAllowed } from '@/lib/music/songFilter';
import { fetchAsset } from '@/lib/assets/assetRetry';

interface Props {
  songLookup: SongModalLookupEntry[];
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
    promise = fetchAsset(url)
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
    queue,
    currentTrack, libraryTracks, excludeCopyrighted, includeEndfield, autoplay, autoplayTracks, autoplayVideoId, queued, playNow,
    queueIndex,
    shuffleOrder,
    shufflePosition,
    queueLoading,
    initializePlayer,
    playQueueIndex,
    favorites,
    toggleFavorite,
    toggleNoAutoplay,
    nowPlayingCover: fallbackCover,
    nowPlayingArtist,
  } = useMusicPlayer();
  const router = useRouter();
  const [musicMenuOpen, setMusicMenuOpen] = useState(false);

  // The YouTube player otherwise only starts initializing on an
  // explicit action elsewhere (pressing play, expanding the mini-
  // player) -- visiting this dedicated page is a clear enough signal
  // of intent to start it proactively instead of leaving "Now Playing"
  // stuck on "Loading..." until something else triggers it.
  useEffect(() => {
    initializePlayer(false);
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
  const minimizeGesture = usePlayerMinimizeGesture(view === 'player', () => { void router.push(MUSIC_VIEW_HREF.library, undefined, { shallow: true, scroll: false }); });
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [lyricsLoading, setLyricsLoading] = useState(false);


  const detailByVideoId = useMemo(() => new Map(songLookup.map((s) => [s.videoId, s])), [songLookup]);
  const currentDetail = detailByVideoId.get(videoId);
  const alternateVersion = currentTrack ? findSongVersion(currentTrack, libraryTracks.filter(song => songAllowed({ excludeCopyrighted, includeEndfield }, song))) : null;
  // The album's cover: from this page's release props, else from the player's catalogue (a song
  // a release compiled before Monster Siren songs were listed here has its cover only there),
  // else the player's fallback: Monster Siren's own cover or the YouTube thumbnail (lib/music/songArt.ts).
  const nowPlayingCover = currentDetail?.coverPath ?? currentTrack?.cover ?? fallbackCover ?? null;

  // From this page's release props, like the credits: a lyric file is published for exactly
  // the songs whose lyrics parse, which is what this flag says, so the Lyrics button never
  // offers a file the release does not have.
  const hasLyrics = Boolean(currentDetail?.hasLyrics);
  useEffect(() => {
    if (router.query.lyrics === '1' && hasLyrics) setMobileShowLyrics(true);
  }, [router.query.lyrics, hasLyrics]);

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

  // One upcoming song, in playback order; the full queue stays one press away.
  const order = shuffle && shuffleOrder ? shuffleOrder : queue.map((_, i) => i);
  const position = shuffle && shuffleOrder ? shufflePosition : queueIndex;
  const pending = autoplayVideoId ? order.filter(index => queued.has(queue[index]?.id)) : [];
  const nextPosition = autoplayVideoId ? pending.length ? order.indexOf(pending[0]) - 1 : order.length - 1 : videoId ? position : -1;
  const nextChosen = upcomingIndices(order, nextPosition, repeatMode, 1).map(index => ({ song: queue[index], index })).filter(e => e.song);
  const upNext = repeatMode === 'one' ? [] : [...nextChosen, ...(autoplay && (repeatMode !== 'all' || !queue.length) ? autoplayTracks.slice(0, 1 - nextChosen.length).map(song => ({ song, index: -1 })) : [])];

  return (
    <>
      <Head><title>{`${view === 'library' ? 'Library' : view === 'queue' ? 'Queue' : 'Now playing'} · Music — Arkpedia`}</title></Head>

      <MusicHeader current={view} favourites={router.query.scope === 'favorites'} open={musicMenuOpen} onOpen={() => setMusicMenuOpen(value => !value)} />
      <main className="music-player-page">
        <MusicNav current={view} open={musicMenuOpen} onOpenChange={setMusicMenuOpen}>{returnFocus => <><MusicPlaylists songs={songLookup} onClose={returnFocus} /><div className="music-phone-settings" onChange={() => setMusicMenuOpen(false)}><MusicGameSetting /></div></>}</MusicNav>
        <div className="music-workspace-content">
        {view === 'player' && <h2 className="section-title music-workspace-title">Now playing</h2>}
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
        <div className={`music-view${minimizeGesture.offset ? ' music-player-pulling' : ''}`} data-music-view={view}>
          <div ref={minimizeGesture.ref} style={minimizeGesture.offset ? { transform: `translateY(${minimizeGesture.offset}px)` } : undefined} className={`music-now-playing${view === 'player' ? '' : ' music-now-playing-behind'}`} aria-hidden={view === 'player' ? undefined : true} {...hiddenUnless(view === 'player')}>

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
              <div className="music-now-playing-title-row">
                <h2>
                  <span className={titleFading ? 'music-crossfade-text fading' : 'music-crossfade-text'}>
                    {ready ? nowPlayingName : 'Loading…'}
                  </span>
                </h2>
                {youtubeUrl && (
                  <a href={youtubeUrl} target="_blank" rel="noreferrer" aria-label="Open in YouTube" className="ghost btn-sm music-watch-youtube-btn">
                    YouTube ↗
                  </a>
                )}
              </div>
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
              {alternateVersion && <button type="button" className="ghost btn-sm music-version-switch" onClick={() => playNow(alternateVersion.song.id)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4" /></svg>
                {alternateVersion.label}
              </button>}
            </div>

            {/* Mobile keeps a compact preview until the listener expands the lyrics. */}
            <div className="music-now-playing-actions">
              {hasLyrics && (
                <button type="button" aria-expanded={mobileShowLyrics} aria-controls="music-lyrics" className="ghost btn-sm music-mobile-lyrics-btn" onClick={() => setMobileShowLyrics((v) => !v)}>
                  {mobileShowLyrics ? 'Collapse lyrics' : 'Expand lyrics'}
                </button>
              )}
            </div>

            {/* The lyrics follow the song's clock on their own (components/music/MusicLyrics.tsx). */}
            <MusicLyrics lyrics={lyrics} loading={lyricsLoading} hasLyrics={hasLyrics} videoId={videoId} expanded={mobileShowLyrics} shown={view === 'player'} />

            {isPlaying && <MusicWaveVisualizer volume={volume} className={mobileShowLyrics ? 'mobile-active' : ''} />}

            <div className="music-up-next" aria-labelledby="music-up-next-heading">
              <div className="music-up-next-heading">
                <h3 id="music-up-next-heading">Up next</h3>
                <Link href={MUSIC_VIEW_HREF.queue} shallow scroll={false} prefetch={false} className="ghost btn-sm">Open queue</Link>
              </div>
              <ol className="music-up-next-list">
                {[0].map(i => {
                  const entry = upNext[i];
                  return <li key={entry?.song.id ?? `empty-${i}`}>
                    {entry
                      ? <SongRow marker="music-up-next-row" song={entry.song}
                        onPlay={() => entry.index < 0 ? playNow(entry.song.id) : playQueueIndex(entry.index)}
                        actions={{
                          playNow: () => entry.index < 0 ? playNow(entry.song.id) : playQueueIndex(entry.index),
                          favorite: { on: favorites.has(entry.song.id), toggle: () => toggleFavorite(entry.song.id) },
                          // An autoplay pick (no queue index) can be kept out of autoplay from here.
                          ...(entry.index < 0 ? { noAutoplay: { on: false, toggle: () => toggleNoAutoplay(entry.song.id) } } : {}),
                          playlist: true,
                        }} />
                      : <span className="music-up-next-empty">{i === 0 ? (repeatMode === 'one' ? 'Repeat one plays this song again.' : queueLoading ? 'Loading…' : 'Nothing after this song.') : '\u00a0'}</span>}
                  </li>;
                })}
              </ol>
            </div>
          </div>
          <div className={`music-view-panel${view === 'queue' ? '' : ' music-view-behind'}`} aria-hidden={view === 'queue' ? undefined : true} {...hiddenUnless(view === 'queue')}>
            <MusicQueue shown={router.isReady && view === 'queue'} />
          </div>
          <div className={`music-view-panel${view === 'library' ? '' : ' music-view-behind'}`} aria-hidden={view === 'library' ? undefined : true} {...hiddenUnless(view === 'library')}>
            <MusicLibrary shown={router.isReady && (view === 'library' || minimizeGesture.offset > 0)} />
          </div>
        </div>

        </div>
        <MusicTransportBar view={view} onFullPlayer onOpenLyrics={() => setMobileShowLyrics(hasLyrics)} coverPath={currentDetail || currentTrack ? nowPlayingCover : undefined} />
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
