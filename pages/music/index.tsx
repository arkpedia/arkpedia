import { readPublishedContentPageProps } from '@/lib/content/release';
import { GetStaticProps } from 'next';
import PageMeta from '@/components/layout/PageMeta';
import Image, { ContentImg } from '@/components/content/ContentImage';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getAllSongModalLookup, writeLyricsFilesToPublic, SongModalLookupEntry } from '@/lib/music/albumsDataServer';
import { withContentPage } from '@/lib/content/server';
import { useContentUrl } from '@/lib/content/context';
import type { LyricLine } from '@/lib/music/albumsDataServer';
import { useMusicPlayer } from '@/lib/music/musicPlayerContext';
import MusicWaveVisualizer from '@/components/music/MusicWaveVisualizer';
import { artistKey, creditedArtists } from '@/lib/music/artistCredits';
import { useCrossFadeTitle } from '@/lib/music/useCrossFadeTitle';
import { instrumentalLyricLines } from '@/lib/music/versionTiming';
import { lyricsPath } from '@/lib/music/trackId';
import MusicPlaylists from '@/components/music/MusicPlaylists';
import MusicGameSetting from '@/components/music/MusicGameSetting';
import MusicLibrary from '@/components/music/MusicLibrary';
import MusicLyrics from '@/components/music/MusicLyrics';
import MusicNav from '@/components/music/MusicNav';
import MusicTransportBar from '@/components/music/MusicTransportBar';
import MusicHeader from '@/components/music/MusicHeader';
import { hiddenUnless } from '@/lib/ui/inert';
import { isDirectImage } from '@/lib/music/songArt';
import { fetchAsset } from '@/lib/assets/assetRetry';
import { queuePanelHref } from '@/lib/music/queuePanelHref';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { findSongVersion, isInstrumentalVersion } from '@/lib/music/songVersions';
import { stripLyricCredits } from '@/lib/music/lyricCredits';

interface Props {
  songLookup: SongModalLookupEntry[];
}

/** Discovery details opened from the player offer a return to the current track. */
function fromNowPlaying(href: string) {
  if (!href.startsWith('/music/discover?')) return href;
  return href + '&from=player';
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
        lines = stripLyricCredits(lines);
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
    title,
    videoId,
    isPlaying, engineKind, buffering, volume,
    currentTrack, alternateVersion, queueSource, switchVersion,
    initializePlayer,
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

  // The view is the address (?view=library|player), and the nav and the transport link
  // to each with a shallow push: Back and Forward step between them, a view can be reloaded or
  // shared, and the player under them never reloads. With no ?view the page opens where there is
  // something to do: Now playing when a song has played this session, else the Library. Decided
  // once, on mount (the player context outlives the page, so a song started elsewhere is known
  // here), so the view never swaps under the reader; server and client both start from "nothing
  // played", and the URL's view applies once the router has read it.
  const [initialView] = useState<'player' | 'library'>(() => (videoId ? 'player' : 'library'));
  const viewParam = router.isReady ? router.query.view : undefined;
  const view: 'player' | 'library' = viewParam === 'queue'
    ? router.query.scope || router.query.playlist ? 'library' : 'player'
    : viewParam === 'player' || viewParam === 'library' ? viewParam : initialView;
  useEffect(() => {
    if (router.isReady && router.query.view === 'queue') void router.replace(queuePanelHref(router), undefined, { shallow: true, scroll: false });
  }, [router]);
  const [loadedLyrics, setLoadedLyrics] = useState<{ url: string; lines: LyricLine[] } | null>(null);

  const detailByVideoId = useMemo(() => new Map(songLookup.map((s) => [s.videoId, s])), [songLookup]);
  const sourceFacet = queueSource && new URLSearchParams(queueSource.href.split('?')[1]).get('facet');
  const albumId = sourceFacet?.startsWith('album:') ? sourceFacet.slice(6) : null;
  const currentDetail = (albumId && songLookup.find(song => song.videoId === videoId && song.albumId === albumId)) || detailByVideoId.get(videoId);
  // The album's cover: from this page's release props, else from the player's catalogue (a song
  // a release compiled before Monster Siren songs were listed here has its cover only there),
  // else the player's fallback: Monster Siren's own cover or the YouTube thumbnail (lib/music/songArt.ts).
  const nowPlayingCover = currentDetail?.coverPath ?? currentTrack?.cover ?? fallbackCover ?? null;

  // From this page's release props, like the credits: a lyric file is published for exactly
  // the songs whose lyrics parse, which is what this flag says, so the Lyrics button never
  // offers a file the release does not have.
  // Older published releases missed full-width/no-space instrumental suffixes.
  // Reuse their already-published vocal sheet while the producer catches up.
  const lyricDetail = useMemo(() => {
    if (!currentDetail || currentDetail.hasLyrics || !isInstrumentalVersion(currentDetail)) return currentDetail;
    const versioned = (detail: SongModalLookupEntry) => ({ id: detail.videoId, title: detail.title, album: detail.albumId || detail.albumName, detail });
    const vocal = findSongVersion(versioned(currentDetail), songLookup.map(versioned))?.song.detail;
    return vocal?.hasLyrics ? vocal : currentDetail;
  }, [currentDetail, songLookup]);
  const hasLyrics = Boolean(lyricDetail?.hasLyrics);
  const mobile = useMediaQuery('(max-width: 999px)');
  const lyricsExpanded = mobile && view === 'player' && hasLyrics && router.asPath.endsWith('#music-lyrics');
  const lyricsAndWaveRef = useRef<HTMLDivElement>(null);
  const collapsedScrollRef = useRef<number | null>(null);

  useEffect(() => {
    if (!lyricsExpanded) {
      if (collapsedScrollRef.current !== null && view === 'player') window.scrollTo({ top: collapsedScrollRef.current, behavior: 'instant' });
      collapsedScrollRef.current = null;
      return;
    }
    const panel = lyricsAndWaveRef.current;
    if (!panel) return;
    collapsedScrollRef.current = window.scrollY;
    // Give the lyrics the viewport between the persistent site header and transport.
    // Only the lyrics scroll within it; returning restores the reader's default view.
    let frame = 0;
    const align = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const navHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 52;
        window.scrollTo({ top: panel.getBoundingClientRect().top + window.scrollY - navHeight, behavior: 'instant' });
      });
    };
    const observer = new ResizeObserver(align);
    observer.observe(panel);
    window.addEventListener('resize', align);
    align();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('resize', align); };
  }, [lyricsExpanded, view]);

  const albumName = currentDetail?.albumName || currentTrack?.album;
  const albumHref = currentDetail?.albumId ? '/music/discover?facet=' + encodeURIComponent('album:' + currentDetail.albumId)
    : '/music/discover?q=' + encodeURIComponent(albumName ?? '');
  const artistNames = useMemo(() => {
    const names = new Set<string>();
    for (const song of songLookup) for (const credit of song.credits || []) if (credit.role.toLowerCase() === 'artist') {
      for (const name of creditedArtists(credit.names.join(', '))) names.add(artistKey(name));
    }
    return names;
  }, [songLookup]);
  function creditLinks(credits: string[], role = 'artist') {
    const artists = role.toLowerCase() === 'artist' ? creditedArtists(credits.join(', ')) : [];
    const names = artists.length ? artists : credits;
    return names.map((name, i) => <span key={name}>{i > 0 && ', '}{artistNames.has(artistKey(name))
      ? <Link href={{ pathname: '/music/discover', query: { facet: 'artist:' + name, from: 'player' } }}>{name}</Link> : name}</span>);
  }
  const lyricTrackId = lyricDetail?.lyricTrackId ?? lyricDetail?.videoId ?? videoId;
  const lyricUrl = hasLyrics ? contentUrl(lyricsPath(lyricTrackId)) : '';
  const rawLyrics = loadedLyrics?.url === lyricUrl ? loadedLyrics.lines : lyricsCache.get(lyricUrl);
  // Older releases published a copy of the vocal file under each measured instrumental’s ID.
  const recording = engineKind === 'msr' ? currentTrack?.cid ?? videoId.replace(/^msr:/, '') : videoId;
  const ownLyrics = lyricDetail?.lyricTrackId === videoId;
  const lyrics = useMemo(() => {
    if (!rawLyrics) return [];
    return instrumentalLyricLines(rawLyrics, recording, ownLyrics);
  }, [rawLyrics, ownLyrics, recording]);
  useEffect(() => {
    if (!lyricUrl) return;
    let cancelled = false;
    fetchLyricsFor(lyricUrl).then(lines => {
      if (!cancelled) setLoadedLyrics({ url: lyricUrl, lines });
    });
    return () => { cancelled = true; };
  }, [lyricUrl]);

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

  return (
    <>
      <PageMeta title={`${view === 'library' ? 'Library' : 'Now playing'} · Music`} description="The Arknights music player: Monster Siren Records albums, lyrics, playlists and a queue." path="/music" />

      <MusicHeader current={view} favourites={router.query.scope === 'favorites'} open={musicMenuOpen} onOpen={() => setMusicMenuOpen(value => !value)} />
      <main className="music-player-page" data-lyrics-expanded={lyricsExpanded || undefined}>
        <MusicNav current={view} open={musicMenuOpen} onOpenChange={setMusicMenuOpen}>{returnFocus => <><MusicPlaylists songs={songLookup} onClose={returnFocus} /><div className="music-phone-settings" onChange={() => setMusicMenuOpen(false)}><MusicGameSetting /></div></>}</MusicNav>
        <div className="music-workspace-content">
        {view === 'player' && <h2 className="section-title music-workspace-title">Now playing</h2>}
        <div className="visually-hidden" aria-live="polite">
          {nowPlayingAnnouncement}
        </div>
        {/* The music views in one place (the Anti-Page Jump rule's swap in place): Now playing
            always lays out and sets the place's height, hidden and inert while Library lies
            over it. Library keeps its size contained and stays mounted while hidden, so its
            search and scroll position survive a trip to Now playing and back. */}
        {/* A view counts as opened (loads its songs) only once the router has read ?view: the
            first render shows the default view, and must not load a hidden Library. */}
        <div className="music-view" data-music-view={view}>
          <div className={`music-now-playing${view === 'player' ? '' : ' music-now-playing-behind'}`} aria-hidden={view === 'player' ? undefined : true} {...hiddenUnless(view === 'player')}>

            <div className="music-now-playing-details">
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

            <div className="music-now-playing-song-info reading-copy">
              <div className="music-now-playing-title-row">
                <h2>
                  <span className={titleFading ? 'music-crossfade-text fading' : 'music-crossfade-text'}>
                    {ready ? nowPlayingName : 'Loading…'}
                  </span>
                </h2>
              </div>
              {albumName && <div className="music-detail-reference">Album · <Link href={fromNowPlaying(albumHref)}>{albumName}</Link></div>}
              {queueSource && queueSource.href !== albumHref && <div className="music-detail-reference">Playing from <Link href={fromNowPlaying(queueSource.href)}>{queueSource.name}</Link></div>}
              <div className="music-now-playing-credits">
                {currentDetail?.credits && currentDetail.credits.length > 0 ? (
                  currentDetail.credits.map((c) => (
                    <span key={c.role}>
                      <b>{formatRoleLabel(c.role)}:</b> {creditLinks(c.names, c.role)}
                    </span>
                  ))
                ) : videoId && nowPlayingArtist ? (
                  /* A song the release has no credits for yet: the artist Monster Siren credits. */
                  <span><b>{formatRoleLabel('artist')}:</b> {creditLinks([nowPlayingArtist])}</span>
                ) : (
                  /* Before anything is playing there is no song to be missing
                     credits FOR, and "not available" read as a failed load on a
                     page that had simply not been asked for anything yet. */
                  <span className="hint">
                    {videoId ? 'No credit information available.' : 'Pick a track to see its credits.'}
                  </span>
                )}
              </div>
              {alternateVersion && <button type="button" className="ghost btn-sm music-version-switch" disabled={!ready} onClick={switchVersion}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4" /></svg>
                {alternateVersion.label}
              </button>}
            </div>

            </div>

            {videoId && <div ref={lyricsAndWaveRef} className="music-lyrics-and-wave">
              <div className="music-lyrics-space" aria-hidden={!hasLyrics || undefined}>
                {hasLyrics && <MusicLyrics lyrics={lyrics} loading={!rawLyrics} shown={view === 'player'} expanded={lyricsExpanded} playing={isPlaying && !buffering} />}
              </div>
              {view === 'player' && <MusicWaveVisualizer volume={volume} playing={isPlaying && !buffering} engine={engineKind} trackId={videoId} />}
            </div>}

          </div>
          <div className={`music-view-panel${view === 'library' ? '' : ' music-view-behind'}`} aria-hidden={view === 'library' ? undefined : true} {...hiddenUnless(view === 'library')}>
            <MusicLibrary key={JSON.stringify([router.query.scope, router.query.playlist])} shown={router.isReady && view === 'library'} />
          </div>
        </div>

        </div>
        <MusicTransportBar view={view} onFullPlayer hasLyrics={hasLyrics} lyricsExpanded={lyricsExpanded}
          onToggleLyrics={() => { void router.replace(router.asPath.split('#')[0] + (lyricsExpanded ? '' : '#music-lyrics'), undefined, { shallow: true, scroll: false }); }}
          coverPath={currentDetail || currentTrack ? nowPlayingCover : undefined} />
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
}, { finalize: async props => {
  if (props.songLookup.every(song => song.albumId)) return props;
  const discover = await readPublishedContentPageProps<Pick<import('@/lib/music/albumsDataServer').DiscoverPageData, 'songs' | 'pendingSongs'>>('/music/discover');
  const rows = [...(Array.isArray(discover?.songs) ? discover.songs : []), ...(Array.isArray(discover?.pendingSongs) ? discover.pendingSongs : [])];
  const albums = new Map(rows.map(song => [('videoId' in song ? song.videoId : 'msr:' + song.songId) + '/' + song.albumName, song.albumId]));
  return { ...props, songLookup: props.songLookup.map(song => {
    const id = albums.get(song.videoId + '/' + song.albumName);
    return id ? { ...song, albumId: id } : song;
  }) };
} });
