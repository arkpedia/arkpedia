import { readPublishedContentPageProps } from '@/lib/content/release';
import { previousPage } from '@/lib/nav/pageTrail';
import { restoreScrollOnReturn } from '@/lib/nav/scrollRestoration';
import QueuePanel from '@/components/music/QueuePanel';
import { withContentPage } from '@/lib/content/server';
import PageMeta from '@/components/layout/PageMeta';
import { GetStaticProps } from 'next';
import Image from '@/components/content/ContentImage';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { GAME_PATHS } from '@/lib/minigames/catalogue';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import TransportIcon from '@/components/music/TransportIcons';
import MusicHeader from '@/components/music/MusicHeader';
import ScrollRow from '@/components/ui/ScrollRow';
import SearchInput from '@/components/ui/SearchInput';
import StyledSelect from '@/components/ui/StyledSelect';
import { useHeightFloor } from '@/components/ui/useHeightFloor';
import { useMusicPlayer } from '@/lib/music/musicPlayerContext';
import { useQueryState } from '@/lib/hooks/useQueryState';
import AlbumCover from '@/components/music/AlbumCover';
import { discoverForDisplay, discoverFromRelease, getDiscoverPageData, getAllSongModalLookup, DiscoverSong, DiscoverFacet, DiscoverCharacter, DiscoverAlbum, DiscoverBrowseAlbum, DiscoverPendingSong } from '@/lib/music/albumsDataServer';
import LoadOnScroll from '@/components/ui/LoadOnScroll';
import MusicNav from '@/components/music/MusicNav';
import MusicPlaylists from '@/components/music/MusicPlaylists';
import MusicTransportBar from '@/components/music/MusicTransportBar';
import SongRow from '@/components/music/SongRow';
import SongActionsMenu from '@/components/music/SongActionsMenu';
import { createSongIndex, musicFacetMatches } from '@/lib/music/songSearch';
import { msrTrackId } from '@/lib/music/trackId';
import { artistKey, creditedArtists, creditsArtist } from '@/lib/music/artistCredits';
import { characterInitials } from '@/lib/music/characterPortraits.mjs';
import { useLikesChart } from '@/lib/music/useLikesChart';
import { byYouTubeLikes, mostLikedSongs } from '@/lib/music/youtubeLikes';
import CommunityContributionFooter from '@/components/community/CommunityContributionFooter';
import { byArkpediaLikes, mostLikedTracks } from '@/lib/music/arkpediaLikes';
import { songTitle } from '@/lib/music/musicPolish';
import { discoverShown } from '@/lib/music/discoverFilter';
import MusicGameSetting from '@/components/music/MusicGameSetting';
import HiddenEndfieldHint from '@/components/music/HiddenEndfieldHint';
import { gameSearchNames } from '@/lib/music/songFilter';

interface Props {
  lyricIds?: string[];
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

const likeCount = (count: number, source = '') => `${count.toLocaleString('en-US')}${source} like${count === 1 ? '' : 's'}`;
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

type AlbumOrder = 'newest' | 'oldest' | 'name';

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

export default function DiscoverPage({ songs: releaseSongs, characters, origins, artists: releaseArtists, recentAlbums: releaseRecentAlbums, albums: releaseAlbums, pendingSongs, lyricIds }: Props) {
  const { playPlaylist, queueSong, videoId: playingId, queued, favorites, toggleFavorite, noAutoplay, toggleNoAutoplay, libraryTracks, includeEndfield } = useMusicPlayer();
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
  const [musicMenuOpen, setMusicMenuOpen] = useState(false);
  // Also recognize a detail already open in a tab from before the player links carried their origin.
  const [initialReturn, setInitialReturn] = useState(false);
  useEffect(() => {
    if (!router.isReady) return;
    const url = new URL(window.location.href);
    const previous = previousPage();
    if (!url.searchParams.has('from') && (url.searchParams.has('facet') || url.searchParams.has('q')) && previous) {
      const source = new URL(previous, window.location.origin);
      setInitialReturn(source.pathname === '/music' && source.searchParams.get('view') === 'player');
    }
  }, [router.isReady]);
  const returnToPlayer = router.query.from === 'player' || initialReturn;

  // Both the search text (?q=...) and the active facet are mirrored
  // into the URL so a filtered view survives reload and can be shared.
  // The hook applies the URL's value only after hydration, so first
  // paint is always the plain browse view (hydration-safe).
  const [query, setQuery] = useQueryState('q');
  const [browseCollection, setBrowseCollection] = useQueryState('browse');
  const [songOrder, setSongOrder] = useQueryState('sort');
  const { data: chart, loading: likesLoading } = useLikesChart('Arkpedia');
  const { data: youtubeChart, loading: youtubeLoading } = useLikesChart('YouTube');
  const rankedSongs = useMemo(() => chart ? mostLikedTracks(allSongs.filter(song =>
    includeEndfield || !('game' in song && song.game === 'endfield')), chart.likes, trackIdOf) : [], [allSongs, chart, includeEndfield]);
  const youtubeSongs = useMemo(() => youtubeChart ? mostLikedSongs(songs, youtubeChart.likes) : [], [songs, youtubeChart]);
  const charts = [
    { key: 'likes', source: 'Arkpedia', data: chart, loading: likesLoading, tracks: rankedSongs, empty: 'No favourites in the daily chart yet.' },
    { key: 'youtube-likes', source: 'YouTube', data: youtubeChart, loading: youtubeLoading, tracks: youtubeSongs, empty: 'No YouTube like counts available yet.' },
  ];
  const selectedChart = charts.find(item => item.key === songOrder);

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
  const selectedAlbum = albums.find(album => album.albumId === facets.albumId);
  const albumArtist = selectedAlbum && typeof router.query.artist === 'string' ? router.query.artist : '';
  const dates = useMemo(() => new Map(albums.map(album => [album.albumId, album.releaseDate])), [albums]);
  const albumArtists = useMemo(() => {
    const names = new Map<string, string>();
    for (const song of allSongs) if (song.albumId === facets.albumId) {
      for (const name of creditedArtists(song.artist)) names.set(artistKey(name), name);
    }
    return [...names.values()];
  }, [allSongs, facets.albumId]);
  const filteredSongs = useMemo(() => {
    const matching = matchingSongs.filter(s => (includeEndfield || !('game' in s && s.game === 'endfield')) && (!albumArtist || creditsArtist(s.artist, albumArtist)));
    if (songOrder === 'newest' || songOrder === 'oldest') return matching.sort((a, b) => {
      const first = dates.get(a.albumId) || '', second = dates.get(b.albumId) || '';
      return first && second ? (songOrder === 'oldest' ? first.localeCompare(second) : second.localeCompare(first)) : Number(!first) - Number(!second);
    });
    if (songOrder === 'likes' && chart) return byArkpediaLikes(matching, chart.likes, trackIdOf);
    if (songOrder === 'youtube-likes' && youtubeChart) return byYouTubeLikes(matching, youtubeChart.likes, trackIdOf);
    if (facets.albumId && !hasActiveQuery) return matching.sort((a, b) => (a.albumTrack ?? 0) - (b.albumTrack ?? 0));
    return matching;
  }, [matchingSongs, includeEndfield, songOrder, chart, youtubeChart, albumArtist, dates, facets.albumId, hasActiveQuery]);
  // Endfield songs the search or facet found while Endfield music is off (a search result for one).
  const hiddenEndfield = includeEndfield ? 0 : matchingSongs.filter(song => 'game' in song && song.game === 'endfield'
    && (!albumArtist || creditsArtist(song.artist, albumArtist))).length;

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

  const artistCatalogue = useMemo(() => {
    if (!facets.artist) return null;
    const tracks = allSongs.filter(song => inFacets(song) && (includeEndfield || !('game' in song && song.game === 'endfield')));
    return { songs: new Set(tracks.map(trackIdOf)).size, albums: new Set(tracks.map(song => song.albumId)).size };
  }, [allSongs, facets.artist, inFacets, includeEndfield]);
  const artistTools = artistCatalogue && (artistCatalogue.songs > 6 || hasActiveQuery || Boolean(songOrder));

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
    setInitialReturn(false);
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
    delete cleaned.artist;
    delete cleaned.from;
    router.replace({ pathname: router.pathname, query: cleaned }, undefined, { shallow: true, scroll: false });
  }

  function playSong(videoId: string, shelf?: typeof charts[number]) {
    if (shelf) {
      void playPlaylist(shelf.tracks.map(trackIdOf), { name: 'Most liked on ' + shelf.source, href: '/music/discover?browse=' + shelf.key }, videoId);
      return;
    }
    const params = new URLSearchParams();
    if (facetParam) params.set('facet', facetParam);
    if (query.trim()) params.set('q', query.trim());
    if (songOrder) params.set('sort', songOrder);
    if (albumArtist) params.set('artist', albumArtist);
    const name = [activeFacetLabel, albumArtist, query.trim()].filter(Boolean).join(' · ') || 'Discover';
    void playPlaylist(filteredSongs.map(trackIdOf), { name, href: '/music/discover?' + params }, videoId);
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
    return artistFilter.trim() ? artists.filter(a => musicFacetMatches(artistFilter, [a.name],
      songs.filter(song => creditsArtist(song.artist, a.name)).map(song => song.game))) : artists;
  }, [artists, artistsExpanded, artistFilter, songs]);

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
    const wanted = albumFilter.trim();
    const matching = wanted
      ? albums.filter(a => musicFacetMatches(wanted, [a.albumAltName, a.albumName, albumOriginals.get(a.albumId) ?? ''], [a.game]))
      : albums;
    return albumOrder === 'name'
      ? [...matching].sort((a, b) => a.albumAltName.localeCompare(b.albumAltName, 'en', { numeric: true, sensitivity: 'base' }))
      : albumOrder === 'oldest' ? [...matching].sort((a, b) => a.releaseDate && b.releaseDate ? a.releaseDate.localeCompare(b.releaseDate) : Number(!a.releaseDate) - Number(!b.releaseDate)) : matching;
  }, [albums, albumsExpanded, albumFilter, albumOrder, recentAlbumIds, albumOriginals]);
  const hiddenAlbumMatches = !includeEndfield && albumFilter.trim() ? releaseAlbums.filter(a => a.game === 'endfield' &&
    musicFacetMatches(albumFilter, [a.albumAltName, a.albumName], [a.game])).length : 0;
  const hiddenArtistMatches = !includeEndfield && artistFilter.trim() ? releaseArtists.filter(a =>
    releaseSongs.some(song => song.game === 'endfield' && creditsArtist(song.artist, a.name)) &&
    musicFacetMatches(artistFilter, [a.name], ['endfield']) && !visibleArtists.some(shown => artistKey(shown.name) === artistKey(a.name))).length : 0;
  const openAlbum = (albumId: string) => {
    const next: typeof router.query = { ...router.query, facet: `album:${albumId}` };
    delete next.q;
    delete next.sort;
    delete next.artist;
    void router.push({ pathname: router.pathname, query: next }, undefined, { scroll: false });
  };

  function filterAlbumArtist(name: string) {
    const next = { ...router.query };
    if (name) next.artist = name;
    else delete next.artist;
    void router.push({ pathname: router.pathname, query: next }, undefined, { shallow: true, scroll: false });
  }
  const activeFacetLabel = facets.character || facets.origin || facets.artist || selectedAlbum?.albumAltName || null;
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
      <PageMeta title={facets.artist || 'Discover'} description="Discover Arknights music: songs, albums and artists from Monster Siren Records." path="/music/discover" />

      {/* The music section's one header and nav, in the same place as on /music, so moving
          between Discover and the player's views moves nothing. */}
      <MusicHeader current="discover" open={musicMenuOpen} onOpen={() => setMusicMenuOpen(value => !value)} />
      <main className="music-discover-page">
        <MusicNav current="discover" open={musicMenuOpen} onOpenChange={setMusicMenuOpen}>{returnFocus => <><MusicPlaylists songs={playlistSongs} onClose={returnFocus} /><div className="music-phone-settings" onChange={() => setMusicMenuOpen(false)}><MusicGameSetting /></div></>}</MusicNav>
        <div className="music-workspace-content">
        {!facets.artist && <h2 className="section-title music-workspace-title">Discover</h2>}
        <div className="music-discover-search-row">
          {!isBrowsing && (returnToPlayer
            ? <Link className="back-btn music-discover-back-btn" href="/music?view=player" onNavigate={() => restoreScrollOnReturn('/music?view=player')}>‹ Back to Now playing</Link>
            : <button type="button" className="back-btn music-discover-back-btn" onClick={backToBrowse}>‹ Back to browse</button>)}
          {!facets.artist && <SearchInput label="Search songs, characters, artists, albums" name="discover-search"
            placeholder="Search songs, characters, artists, albums…" value={query} onChange={setQuery} />}
        </div>
        {isBrowsing && <p className="hint music-view-hint">Know these tracks by heart? <Link href={GAME_PATHS.music} prefetch={false}>Play Music Guesser</Link></p>}
        <div ref={browseFloor.ref} className="music-discover-body">

        {!isBrowsing ? (
          <div className={artistCatalogue?.albums === 1 ? 'music-discover-results music-single-release-artist' : 'music-discover-results'}>
            {artistCatalogue && <div className="music-artist-heading">
              <div><span className="label-tag">Artist</span>
                <h2 className="entity-title entity-title-name">{facets.artist}</h2>
                <span className="hint">{songCount(artistCatalogue.songs)} · {artistCatalogue.albums} {artistCatalogue.albums === 1 ? 'album' : 'albums'}</span>
              </div>
              {filteredSongs.length > 0 && <button type="button" className="primary btn-sm" onClick={() => playSong(trackIdOf(filteredSongs[0]))}
                aria-label={'Play songs by ' + facets.artist}><TransportIcon name="play" size={16} /> Play</button>}
            </div>}
            {selectedAlbum && <section className="music-album-overview">
              <AlbumCover coverPath={selectedAlbum.coverPath} size={128} className="music-context-art" />
              <div><span className="label-tag">Album</span><h2 className="entity-title">{selectedAlbum.albumAltName}</h2>
                <span>{[selectedAlbum.releaseDate, songCount(selectedAlbum.songCount)].filter(Boolean).join(' · ')}</span>
              </div>
              {albumArtists.length > 8 && <div className="music-album-artists"><StyledSelect label="Artist on this album" value={albumArtist} onChange={filterAlbumArtist}
                options={['', ...albumArtists].map(name => ({ value: name, label: name || 'All artists' }))} /></div>}
              {albumArtists.length > 0 && albumArtists.length <= 8 && <div className="music-album-artists" role="group" aria-label="Artists on this album">
                {['', ...albumArtists].map(name => <button type="button" key={name} className="filter-chip" aria-pressed={name === albumArtist}
                  onClick={() => filterAlbumArtist(name)}>{name || 'All artists'}</button>)}
              </div>}
              {albumArtist && <Link className="ghost btn-sm music-album-all-artist" href={{ pathname: router.pathname, query: { facet: 'artist:' + albumArtist } }}>All songs by {albumArtist}</Link>}
            </section>}
            <section className="op-section music-discover-section">
              <div className="music-discover-section-heading">
                <h2>
                  Songs
                  {!selectedAlbum && !facets.artist && activeFacetLabel && <span className="music-discover-active-facet"> · {activeFacetLabel}</span>}
                </h2>
                {artistTools && <SearchInput label="Search this artist’s songs" name="artist-song-search" placeholder="Find a song…" value={query} onChange={setQuery} />}
                {(!artistCatalogue || artistTools) && <div className="music-discover-song-order">
                  <span aria-hidden="true">Sort</span>
                  <StyledSelect label="Order songs" value={['likes', 'youtube-likes', 'oldest', 'newest'].includes(songOrder) ? songOrder : ''} onChange={setSongOrder} align="end"
                    options={[
                      { value: '', label: hasActiveQuery ? 'Best match' : facets.albumId ? 'Album order' : 'Default' },
                      ...(!selectedAlbum ? [{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }] : []),
                      ...charts.map(item => ({ value: item.key, label: 'Most liked on ' + item.source, disabled: !item.tracks.length })),
                    ]} />
                </div>}
              </div>
              {selectedChart && !selectedChart.tracks.length && <p className="hint" role="status">
                {selectedChart.loading ? 'Loading ' + selectedChart.source + ' likes…' : selectedChart.data ? selectedChart.empty : selectedChart.source + ' likes are temporarily unavailable. Showing default order.'}
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
                      detail={selectedChart?.data && (selectedChart.source === 'Arkpedia' || selectedChart.data.likes[id] !== undefined)
                        ? likeCount(selectedChart.data.likes[id] ?? 0, ' ' + selectedChart.source) : undefined}
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

            {!selectedAlbum && resultAlbums.length > 0 && (
              <section className="op-section music-discover-section">
                <h2>Albums</h2>
                <ScrollRow label="Albums in these results" className="music-discover-row">
                  {resultAlbums.map((a) => (
                    <button
                      key={a.albumId}
                      type="button"
                      className="btn-bare music-discover-album-tile"
                      onClick={() => openAlbum(a.albumId)}
                      title={a.albumName}
                    >
                      <AlbumCover coverPath={a.coverPath} size={120} className="music-discover-album-tile-cover" />
                      <span className="music-discover-album-tile-name">{a.albumName}</span>
                    </button>
                  ))}
                </ScrollRow>
              </section>
            )}

            {!selectedAlbum && !facets.artist && resultArtists.length > 0 && (
              <section className="op-section music-discover-section">
                <h2>Artists</h2>
                <ScrollRow label="Artists in these results" className="music-discover-row">
                  {resultArtists.map((name) => (
                    <Link key={name} prefetch={false} className="filter-chip music-discover-artist-pill" href={{ pathname: router.pathname, query: { facet: 'artist:' + name } }}>
                      {name}
                    </Link>
                  ))}
                </ScrollRow>
              </section>
            )}

            {!facets.artist && resultCharacters.length > 0 && (
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

            {charts.map(shelf => {
              const id = 'discover-' + shelf.key;
              const expanded = browseCollection === shelf.key;
              return (
                <section className="op-section music-discover-section" key={shelf.key} aria-labelledby={id + '-heading'}>
                  <div className="music-discover-section-heading">
                    <h2 id={id + '-heading'}>Most liked on {shelf.source}</h2>
                    {shelf.tracks.length > ROW_PREVIEW_COUNT && showAllButton(shelf.key, id)}
                  </div>
                  <div className="music-discover-likes-content" aria-busy={shelf.loading}>
                    {shelf.data && shelf.tracks.length > 0 ?
                      <Collection id={id} label={'Songs ordered by ' + shelf.source + ' likes'} expanded={expanded} grid albums controls>
                        {shelf.tracks.slice(0, expanded ? undefined : ROW_PREVIEW_COUNT).map(song => {
                          const title = songTitle(song.title, song.altTitle);
                          const id = trackIdOf(song);
                          const count = shelf.data!.likes[id];
                          // The tile plays the song; its ⋯ queues it, as a song row's does (it could only play, 2026-10-22).
                          return <div key={id} className="music-discover-like-tile">
                            <button type="button" className="btn-bare music-discover-album-tile" data-song-id={id}
                              aria-label={`Play ${title} now, ${likeCount(count, ' ' + shelf.source)}`}
                              title={`${title} · ${likeCount(count, ' ' + shelf.source)}`} aria-current={playingId === id ? 'true' : undefined}
                              onClick={() => playSong(id, shelf)}>
                              <AlbumCover coverPath={song.coverPath} size={120} className="music-discover-album-tile-cover" />
                              <span className="music-discover-album-tile-name">{title}</span>
                            </button>
                            <span className="music-discover-album-tile-count">{likeCount(count)}</span>
                            <SongActionsMenu song={{ id, title }} isActive={playingId === id}
                              onPlayNow={() => playSong(id, shelf)} onQueueNext={() => void queueSong(id, 'next')} onQueueLast={() => void queueSong(id, 'last')}
                              noAutoplay={{ on: noAutoplay.has(id), toggle: () => toggleNoAutoplay(id) }} />
                          </div>;
                        })}
                      </Collection>
                    : <p className="hint" role="status">{shelf.loading ? 'Loading ' + shelf.source + ' likes…' : shelf.data ? shelf.empty : shelf.source + ' likes are temporarily unavailable.'}</p>}
                  </div>
                  {shelf.source === 'Arkpedia' && <CommunityContributionFooter />}
                </section>
              );
            })}

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
                      <button type="button" className="filter-chip" aria-pressed={albumOrder === 'oldest'} onClick={() => setAlbumOrder('oldest')}>Oldest</button>
                      <button type="button" className="filter-chip" aria-pressed={albumOrder === 'name'} onClick={() => setAlbumOrder('name')}>A–Z</button>
                    </div>
                  </div>
                )}
                {albumsExpanded && <HiddenEndfieldHint count={hiddenAlbumMatches} kind="album" />}
                <Collection id="discover-albums" label="Albums" expanded={albumsExpanded} grid albums>
                  {visibleAlbums.map((a) => <AlbumTile key={a.albumId} album={a} withCount={albumsExpanded} onOpen={() => openAlbum(a.albumId)} />)}
                </Collection>
                {albumsExpanded && visibleAlbums.length === 0 && hiddenAlbumMatches === 0 && <p className="hint">No album matches “{albumFilter.trim()}”.</p>}
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
              {artistsExpanded && <HiddenEndfieldHint count={hiddenArtistMatches} kind="artist" />}
              <Collection id="discover-artists" label="Artists" expanded={artistsExpanded} grid>
                {visibleArtists.map((a) => (
                  <Link key={a.name} prefetch={false} className="btn-bare music-discover-artist-card" href={{ pathname: router.pathname, query: { facet: 'artist:' + a.name } }}>
                    <span className="music-discover-artist-name">{a.name}</span>
                    <span className="music-discover-artist-count">{songCount(a.count)}</span>
                  </Link>
                ))}
              </Collection>
              {artistsExpanded && visibleArtists.length === 0 && hiddenArtistMatches === 0 && <p className="hint">No artist matches “{artistFilter.trim()}”.</p>}
            </section>
          </>
        )}
        {browseFloor.spacer}
        </div>
        </div>
        <QueuePanel />
        <MusicTransportBar view="discover" hasLyrics={lyricIds?.includes(playingId) ?? false} compact coverPath={playingId ? coverByVideoId.get(playingId) ?? null : undefined} />
      </main>
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>("/music/discover", async () => {
  const data = getDiscoverPageData();
  return { props: { ...data, lyricIds: getAllSongModalLookup().filter(song => song.hasLyrics).map(song => song.videoId) } };
}, {
  // The live release can be one compiled before pendingSongs and playable existed.
  // The artists and the characters' portraits by this code's rules, whichever release it renders.
  finalize: async props => {
    const display = discoverForDisplay(discoverFromRelease(props));
    // Older catalogues preserve the order within each album in the released rows.
    const positions = new Map<string, number>();
    function withPosition<T extends { albumId: string; albumTrack?: number }>(song: T): T {
      const position = song.albumTrack ?? positions.get(song.albumId) ?? 0;
      positions.set(song.albumId, position + 1);
      return song.albumTrack === undefined ? { ...song, albumTrack: position } : song;
    }
    const ordered = { ...display, songs: display.songs.map(withPosition), pendingSongs: display.pendingSongs.map(withPosition) };
    if (props.lyricIds) return ordered;
    const music = await readPublishedContentPageProps<{ songLookup: { hasLyrics: boolean; videoId: string }[] }>('/music');
    const lookup = music?.songLookup;
    return { ...ordered, lyricIds: (lookup ?? []).filter(song => song.hasLyrics).map(song => song.videoId) };
  },
});
