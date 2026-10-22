// What Discover lists for the reader's settings (lib/music/songFilter.ts). Its props carry every
// game's songs and albums, each Endfield one marked; the page draws only what this returns, so
// browsing hides exactly what the queue, shuffle and the Library hide. Client-safe: no data/.
import { artistFacets, type ArtistFacet } from './artistCredits';
import { songAllowed, type FilterableSong, type SongFilter } from './songFilter';

/** How many albums Recently added shows. The release carries the newest this many of each game
 *  (lib/music/albumsDataServer.ts), so the row stays full whichever games the reader has on. */
export const RECENT_ALBUMS_LIMIT = 12;

export interface DiscoverLists<S, R, A> {
  songs: readonly S[];
  recentAlbums: readonly R[];
  albums: readonly A[];
  artists: readonly ArtistFacet[];
}

export function discoverShown<S extends FilterableSong & { artist: string | null }, R extends FilterableSong, A extends FilterableSong>(
  lists: DiscoverLists<S, R, A>,
  filter: SongFilter,
): { songs: S[]; recentAlbums: R[]; albums: A[]; artists: ArtistFacet[] } {
  // Discover's rows carry no copyright flag: only the game decides here.
  const shown = (item: FilterableSong) => songAllowed({ ...filter, excludeCopyrighted: false }, item);
  const songs = lists.songs.filter(shown);
  return {
    songs,
    recentAlbums: lists.recentAlbums.filter(shown).slice(0, RECENT_ALBUMS_LIMIT),
    albums: lists.albums.filter(shown),
    // Counted from the songs shown, so an artist with only hidden songs is not offered.
    artists: songs.length === lists.songs.length ? [...lists.artists] : artistFacets(songs),
  };
}
