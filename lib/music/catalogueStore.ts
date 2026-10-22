/**
 * The player's song catalogue, kept per content release (lib/music/musicPlayerContext.tsx).
 *
 * The player outlives every page, and pages are served from whichever release is live when they
 * load. It used to download the catalogue once a visit, so a tab opened before a release kept
 * that release's songs for good: Discover and the Library, which load their own copy, listed the
 * new ones (Endfield's, 2026-10-22), and Play next and Add to queue answered "can't be queued",
 * since the queue takes only songs its catalogue has. Asked for another release's address, this
 * loads that catalogue instead; one download per address, shared by every caller asking at once.
 * A failed download leaves the catalogue already loaded in place: the player never loses its
 * songs to a newer release that does not load.
 */
export interface CatalogueStore<T> {
  /** The catalogue for `url`: the one loaded already when it came from there, else loaded now. */
  get(url: string): Promise<T[]>;
  /** The catalogue loaded last, whichever release it came from; null before any has loaded. */
  readonly current: T[] | null;
}

export function createCatalogueStore<T>(load: (url: string) => Promise<T[]>): CatalogueStore<T> {
  let loaded: { url: string; songs: T[] } | null = null;
  let pending: { url: string; promise: Promise<T[]> } | null = null;
  return {
    get current() { return loaded?.songs ?? null; },
    async get(url) {
      if (loaded?.url === url) return loaded.songs;
      if (pending?.url !== url) pending = { url, promise: load(url) };
      const asked = pending;
      try {
        const songs = await asked.promise;
        // A later ask for another address may have finished first: the newest ask wins.
        if (pending === asked) { loaded = { url, songs }; pending = null; }
        return songs;
      } catch (error) {
        if (pending === asked) pending = null;
        if (loaded) return loaded.songs;
        throw error;
      }
    },
  };
}
