import type { NativeAudioPlugin } from './nativeAudio';

// A phone layout or quick mode change can mount a new observer before the previous
// native call resolves. Keep the single-flight boundary across those lifetimes.
const pending = new WeakSet<NativeAudioPlugin>();

/** One request at a time, only while visible. Never retain a previous song's plot. */
export function observeNativeSpectrum(plugin: NativeAudioPlugin, trackId: string, draw: (bands: number[] | null) => void) {
  let disposed = false, frame = 0, visibilityEpoch = 0;
  let requested = -Infinity, received = -Infinity;
  const clear = () => { received = -Infinity; draw(null); };
  const visibility = () => { visibilityEpoch += 1; clear(); };
  const tick = (now: number) => {
    if (disposed) return;
    frame = requestAnimationFrame(tick);
    if (document.hidden) return;
    if (now - received > 500) draw(null);
    if (pending.has(plugin) || now - requested < 40 || !plugin.getSpectrum) return;
    requested = now; pending.add(plugin);
    const epoch = visibilityEpoch, started = performance.now();
    void Promise.resolve().then(() => plugin.getSpectrum!()).then(result => {
      if (disposed || document.hidden || epoch !== visibilityEpoch) return;
      if (performance.now() - started > 500) { clear(); return; }
      if (!result.available || result.trackId !== trackId || !Array.isArray(result.bands)
        || result.bands.length !== 48 || result.bands.some(level => !Number.isFinite(level) || level < 0 || level > 255)) {
        clear(); return;
      }
      received = performance.now();
      draw(result.bands);
    }).catch(() => { if (!disposed) clear(); }).finally(() => { pending.delete(plugin); });
  };
  document.addEventListener('visibilitychange', visibility);
  frame = requestAnimationFrame(tick);
  return () => {
    disposed = true; cancelAnimationFrame(frame);
    document.removeEventListener('visibilitychange', visibility);
    clear();
  };
}
