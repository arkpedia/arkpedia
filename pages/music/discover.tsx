import { withContentPage } from '@/lib/content/server';
import { GetStaticProps } from 'next';
import Head from 'next/head';
import Image from '@/components/content/ContentImage';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { GAME_PATHS } from '@/lib/minigames/catalogue';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import ScrollRow from '@/components/ui/ScrollRow';
import SearchInput from '@/components/ui/SearchInput';
import StyledSelect from '@/components/ui/StyledSelect';
import { useHeightFloor } from '@/components/ui/useHeightFloor';
import { useMusicPlayer } from '@/lib/music/musicPlayerContext';
import { useQueryState } from '@/lib/hooks/useQueryState';
import AlbumCover from '@/components/music/AlbumCover';
import { discoverForDisplay, discoverFromRelease, getDiscoverPageData, DiscoverSong, DiscoverFacet, DiscoverCharacter, DiscoverAlbum, DiscoverBrowseAlbum, DiscoverPendingSong } from '@/lib/music/albumsDataServer';
import LoadOnScroll from '@/components/ui/LoadOnScroll';
import MusicNav from '@/components/music/MusicNav';
import MusicPlaylists from '@/components/music/MusicPlaylists';
import MusicTransportBar from '@/components/music/MusicTransportBar';
import SongRow from '@/components/music/SongRow';
import { createSongIndex, normalizeSearch } from '@/lib/music/songSearch';
import { msrTrackId } from '@/lib/music/trackId';
import { artistKey, creditedArtists, creditsArtist } from '@/lib/music/artistCredits';
import { characterInitials } from '@/lib/music/characterPortraits.mjs';
import { useYouTubeLikes } from '@/lib/music/useYouTubeLikes';
import { byYouTubeLikes, mostLikedSongs } from '@/lib/music/youtubeLikes';
import { songTitle } from '@/lib/music/musicPolish';
import { discoverShown } from '@/lib/music/discoverFilter';
import MusicGameSetting from '@/components/music/MusicGameSetting';
import HiddenEndfieldHint from '@/components/music/HiddenEndfieldHint';
import { gameSearchNames } from '@/lib/music/songFilter';

interface Props {
  songs: DiscoverSong[];
  characters: DiscoverCharacter[];
  origins: DiscoverFacet[];
  artists: DiscoverFacet[];
  recentAlbums: DiscoverAlbum[];
  albums: DiscoverBrowseAlbum[];
  pendingSongs: DiscoverPendingSong[];
}

/** What the song search reads of a Discover song (lib/music/songSearch.ts). The album's own
 *  (Chinese) name comes from the player's catalogue, which carries it, rather than from these
 *  page props, so a release compiled before it was added still serves this page whole. */
const searchFields = (originals: ReadonlyMap<string, string>) => (s: DiscoverSong | DiscoverPendingSong) => ({ title: s.title, altTitle: s.altTitle,
  artist: s.artist, album: s.albumName, albumOriginal: 'videoId' in s ? originals.get(s.videoId) : undefined,
  extra: [...s.characters, ...s.origin, ...gameSearchNames('game' in s ? s.game : undefined)] });

/** The player's id for a Discover song (lib/music/trackId.ts): a song with no YouTube upload
 *  plays Monster Siren's own audio. */
const trackIdOf = (s: DiscoverSong | DiscoverPendingSong) => ('videoId' in s ? s.videoId : msrTrackId(s.songId));

// Keep the initial browse rows bounded. Show all expands a collection inline.
const ROW_PREVIEW_COUNT = 24;

// Pill font size scales with how many songs share that origin/story,
// within this range -- an event with dozens of songs reads as an
// obvious, inviting entry point; one with just a song or two stays
// small and specific, which is exactly what invites "wait, what's
// that?" curiosity rather than looking like an afterthought.
/** A character's tile picture: their art, or their initials where the game has none we
 *  publish (lib/music/characterPortraits.mjs), never an empty square. */
function CharacterPortrait({ name, artPath }: { name: string; artPath: string | null | undefined }) {
  return (
    <div className="music-discover-character-portrait">
      {artPath
        ? <Image src={artPath} alt="" width={64} height={64} />
        : <span className="music-discover-character-initials" aria-hidden="true">{characterInitials(name)}</span>}
    </div>
  );
}

const songCount = (count: number) => `${count} song${count === 1 ? '' : 's'}`;

function weightedPillSize(count: number, maxCount: number): number {
  if (maxCount <= 1) return 14;
  const t = Math.sqrt(count / maxCount); // sqrt compresses the range so one huge outlier doesn't shrink everything else to illegibility
  return Math.round(12 + t * 10); // 12px .. 22px
}

interface FacetState {
  character: string | null;
  artist: string | null;
  origin: string | null;
  albumId: string | null;
}
const EMPTY_FACETS: FacetState = { character: null, artist: null, origin: null, albumId: null };

/** A browse collection: a ScrollRow of previews, or every item wrapped once "Show all"
 *  is on. The row scrolls under the site's drawn bar; its old overlay bar was invisible
 *  and the "room for the scrollbar" padding under it reserved nothing. */
function Collection({ id, label, expanded, cloud = false, grid = false, albums = false, controls = false, children }: { id: string; label: string; expanded: boolean; cloud?: boolean; grid?: boolean; albums?: boolean; controls?: boolean; children: ReactNode }) {
  const className = `music-discover-row${cloud ? ' music-discover-cloud-row' : ''}${albums ? ' music-discover-album-row' : ''}`;
  return expanded
    ? <div id={id} className={`${className} expanded${grid ? ' music-discover-grid' : ''}`}>{children}</div>
    : <div id={id}><ScrollRow label={label} className={className} controls={controls} persistentScrollbar={controls}>{children}</ScrollRow></div>;
}

type AlbumOrder = 'newest' | 'name';

/** An album tile: its cover and its English name (its own where it has none), the song count
 *  once the albums are a grid. Opens the album's songs in place, as Recently added does. */
function AlbumTile({ album, withCount, onOpen }: { album: Pick<DiscoverBrowseAlbum, 'albumName' | 'albumAltName' | 'coverPath'> & { songCount?: number }; withCount: boolean; onOpen: () => void }) {
  const original = album.albumName && album.albumName !== album.albumAltName ? album.albumName : null;
  const count = typeof album.songCount === 'number' ? songCount(album.songCount) : null;
  return (
    <button type="button" className="btn-bare music-discover-album-tile" onClick={onOpen}
      title={[album.albumAltName, original, withCount ? null : count].filter(Boolean).join(' · ')}>
      <AlbumCover coverPath={album.coverPath} size={120} className="music-discover-album-tile-cover" />
      <span className="music-discover-album-tile-name">{album.albumAltName}</span>
      {withCount && count && <span className="music-discover-album-tile-count">{count}</span>}
    </button>
  );
}

export default function DiscoverPage({ songs: releaseSongs, characters, origins, artists: releaseArtists, recentAlbums: releaseRecentAlbums, albums: releaseAlbums, pendingSongs }: Props) {
  const { playNow, queueSong, videoId: playingId, queued, favorites, toggleFavorite, noAutoplay, toggleNoAutoplay, libraryTracks, includeEndfield } = useMusicPlayer();
  // What the reader's settings let in (lib/music/discoverFilter.ts): Endfield's songs and albums
  // only once Endfield music is on, as in the queue and the Library.
  const { songs, recentAlbums, albums, artists } = useMemo(() => discoverShown(
    { songs: releaseSongs, recentAlbums: releaseRecentAlbums, albums: releaseAlbums, artists: releaseArtists },
    { excludeCopyrighted: false, includeEndfield },
  ), [releaseSongs, releaseRecentAlbums, releaseAlbums, releaseArtists, includeEndfield]);
  // The player bar's album art, as on /music: this page's songs carry their covers.
  const coverByVideoId = useMemo(() => new Map([...releaseSongs, ...pendingSongs].map((s) => [trackIdOf(s), s.coverPath])), [releaseSongs, pendingSongs]);
  // Every song in one list, those on YouTube and those only Monster Siren has: all of them play.
  // Searched whole, Endfield's too, so a search can say how many hidden songs it matched.
  const allSongs = useMemo(() => [...releaseSongs, ...pendingSongs], [releaseSongs, pendingSongs]);
  const router = useRouter();

  // Both the search text (?q=...) and the active facet are mirrored
  // into the URL so a filtered view survives reload and can be shared.
  // The hook applies the URL's value only after hydration, so first
  // paint is always the plain browse view (hydration-safe).
  const [query, setQuery] = useQueryState('q');
  const [browseCollection, setBrowseCollection] = useQueryState('browse');
  const [songOrder, setSongOrder] = useQueryState('sort');
  const { data: youtubeLikes, loading: likesLoading } = useYouTubeLikes();
  const rankedSongs = useMemo(() => youtubeLikes ? mostLikedSongs(songs, youtubeLikes.likes) : [], [songs, youtubeLikes]);
  const likesExpanded = browseCollection === 'likes';
  const visibleRankedSongs = rankedSongs.slice(0, likesExpanded ? undefined : ROW_PREVIEW_COUNT);

  // Only ONE facet is ever active at a time (every setter below spreads
  // EMPTY_FACETS first), so the whole FacetState fits in a single
  // "kind:value" query param -- ?facet=character:Amiya -- rather than
  // four separate keys. That's not just tidier: useQueryState debounces
  // each key's URL write independently from a snapshot of router.query,
  // so two keys written in the same tick would race and the loser's
  // change would vanish from the URL. One key can't race with itself.
  // Split on the FIRST colon only, since facet values (song origins,
  // artist names) can themselves contain colons.
  const [facetParam, setFacetParam] = useQueryState('facet');
  const facets = useMemo((): FacetState => {
    const sep = facetParam.indexOf(':');
    if (sep <= 0) return EMPTY_FACETS;
    const kind = facetParam.slice(0, sep);
    const value = facetParam.slice(sep + 1);
    if (!value) return EMPTY_FACETS;
    if (kind === 'character') return { ...EMPTY_FACETS, character: value };
    if (kind === 'artist') return { ...EMPTY_FACETS, artist: value };
    if (kind === 'origin') return { ...EMPTY_FACETS, origin: value };
    if (kind === 'album') return { ...EMPTY_FACETS, albumId: value };
    return EMPTY_FACETS;
  }, [facetParam]);
  function setFacets(next: FacetState) {
    if (next.character) setFacetParam(`character:${next.character}`);
    else if (next.artist) setFacetParam(`artist:${next.artist}`);
    else if (next.origin) setFacetParam(`origin:${next.origin}`);
    else if (next.albumId) setFacetParam(`album:${next.albumId}`);
    else setFacetParam('');
  }

  const hasActiveQuery = query.trim().length > 0;
  const hasActiveFacet = facets.character !== null || facets.artist !== null || facets.origin !== null || facets.albumId !== null;
  const isBrowsing = !hasActiveQuery && !hasActiveFacet;

  // Facets combine with AND, not OR -- picking both a character and an
  // origin narrows to songs matching BOTH, which is what "combine
  // filters" means for anyone stacking them deliberately, rather than
  // widening the result set unexpectedly. Clicking an album tile is
  // just another facet now (albumId), not a navigation away from this
  // page -- it filters inline exactly like character/artist/origin do.
  const inFacets = useMemo(() => (s: DiscoverSong | DiscoverPendingSong) =>
    (!facets.character || s.characters.includes(facets.character))
    // Every song that credits the artist, alone or with others (lib/music/artistCredits.ts).
    && (!facets.artist || creditsArtist(s.artist, facets.artist))
    && (!facets.origin || s.origin.includes(facets.origin))
    && (!facets.albumId || s.albumId === facets.albumId), [facets]);
  // The music pages' one song search (lib/music/songSearch.ts): title, album in both names,
  // artist, then characters and story, typo-tolerant, best match first while a query is typed.
  const originals = useMemo(() => new Map(libraryTracks.filter(track => track.albumOriginal).map(track => [track.id, track.albumOriginal as string])), [libraryTracks]);
  /* Songs of a new album nobody has found a YouTube upload for yet are ranked with the rest:
     the player plays them from Monster Siren. They used to be listed after every match, as
     links to Monster Siren, and before that left a new album's tile on "No songs match". */
  const songIndex = useMemo(() => createSongIndex(allSongs, searchFields(originals)), [allSongs, originals]);
  const matchingSongs = useMemo(() => (isBrowsing ? [] : songIndex.search(query).filter(inFacets)), [songIndex, query, inFacets, isBrowsing]);
  const filteredSongs = useMemo(() => {
    const matching = matchingSongs.filter((s) => includeEndfield || !('game' in s && s.game === 'endfield'));
    return songOrder === 'likes' && youtubeLikes ? byYouTubeLikes(matching, youtubeLikes.likes, trackIdOf) : matching;
  }, [matchingSongs, includeEndfield, songOrder, youtubeLikes]);
  // Endfield songs the search or facet found while Endfield music is off (a search result for one).
  const hiddenEndfield = includeEndfield ? 0 : matchingSongs.length - filteredSongs.length;

  // Mirrors the queue panel's "Show more" pagination on /music (see
  // QUEUE_PAGE_SIZE in pages/music/index.tsx): a broad facet -- one
  // prolific artist, a couple of typed letters -- can match hundreds
  // of songs at once, and every row mounts its own cover <Image>, so
  // rendering the whole match set eagerly is real work for rows nobody
  // has scrolled to. Only what's actually been asked for gets mounted;
  // the count resets whenever the filter changes, so a deep "Show
  // more" scroll into one result set doesn't carry its row count over
  // to a completely different search.
  const SONGS_PAGE_SIZE = 60;
  const [songsVisibleCount, setSongsVisibleCount] = useState(SONGS_PAGE_SIZE);
  useEffect(() => {
    setSongsVisibleCount(SONGS_PAGE_SIZE);
  }, [query, facetParam, songOrder]);
  const visibleFilteredSongs = filteredSongs.slice(0, songsVisibleCount);

  // What albums/artists/characters are actually represented within the
  // current result set -- derived from filteredSongs directly, so text
  // search and facet-selection both naturally produce sensible Album/
  // Artist/Character sections without needing separate matching logic
  // for each: "what's IN these results" is the same question either way.
  const resultAlbums = useMemo(() => {
    const seen = new Map<string, { albumId: string; albumName: string; coverPath: string | null }>();
    for (const s of filteredSongs) {
      if (!seen.has(s.albumId)) seen.set(s.albumId, { albumId: s.albumId, albumName: s.albumName, coverPath: s.coverPath });
    }
    return Array.from(seen.values());
  }, [filteredSongs]);

  const resultArtists = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of filteredSongs) for (const name of creditedArtists(s.artist)) if (!seen.has(artistKey(name))) seen.set(artistKey(name), name);
    return Array.from(seen.values());
  }, [filteredSongs]);

  const resultCharacters = useMemo(() => {
    const seen = new Set<string>();
    for (const s of filteredSongs) for (const c of s.characters) seen.add(c);
    return Array.from(seen);
  }, [filteredSongs]);

  const artByName = useMemo(() => new Map(characters.map((c) => [c.name, c.artPath])), [characters]);
  const playlistSongs = useMemo(() => allSongs.map((s) => ({ videoId: trackIdOf(s), title: s.title })), [allSongs]);

  function backToBrowse() {
    setQuery('');
    setFacets(EMPTY_FACETS);
    // The two setters above reset local state immediately, but their
    // URL writes are separately debounced snapshots of router.query --
    // when q AND facet are both set, whichever write lands last was
    // taken before the other's landed, resurrecting that key in the
    // URL (state says browse, address bar says filtered; a reload
    // would re-apply the zombie filter). One direct shallow replace
    // drops both keys atomically; the hooks' own debounced writes then
    // fire against the already-clean query and are no-ops.
    const cleaned = { ...router.query };
    delete cleaned.q;
    delete cleaned.facet;
    router.replace({ pathname: router.pathname, query: cleaned }, undefined, { shallow: true, scroll: false });
  }

  // Play now: the song plays right away and the queue plays on after it, so browsing never
  // throws away what was lined up (it used to jump to the song's place in the shuffled queue).
  function playSong(videoId: string) {
    playNow(videoId);
  }

  const maxOriginCount = origins[0]?.count || 1;
  const visibleCharacters = browseCollection === 'characters' ? characters : characters.slice(0, ROW_PREVIEW_COUNT);
  const visibleOrigins = browseCollection === 'origins' ? origins : origins.slice(0, ROW_PREVIEW_COUNT);
  /* Featured artists: one card per artist with their song count, most songs first. Show all
     lists every one in a grid, with a filter to find a name among them. */
  const [artistFilter, setArtistFilter] = useState('');
  const artistsExpanded = browseCollection === 'artists';
  const visibleArtists = useMemo(() => {
    if (!artistsExpanded) return artists.slice(0, ROW_PREVIEW_COUNT);
    const wanted = artistKey(artistFilter.trim());
    return wanted ? artists.filter((a) => artistKey(a.name).includes(wanted)) : artists;
  }, [artists, artistsExpanded, artistFilter]);

  /* Browse by album (2026-10-14), as Monster Siren's own site lists them: every album's cover
     and name. The row starts where Recently added stops, so the two rows above each other
     never show the same covers; Show all lists every album, newest first or by name, with a
     filter that reads both its English and its own name. */
  const [albumFilter, setAlbumFilter] = useState('');
  const [albumOrder, setAlbumOrder] = useState<AlbumOrder>('newest');
  const albumsExpanded = browseCollection === 'albums';
  const recentAlbumIds = useMemo(() => new Set(recentAlbums.map((a) => a.albumId)), [recentAlbums]);
  // An album's own name from the player's catalogue too, for a release whose albums lack it.
  const albumOriginals = useMemo(() => {
    const byAlbum = new Map<string, string>();
    for (const s of songs) { const own = originals.get(s.videoId); if (own && !byAlbum.has(s.albumId)) byAlbum.set(s.albumId, own); }
    return byAlbum;
  }, [songs, originals]);
  const visibleAlbums = useMemo(() => {
    if (!albumsExpanded) {
      const past = albums.filter((a) => !recentAlbumIds.has(a.albumId));
      return (past.length ? past : albums).slice(0, ROW_PREVIEW_COUNT);
    }
    const wanted = normalizeSearch(albumFilter);
    const matching = wanted
      ? albums.filter((a) => [a.albumAltName, a.albumName, albumOriginals.get(a.albumId) ?? ''].some((name) => normalizeSearch(name).includes(wanted)))
      : albums;
    return albumOrder === 'name'
      ? [...matching].sort((a, b) => a.albumAltName.localeCompare(b.albumAltName, 'en', { numeric: true, sensitivity: 'base' }))
      : matching;
  }, [albums, albumsExpanded, albumFilter, albumOrder, recentAlbumIds, albumOriginals]);
  const openAlbum = (albumId: string) => setFacets({ ...EMPTY_FACETS, albumId });

  const activeFacetLabel = facets.character || facets.origin || facets.artist || (facets.albumId && resultAlbums[0]?.albumName) || null;
  /* "Show less" folds a wrapped collection (hundreds of tiles) back to one row. Pressed
     from low on the page it took 373px (1440) / 344px (390) out from under the reader;
     the floor holds their place and gives the space back as they scroll up. One browse
     view is one logical page; a search or a facet is another. */
  const browseFloor = useHeightFloor(isBrowsing ? 'browse' : `${query}|${facetParam}`);
  const showAllButton = (collection: string, controls: string) => (
    <button type="button" className="ghost btn-sm" aria-expanded={browseCollection === collection} aria-controls={controls}
      onClick={() => setBrowseCollection(browseCollection === collection ? '' : collection)}>
      {browseCollection === collection ? 'Show less' : 'Show all'}
    </button>
  );

  return (
    <>
      <Head><title>Discover — Arkpedia</title></Head>

      {/* The music section's one header and nav, in the same place as on /music, so moving
          between Discover and the player's views moves nothing. */}
      <PageHeader slim compact eyebrow="Sound Archive" title="Music" actions={<div className="music-header-actions"><MusicGameSetting header /><MusicPlaylists songs={playlistSongs} /></div>} />
      <main className="music-discover-page">
        <MusicNav current="discover" />
        <div className="music-discover-search-row">
          {!isBrowsing && (
            <button type="button" className="back-btn music-discover-back-btn" onClick={backToBrowse}>
              ‹ Back to browse
            </button>
          )}
          <SearchInput label="Search songs, characters, artists, albums" name="discover-search"
            placeholder="Search songs, characters, artists, albums…" value={query} onChange={setQuery} />
        </div>
        <p className="hint music-view-hint">Know these tracks by heart? <Link href={GAME_PATHS.music} prefetch={false}>Play Music Guesser</Link></p>
        <div ref={browseFloor.ref} className="music-discover-body">

        {!isBrowsing ? (
          <div className="music-discover-results">
            <section className="op-section music-discover-section">
              <div className="music-discover-section-heading">
                <h2>
                  Songs
                  {activeFacetLabel && <span className="music-discover-active-facet"> · {activeFacetLabel}</span>}
                </h2>
                <div className="music-discover-song-order">
                  <span aria-hidden="true">Sort</span>
                  <StyledSelect label="Order songs" value={songOrder === 'likes' ? 'likes' : ''} onChange={setSongOrder} align="end"
                    options={[
                      { value: '', label: hasActiveQuery ? 'Best match' : 'Default' },
                      { value: 'likes', label: 'Most liked on YouTube', disabled: !rankedSongs.length },
                    ]} />
                </div>
              </div>
              {songOrder === 'likes' && !rankedSongs.length && <p className="hint" role="status">
                {likesLoading ? 'Loading YouTube likes…' : 'YouTube likes are temporarily unavailable. Showing default order.'}
              </p>}
              <HiddenEndfieldHint count={hiddenEndfield} />
              {filteredSongs.length === 0 ? (
                hiddenEndfield > 0 ? null : <p className="hint">No songs match. Try a different search or go back and pick something else.</p>
              ) : (
                <div className="music-discover-song-list">
                  {visibleFilteredSongs.map((s) => {
                    const id = trackIdOf(s);
                    // One upload can be on two albums (切尔诺伯格 is on OST 3 and Prelude to Dawn): a
                    // row per album listing, keyed by both.
                    return <SongRow key={`${s.albumId}:${id}`} marker="music-discover-song-row"
                      song={{ id, title: s.title, altTitle: s.altTitle, artist: s.artist, album: s.albumName, cover: s.coverPath }}
                      detail={songOrder === 'likes' && youtubeLikes?.likes[id] !== undefined ? `${youtubeLikes.likes[id].toLocaleString('en-US')} YouTube likes` : undefined}
                      active={playingId === id} queued={queued.has(id)} onPlay={() => playSong(id)}
                      actions={{
                        playNow: () => playSong(id),
                        playNext: playingId === id ? undefined : () => void queueSong(id, 'next'),
                        addToQueue: playingId === id ? undefined : () => void queueSong(id, 'last'),
                        favorite: { on: favorites.has(id), toggle: () => toggleFavorite(id) },
                        noAutoplay: { on: noAutoplay.has(id), toggle: () => toggleNoAutoplay(id) },
                        playlist: true,
                      }} />;
                  })}
                  <LoadOnScroll shown={songsVisibleCount} total={filteredSongs.length} onMore={() => setSongsVisibleCount((c) => c + SONGS_PAGE_SIZE)} />
                </div>
              )}
            </section>

            {resultAlbums.length > 0 && (
              <section className="op-section music-discover-section">
                <h2>Albums</h2>
                <ScrollRow label="Albums in these results" className="music-discover-row">
                  {resultAlbums.map((a) => (
                    <button
                      key={a.albumId}
                      type="button"
                      className="btn-bare music-discover-album-tile"
                      onClick={() => setFacets({ ...EMPTY_FACETS, albumId: a.albumId })}
                      title={a.albumName}
                    >
                      <AlbumCover coverPath={a.coverPath} size={120} className="music-discover-album-tile-cover" />
                      <span className="music-discover-album-tile-name">{a.albumName}</span>
                    </button>
                  ))}
                </ScrollRow>
              </section>
            )}

            {resultArtists.length > 0 && (
              <section className="op-section music-discover-section">
                <h2>Artists</h2>
                <ScrollRow label="Artists in these results" className="music-discover-row">
                  {resultArtists.map((name) => (
                    <button key={name} type="button" className="filter-chip music-discover-artist-pill" onClick={() => setFacets({ ...EMPTY_FACETS, artist: name })}>
                      {name}
                    </button>
                  ))}
                </ScrollRow>
              </section>
            )}

            {resultCharacters.length > 0 && (
              <section className="op-section music-discover-section">
                <h2>Characters</h2>
                <ScrollRow label="Characters in these results" className="music-discover-row">
                  {resultCharacters.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className="btn-bare music-discover-character-tile"
                      onClick={() => setFacets({ ...EMPTY_FACETS, character: name })}
                    >
                      <CharacterPortrait name={name} artPath={artByName.get(name)} />
                      <span className="music-discover-character-name">{name}</span>
                    </button>
                  ))}
                </ScrollRow>
              </section>
            )}
          </div>
        ) : (
          <>
            <section className="op-section music-discover-section">
              <div className="music-discover-section-heading">
                <h2>Recently added</h2>
              </div>
              <ScrollRow label="Recently added albums" className="music-discover-row">
                {recentAlbums.map((a) => <AlbumTile key={a.albumId} album={a} withCount={false} onOpen={() => openAlbum(a.albumId)} />)}
              </ScrollRow>
            </section>

            <section className="op-section music-discover-section" aria-labelledby="discover-likes-heading">
              <div className="music-discover-section-heading">
                <h2 id="discover-likes-heading">Most liked on YouTube</h2>
                {rankedSongs.length > ROW_PREVIEW_COUNT && showAllButton('likes', 'discover-likes')}
              </div>
              <div className="music-discover-likes-content" aria-busy={likesLoading}>
                {rankedSongs.length > 0 ? <>
                  <Collection id="discover-likes" label="Songs ordered by YouTube likes" expanded={likesExpanded} grid albums controls>
                    {visibleRankedSongs.map(song => {
                      const title = songTitle(song.title, song.altTitle);
                      const count = youtubeLikes!.likes[song.videoId].toLocaleString('en-US');
                      return <button key={song.videoId} type="button" className="btn-bare music-discover-album-tile"
                        data-song-id={song.videoId} aria-label={`Play ${title} now, ${count} YouTube likes`}
                        title={`${title} · ${count} YouTube likes`} aria-current={playingId === song.videoId ? 'true' : undefined}
                        onClick={() => playSong(song.videoId)}>
                        <AlbumCover coverPath={song.coverPath} size={120} className="music-discover-album-tile-cover" />
                        <span className="music-discover-album-tile-name">{title}</span>
                        <span className="music-discover-album-tile-count">{count} likes</span>
                      </button>;
                    })}
                  </Collection>
                  <p className="hint music-discover-likes-note">Likes on each linked upload · Updated <time dateTime={youtubeLikes!.updatedAt}>{youtubeLikes!.updatedAt.slice(0, 10)}</time></p>
                </> : <p className="hint" role="status">{likesLoading ? 'Loading YouTube likes…' : 'YouTube likes are temporarily unavailable.'}</p>}
              </div>
            </section>

            {albums.length > 0 && (
              <section className="op-section music-discover-section">
                <div className="music-discover-section-heading">
                  <h2>Browse by album</h2>
                  {albums.length > ROW_PREVIEW_COUNT && showAllButton('albums', 'discover-albums')}
                </div>
                {albumsExpanded && (
                  <div className="music-discover-album-tools">
                    <div className="music-discover-artist-filter">
                      <SearchInput label="Filter albums" name="discover-album-filter" placeholder={`Filter ${albums.length} albums…`}
                        value={albumFilter} onChange={setAlbumFilter} />
                    </div>
                    <div role="group" aria-label="Order albums" className="music-discover-album-order">
                      <button type="button" className="filter-chip" aria-pressed={albumOrder === 'newest'} onClick={() => setAlbumOrder('newest')}>Newest</button>
                      <button type="button" className="filter-chip" aria-pressed={albumOrder === 'name'} onClick={() => setAlbumOrder('name')}>A–Z</button>
                    </div>
                  </div>
                )}
                <Collection id="discover-albums" label="Albums" expanded={albumsExpanded} grid albums>
                  {visibleAlbums.map((a) => <AlbumTile key={a.albumId} album={a} withCount={albumsExpanded} onOpen={() => openAlbum(a.albumId)} />)}
                </Collection>
                {albumsExpanded && visibleAlbums.length === 0 && <p className="hint">No album matches “{albumFilter.trim()}”.</p>}
              </section>
            )}

            <section className="op-section music-discover-section">
              <div className="music-discover-section-heading">
                <h2>Browse by character</h2>
                {characters.length > ROW_PREVIEW_COUNT && showAllButton('characters', 'discover-characters')}
              </div>
              <Collection id="discover-characters" label="Characters" expanded={browseCollection === 'characters'}>
                {visibleCharacters.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    className="btn-bare music-discover-character-tile"
                    onClick={() => setFacets({ ...EMPTY_FACETS, character: c.name })}
                    title={songCount(c.count)}
                  >
                    <CharacterPortrait name={c.name} artPath={c.artPath} />
                    <span className="music-discover-character-name">{c.name}</span>
                  </button>
                ))}
              </Collection>
            </section>

            {origins.length > 0 && (
              <section className="op-section music-discover-section">
                <div className="music-discover-section-heading">
                  <h2>Browse by story</h2>
                  {origins.length > ROW_PREVIEW_COUNT && showAllButton('origins', 'discover-origins')}
                </div>
                <Collection id="discover-origins" label="Stories" expanded={browseCollection === 'origins'} cloud>
                  {visibleOrigins.map((o) => (
                    <button
                      key={o.name}
                      type="button"
                      className="btn-bare music-discover-origin-pill"
                      style={{ fontSize: weightedPillSize(o.count, maxOriginCount) }}
                      onClick={() => setFacets({ ...EMPTY_FACETS, origin: o.name })}
                      title={songCount(o.count)}
                    >
                      {o.name}
                    </button>
                  ))}
                </Collection>
              </section>
            )}

            <section className="op-section music-discover-section">
              <div className="music-discover-section-heading">
                <h2>Featured artists</h2>
                {artists.length > ROW_PREVIEW_COUNT && showAllButton('artists', 'discover-artists')}
              </div>
              {artistsExpanded && (
                <div className="music-discover-artist-filter">
                  <SearchInput label="Filter artists" name="discover-artist-filter" placeholder={`Filter ${artists.length} artists…`}
                    value={artistFilter} onChange={setArtistFilter} />
                </div>
              )}
              <Collection id="discover-artists" label="Artists" expanded={artistsExpanded} grid>
                {visibleArtists.map((a) => (
                  <button key={a.name} type="button" className="btn-bare music-discover-artist-card" onClick={() => setFacets({ ...EMPTY_FACETS, artist: a.name })}>
                    <span className="music-discover-artist-name">{a.name}</span>
                    <span className="music-discover-artist-count">{songCount(a.count)}</span>
                  </button>
                ))}
              </Collection>
              {artistsExpanded && visibleArtists.length === 0 && <p className="hint">No artist matches “{artistFilter.trim()}”.</p>}
            </section>
          </>
        )}
        {browseFloor.spacer}
        </div>
        <MusicTransportBar view="discover" compact coverPath={playingId ? coverByVideoId.get(playingId) ?? null : undefined} />
      </main>
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>("/music/discover", async () => {
  const data = getDiscoverPageData();
  return { props: data };
}, {
  // The live release can be one compiled before pendingSongs and playable existed.
  // The artists and the characters' portraits by this code's rules, whichever release it renders.
  finalize: async (props) => discoverForDisplay(discoverFromRelease(props)),
});
