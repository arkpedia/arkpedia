import { releaseSpectrumElement, selectSpectrumOutput } from './spectrumInput';
import { createMusicAudioElement, msrAudioAddress, releaseMusicAudioFile, setMusicAudioFile } from './audioElement';

/** A muted copy of the other recording follows the audible element. A warm switch
 * changes which element is audible in the same task, without reloading or seeking it. */
export function createPairedAudio(active: () => HTMLAudioElement, attach: (el: HTMLAudioElement) => void) {
  let standby: HTMLAudioElement | null = null;
  let cid = '';
  let offset: number | null = 0; // null prepares a different edit at its beginning.
  let timer: number | undefined;
  let blocked = false;

  function clear() {
    window.clearInterval(timer);
    if (standby) {
      standby.pause();
      standby.removeAttribute('src');
      standby.load();
      releaseMusicAudioFile(standby);
      releaseSpectrumElement(standby);
      standby.remove();
    }
    standby = null;
    cid = '';
  }

  // Media clocks can move in separate decoder updates. A difference within
  // one follower tick is already close enough to hand off without a seek.
  const followIntervalMs = 80;
  function aligned() {
    const a = active(), b = standby;
    return offset !== null && b && b.readyState >= 3 && !a.seeking && !b.seeking && !b.paused && !a.paused
      && Math.abs(a.currentTime + offset - b.currentTime) <= followIntervalMs / 1000;
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
      timer = window.setInterval(follow, followIntervalMs);
    },
    pause() { standby?.pause(); },
    swap(next: string, outgoing: string, continuePlaying: boolean) {
      if (!standby || cid !== next || standby.error) return null;
      const live = continuePlaying && Boolean(aligned());
      const incoming = standby;
      const previous = active();
      // Next from the queue starts at zero, and a paused switch waits at its
      // timestamp. Both can still take the prepared element without a new request.
      if (!live) incoming.pause();
      incoming.playbackRate = 1;
      incoming.volume = previous.volume;
      previous.muted = true;
      if (!live) previous.pause();
      // WebKit routes analysed decks through Web Audio. Muting the element alone
      // can leave its speaker connection alive while it follows the new version.
      selectSpectrumOutput(live ? incoming : undefined);
      incoming.muted = false;
      previous.removeAttribute('data-music-audio');
      previous.setAttribute('data-music-standby', '');
      incoming.removeAttribute('data-music-standby');
      incoming.setAttribute('data-music-audio', '');
      standby = previous;
      cid = outgoing;
      if (offset !== null) offset = -offset;
      return { element: incoming, live };
    },
    clear,
  };
}
