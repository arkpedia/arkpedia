type CapturableAudio = HTMLAudioElement & { captureStream?: () => MediaStream };

interface SpectrumInput {
  context: AudioContext;
  analyser: AnalyserNode;
  active: () => boolean;
  release: () => void;
}

let playerContext: AudioContext | undefined;
interface ElementOutput { source: MediaElementAudioSourceNode; gain: GainNode }
let speakerOutput: ElementOutput | undefined;
const elementSources = new WeakMap<HTMLAudioElement, ElementOutput>();
const elementVolumes = new WeakMap<HTMLAudioElement, number>();

/** Use one volume control after WebKit takes over the element's native output. */
export function setMusicAudioVolume(element: HTMLAudioElement, volume: number) {
  elementVolumes.set(element, volume);
  const output = elementSources.get(element);
  if (output) output.gain.gain.value = volume;
  else element.volume = volume;
}

export function musicAudioVolume(element: HTMLAudioElement) {
  return elementVolumes.get(element) ?? element.volume;
}

function resumePlayerContext() {
  if (playerContext && playerContext.state !== 'running') void playerContext.resume().catch(() => {});
}

/** WebKit needs a user gesture to unlock Web Audio. Leave native output alone until the graph runs. */
export function primeSpectrumContext() {
  if (typeof window === 'undefined' || !window.AudioContext || typeof HTMLMediaElement === 'undefined' || 'captureStream' in HTMLMediaElement.prototype) return;
  try {
    if (!playerContext) {
      playerContext = new AudioContext();
      document.addEventListener('click', resumePlayerContext, true);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) resumePlayerContext();
      });
    }
    resumePlayerContext();
  } catch { /* The native player can still play without Web Audio. */ }
}

/** Each WebKit deck uses the same graph at unity native volume. Muting/unmuting
 * a routed media element can change its output level when that deck is reused. */
function elementOutput(element: HTMLAudioElement): ElementOutput | undefined {
  let output = elementSources.get(element);
  if (output || playerContext?.state !== 'running') return output;
  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session?.type === 'auto') session.type = 'playback';
    const volume = musicAudioVolume(element);
    const source = playerContext.createMediaElementSource(element);
    const gain = playerContext.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    output = { source, gain };
    elementSources.set(element, output);
    // The disconnected graph silences a standby; native mute/volume no longer
    // participate in the handoff or compound the reader's preferred volume.
    element.volume = 1;
    element.muted = false;
  } catch { /* Native playback remains available if the graph cannot be made. */ }
  return output;
}

/** Only the selected deck connects to the speakers, including warm switches. */
export function selectSpectrumOutput(element?: HTMLAudioElement) {
  const next = element && elementOutput(element);
  if (next === speakerOutput) return;
  speakerOutput?.gain.disconnect(speakerOutput.gain.context.destination);
  speakerOutput = undefined;
  if (next) {
    next.gain.connect(next.gain.context.destination);
    speakerOutput = next;
  }
}

/** Silence a routed deck without changing the media element's native mute state. */
export function muteMusicAudio(element: HTMLAudioElement) {
  const output = elementSources.get(element);
  if (!output) element.muted = true;
  else if (output === speakerOutput) selectSpectrumOutput();
}

export function releaseSpectrumElement(element: HTMLAudioElement) {
  const output = elementSources.get(element);
  if (output === speakerOutput) selectSpectrumOutput();
  output?.source.disconnect();
  elementSources.delete(element);
  elementVolumes.delete(element);
}

export function openSpectrumInput(element: CapturableAudio): SpectrumInput | null {
  if (!window.AudioContext) return null;
  if (!element.captureStream) {
    primeSpectrumContext();
    const context = playerContext;
    if (!context) return null;
    const analyser = context.createAnalyser();
    let output: ElementOutput | undefined;
    const attach = () => {
      if (context.state !== 'running' || output || element.paused || !element.hasAttribute('data-music-audio')) return;
      try {
        output = elementOutput(element);
        if (!output) return;
        selectSpectrumOutput(element);
        output.gain.connect(analyser);
      } catch { /* The browser cannot analyse this recording. */ }
    };
    element.addEventListener('playing', attach);
    context.addEventListener('statechange', attach);
    attach();
    return { context, analyser, active: () => Boolean(output), release() {
      element.removeEventListener('playing', attach);
      context.removeEventListener('statechange', attach);
      // The engine owns the audible connection across visualizer and page changes.
      output?.gain.disconnect(analyser);
    } };
  }

  const stream = element.captureStream();
  const context = new AudioContext();
  const analyser = context.createAnalyser();
  let source: MediaStreamAudioSourceNode | undefined;
  const connect = () => {
    source?.disconnect();
    source = undefined;
    if (stream.getAudioTracks().length) {
      try {
        source = context.createMediaStreamSource(stream);
        source.connect(analyser);
      } catch { /* The captured track may already have ended. */ }
    }
  };
  stream.addEventListener('addtrack', connect);
  stream.addEventListener('removetrack', connect);
  connect();
  void context.resume().catch(() => {});
  return { context, analyser, active: () => Boolean(source && stream.active), release() {
    stream.removeEventListener('addtrack', connect);
    stream.removeEventListener('removetrack', connect);
    source?.disconnect();
    stream.getTracks().forEach(track => track.stop());
    void context.close().catch(() => {});
  } };
}
