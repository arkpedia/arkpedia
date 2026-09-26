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
import { useHeightFloor } from '@/components/ui/useHeightFloor';
import { useMusicPlayer } from '@/lib/music/musicPlayerContext';
import { useQueryState } from '@/lib/hooks/useQueryState';
import AlbumCover from '@/components/music/AlbumCover';
import { getDiscoverPageData, DiscoverSong, DiscoverFacet, DiscoverCharacter, DiscoverAlbum, DiscoverPendingSong } from '@/lib/music/albumsDataServer';

interface Props {
  songs: DiscoverSong[];
  characters: DiscoverCharacter[];
  origins: DiscoverFacet[];
  artists: DiscoverFacet[];
  recentAlbums: DiscoverAlbum[];
  pendingSongs: DiscoverPendingSong[];
}

/** Where a song without a YouTube upload can be heard: its page on Monster Siren. */
const monsterSirenSong = (songId: string) => `https://monster-siren.hypergryph.com/music/${encodeURIComponent(songId)}`;

// Keep the initial browse rows bounded. Show all expands a collection inline.
const ROW_PREVIEW_COUNT = 24;

// Pill font size scales with how many songs share that origin/story,
// within this range -- an event with dozens of songs reads as an
// obvious, inviting entry point; one with just a song or two stays
// small and specific, which is exactly what invites "wait, what's
// that?" curiosity rather than looking like an afterthought.
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
function Collection({ id, label, expanded, cloud = false, children }: { id: string; label: string; expanded: boolean; cloud?: boolean; children: ReactNode }) {
  const className = `music-discover-row${cloud ? ' music-discover-cloud-row' : ''}`;
  return expanded
    ? <div id={id} className={`${className} expanded`}>{children}</div>
    : <div id={id}><ScrollRow label={label} className={className}>{children}</ScrollRow></div>;
}

export default function DiscoverPage({ songs, characters, origins, artists, recentAlbums, pendingSongs }: Props) {
  const { playTrackByVideoId } = useMusicPlayer();
  const router = useRouter();

  // Both the search text (?q=...) and the active facet are mirrored
  // into the URL so a filtered view survives reload and can be shared.
  // The hook applies the URL's value only after hydration, so first
  // paint is always the plain browse view (hydration-safe).
  const [query, setQuery] = useQueryState('q');
  const [browseCollection, setBrowseCollection] = useQueryState('browse');

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
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (s: DiscoverSong | DiscoverPendingSong) => {
      if (facets.character && !s.characters.includes(facets.character)) return false;
      if (facets.artist && s.artist !== facets.artist) return false;
      if (facets.origin && !s.origin.includes(facets.origin)) return false;
      if (facets.albumId && s.albumId !== facets.albumId) return false;
      if (!q) return true;
      return (
        s.title.toLowerCase().includes(q) ||
        (s.altTitle && s.altTitle.toLowerCase().includes(q)) ||
        s.albumName.toLowerCase().includes(q) ||
        (s.artist && s.artist.toLowerCase().includes(q)) ||
        s.characters.some((c) => c.toLowerCase().includes(q)) ||
        s.origin.some((o) => o.toLowerCase().includes(q))
      );
    };
  }, [query, facets]);
  const filteredSongs = useMemo(() => (isBrowsing ? [] : songs.filter(matches)), [songs, matches, isBrowsing]);
  /* Songs of a new album nobody has found a YouTube upload for yet: the player cannot queue
     them, so they are listed after the playable ones, linking to Monster Siren. Without them
     a new album's tile opened onto "No songs match". */
  const filteredPending = useMemo(() => (isBrowsing ? [] : pendingSongs.filter(matches)), [pendingSongs, matches, isBrowsing]);
  const playableAlbums = useMemo(() => new Set(songs.map((s) => s.albumId)), [songs]);

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
  }, [query, facetParam]);
  const visibleFilteredSongs = filteredSongs.slice(0, songsVisibleCount);

  // What albums/artists/characters are actually represented within the
  // current result set -- derived from filteredSongs directly, so text
  // search and facet-selection both naturally produce sensible Album/
  // Artist/Character sections without needing separate matching logic
  // for each: "what's IN these results" is the same question either way.
  const resultAlbums = useMemo(() => {
    const seen = new Map<string, { albumId: string; albumName: string; coverPath: string | null }>();
    for (const s of [...filteredSongs, ...filteredPending]) {
      if (!seen.has(s.albumId)) seen.set(s.albumId, { albumId: s.albumId, albumName: s.albumName, coverPath: s.coverPath });
    }
    return Array.from(seen.values());
  }, [filteredSongs, filteredPending]);

  const resultArtists = useMemo(() => {
    const seen = new Set<string>();
    for (const s of filteredSongs) if (s.artist) seen.add(s.artist);
    return Array.from(seen);
  }, [filteredSongs]);

  const resultCharacters = useMemo(() => {
    const seen = new Set<string>();
    for (const s of filteredSongs) for (const c of s.characters) seen.add(c);
    return Array.from(seen);
  }, [filteredSongs]);

  const artByName = useMemo(() => new Map(characters.map((c) => [c.name, c.artPath])), [characters]);

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

  function playSong(videoId: string) {
    playTrackByVideoId(videoId);
  }

  const maxOriginCount = origins[0]?.count || 1;
  const visibleCharacters = browseCollection === 'characters' ? characters : characters.slice(0, ROW_PREVIEW_COUNT);
  const visibleOrigins = browseCollection === 'origins' ? origins : origins.slice(0, ROW_PREVIEW_COUNT);
  const visibleArtists = browseCollection === 'artists' ? artists : artists.slice(0, ROW_PREVIEW_COUNT);

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

      <PageHeader eyebrow="Rhodes Island // Sound Archive" title="Discover"
        sub={<>Know these tracks by heart? <Link href={GAME_PATHS.music} prefetch={false}>Play Music Guesser</Link></>}
        actions={<div className="music-discover-search-row">
          {!isBrowsing && (
            <button type="button" className="ghost music-discover-back-btn" onClick={backToBrowse} aria-label="Back to browse">
              ‹ Back
            </button>
          )}
          <SearchInput label="Search songs, characters, artists, albums" name="discover-search"
            placeholder="Search songs, characters, artists, albums…" value={query} onChange={setQuery} />
        </div>} />

      <main className="music-discover-page">
        <div ref={browseFloor.ref} className="music-discover-body">

        {!isBrowsing ? (
          <div className="music-discover-results">
            <section className="op-section music-discover-section">
              <h2>
                Songs
                {activeFacetLabel && <span className="music-discover-active-facet"> · {activeFacetLabel}</span>}
              </h2>
              {filteredSongs.length === 0 && filteredPending.length === 0 ? (
                <p className="hint">No songs match. Try a different search or go back and pick something else.</p>
              ) : (
                <div className="music-discover-song-list">
                  {visibleFilteredSongs.map((s) => (
                    <button key={s.videoId} type="button" className="btn-bare music-discover-song-row" onClick={() => playSong(s.videoId)}>
                      <div className="music-discover-song-cover">
                        <AlbumCover coverPath={s.coverPath} size={44} className="music-discover-song-cover-art" />
                      </div>
                      <div className="music-discover-song-info">
                        <span className="music-discover-song-title">{s.title}</span>
                        <span className="music-discover-song-meta">
                          {s.albumName}
                          {s.artist ? ` · ${s.artist}` : ''}
                        </span>
                      </div>
                    </button>
                  ))}
                  {songsVisibleCount < filteredSongs.length && (
                    <button
                      type="button"
                      className="ghost music-discover-show-more"
                      onClick={() => setSongsVisibleCount((c) => c + SONGS_PAGE_SIZE)}
                    >
                      Show more ({filteredSongs.length - songsVisibleCount} remaining)
                    </button>
                  )}
                  {songsVisibleCount >= filteredSongs.length && filteredPending.map((s) => (
                    <a key={s.songId} className="music-discover-song-row music-discover-song-row-pending" href={monsterSirenSong(s.songId)} target="_blank" rel="noopener noreferrer">
                      <div className="music-discover-song-cover">
                        <AlbumCover coverPath={s.coverPath} size={44} className="music-discover-song-cover-art" />
                      </div>
                      <div className="music-discover-song-info">
                        <span className="music-discover-song-title">{s.title}</span>
                        <span className="music-discover-song-meta">{s.albumName} · Not on YouTube yet · Listen on Monster Siren ↗</span>
                      </div>
                    </a>
                  ))}
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
                      {!playableAlbums.has(a.albumId) && <span className="music-discover-album-tile-note">Not on YouTube yet</span>}
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
                      <div className="music-discover-character-portrait">
                        {artByName.get(name) ? <Image src={artByName.get(name) as string} alt="" width={64} height={64} /> : null}
                      </div>
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
                {recentAlbums.map((a) => (
                  <button
                    key={a.albumId}
                    type="button"
                    className="btn-bare music-discover-album-tile"
                    onClick={() => setFacets({ ...EMPTY_FACETS, albumId: a.albumId })}
                    title={a.albumAltName}
                  >
                    <AlbumCover coverPath={a.coverPath} size={120} className="music-discover-album-tile-cover" />
                    <span className="music-discover-album-tile-name">{a.albumAltName}</span>
                    {!a.playable && <span className="music-discover-album-tile-note">Not on YouTube yet</span>}
                  </button>
                ))}
              </ScrollRow>
            </section>

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
                    title={`${c.count} song${c.count === 1 ? '' : 's'}`}
                  >
                    <div className="music-discover-character-portrait">{c.artPath && <Image src={c.artPath} alt="" width={64} height={64} />}</div>
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
                      title={`${o.count} song${o.count === 1 ? '' : 's'}`}
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
              <Collection id="discover-artists" label="Artists" expanded={browseCollection === 'artists'}>
                {visibleArtists.map((a) => (
                  <button key={a.name} type="button" className="filter-chip music-discover-artist-pill" onClick={() => setFacets({ ...EMPTY_FACETS, artist: a.name })}>
                    {a.name}
                  </button>
                ))}
              </Collection>
            </section>
          </>
        )}
        {browseFloor.spacer}
        </div>
      </main>
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>("/music/discover", async () => {
  const data = getDiscoverPageData();
  return { props: data };
});