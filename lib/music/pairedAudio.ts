import { createMusicAudioElement, msrAudioAddress, releaseMusicAudioFile, setMusicAudioFile } from './audioElement';

/** A muted copy of the other recording follows the audible element. A warm switch
 * changes which element is audible in the same task, without reloading or seeking it. */
export function createPairedAudio(active: () => HTMLAudioElement, attach: (el: HTMLAudioElement) => void) {
  let standby: HTMLAudioElement | null = null;
  let cid = '';
  let offset: number | null = 0; // null prepares a different edit at its beginning.
  let requested: { run: () => void; at: number } | null = null;
  let timer: number | undefined;
  let blocked = false;

  function clear() {
    window.clearInterval(timer);
    requested = null;
    if (standby) {
      standby.pause();
      standby.removeAttribute('src');
      standby.load();
      releaseMusicAudioFile(standby);
      standby.remove();
    }
    standby = null;
    cid = '';
  }

  function aligned() {
    const a = active(), b = standby;
    return offset !== null && b && b.readyState >= 3 && !a.seeking && !b.seeking && !b.paused && !a.paused
      && Math.abs(a.currentTime + offset - b.currentTime) <= 0.035;
  }

  function follow() {
    const a = active(), b = standby;
    if (!b) return;
    const at = offset === null ? 0 : a.currentTime + offset;
    const outside = offset === null || at < 0 || at >= b.duration;
    if (outside || a.paused || a.ended || a.seeking || a.readyState < 3) {
      if (!b.paused) b.pause();
    } else if (b.readyState >= 2 && !b.seeking && !blocked) {
      const delta = at - b.currentTime;
      // Seek for a scrub or a track change. For ordinary decoder drift, bring
      // the muted clock back smoothly without repeatedly flushing its buffer.
      if (Math.abs(delta) > 0.35) b.currentTime = at;
      else b.playbackRate = Math.abs(delta) > 0.012 ? 1 + Math.max(-0.25, Math.min(0.25, delta * 2)) : 1;
      if (b.paused) {
        void b.play().catch(error => { if (standby === b && error.name !== 'AbortError') blocked = true; });
      }
    }
    if (requested && (outside || aligned() || a.paused || blocked || b.error || performance.now() - requested.at > 2500)) {
      const { run } = requested;
      requested = null;
      run();
    }
  }

  return {
    duration(next: string) { return next === cid && standby && Number.isFinite(standby.duration) ? standby.duration : undefined; },
    prepare(next: string | null, secondsOffset: number | null = 0) {
      offset = secondsOffset;
      if (next === cid || (!next && !standby)) return;
      clear();
      if (!next) return;
      cid = next;
      standby = createMusicAudioElement('standby');
      attach(standby);
      blocked = false;
      setMusicAudioFile(standby, next, msrAudioAddress(next), offset === null ? 0 : Math.max(0, active().currentTime + offset));
      timer = window.setInterval(follow, 80);
    },
    whenReady(next: string, run: () => void) {
      if (standby && next === cid && !active().paused && !aligned() && !blocked && !standby.error) {
        requested = { run, at: performance.now() };
        follow();
      } else run();
    },
    swap(next: string, outgoing: string, continuePlaying: boolean) {
      if (!standby || cid !== next || standby.error || standby.readyState < 1) return null;
      const live = continuePlaying && Boolean(aligned());
      const incoming = standby;
      const previous = active();
      // Next from the queue starts at zero, and a paused switch waits at its
      // timestamp. Both can still take the prepared element without a new request.
      if (!live) incoming.pause();
      incoming.playbackRate = 1;
      incoming.volume = previous.volume;
      previous.muted = true;
      incoming.muted = false;
      previous.removeAttribute('data-music-audio');
      previous.setAttribute('data-music-standby', '');
      incoming.removeAttribute('data-music-standby');
      incoming.setAttribute('data-music-audio', '');
      standby = previous;
      cid = outgoing;
      if (offset !== null) offset = -offset;
      requested = null;
      return { element: incoming, live };
    },
    clear,
  };
}
