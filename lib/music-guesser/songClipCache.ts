import { prepareClip } from './prepareClip';

export interface SongClip {
  url: string;
  buffer: AudioBuffer | null;
}

async function loadSongClip(songId: string, signal: AbortSignal, prepareOpening = true): Promise<SongClip> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.throwIfAborted();
  signal.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 15000);
  try {
    const response = await fetch(`/api/music-guesser/${songId}`, { signal: controller.signal });
    if (!response.ok) throw new Error('Audio unavailable');
    const { url } = await response.json();
    controller.signal.throwIfAborted();
    clearTimeout(timeout);
    let buffer: AudioBuffer | null = null;
    if (prepareOpening) try { buffer = await prepareClip(url, controller.signal); } catch { /* retain streamed playback */ }
    controller.signal.throwIfAborted();
    return { url, buffer };
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
    controller.abort();
  }
}

interface Entry {
  controller: AbortController;
  promise: Promise<SongClip>;
  expiresAt: number;
}

/** Session-only storage for the current and upcoming song. Both foreground
 * playback and preloading share the same request, including while it is pending. */
export class SongClipCache {
  private entries = new Map<string, Entry>();

  constructor(private loadClip = loadSongClip, private prepareOpening = true) {}

  load(songId: string): Promise<SongClip> {
    const cached = this.entries.get(songId);
    if (cached && cached.expiresAt > Date.now()) return cached.promise;
    this.remove(songId);
    // Keep at most two decoded openings, never a growing playlist in memory.
    if (this.entries.size >= 2) this.remove(this.entries.keys().next().value!);
    const controller = new AbortController();
    const entry: Entry = {
      controller,
      expiresAt: Infinity,
      promise: this.loadClip(songId, controller.signal, this.prepareOpening).then((clip) => {
        controller.signal.throwIfAborted();
        // A decoded buffer remains usable without its signed CDN URL. Refresh
        // streamed fallbacks after a minute, e.g. after a long round or idle tab.
        entry.expiresAt = clip.buffer ? Infinity : Date.now() + 60000;
        return clip;
      }).catch((error) => {
        if (this.entries.get(songId) === entry) this.entries.delete(songId);
        throw error;
      }),
    };
    this.entries.set(songId, entry);
    return entry.promise;
  }

  retain(songIds: string[]) {
    for (const id of this.entries.keys()) if (!songIds.includes(id)) this.remove(id);
  }

  remove(songId: string) {
    this.entries.get(songId)?.controller.abort();
    this.entries.delete(songId);
  }

  clear() { this.retain([]); }
}
