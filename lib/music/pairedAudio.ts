import { musicAudioVolume, muteMusicAudio, releaseSpectrumElement, selectSpectrumOutput, setMusicAudioVolume } from './spectrumInput';
import { createMusicAudioElement, msrAudioAddress, releaseMusicAudioFile, setMusicAudioFile } from './audioElement';

/** A silent copy of the other recording follows the audible element. A warm switch
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
      // WebKit's media-element Web Audio sources do not reliably handle rate
      // changes: a deck can return quiet or silent after following the other.
      // Keep its decoder at normal speed and correct the silent standby by seek.
      // https://bugs.webkit.org/show_bug.cgi?id=240405
      // Capturing browsers can correct ordinary drift smoothly with playbackRate.
      const adjustsRate = 'captureStream' in b;
      if (Math.abs(delta) > (adjustsRate ? 0.35 : followIntervalMs / 1000)) b.currentTime = at;
      else if (adjustsRate) {
        const rate = Math.abs(delta) > 0.012 ? 1 + Math.max(-0.25, Math.min(0.25, delta * 2)) : 1;
        if (b.playbackRate !== rate) b.playbackRate = rate;
      }
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
      setMusicAudioVolume(incoming, musicAudioVolume(previous));
      muteMusicAudio(previous);
      if (!live) previous.pause();
      // WebKit's graph owns muting and volume for both decks, independently of
      // the visualizer. Hand off its sole speaker connection in this same task.
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
