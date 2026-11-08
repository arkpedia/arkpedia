type CapturableAudio = HTMLAudioElement & { captureStream?: () => MediaStream };

interface SpectrumInput {
  context: AudioContext;
  analyser: AnalyserNode;
  active: () => boolean;
  release: () => void;
}

let playerContext: AudioContext | undefined;
let speakerSource: MediaElementAudioSourceNode | undefined;
const elementSources = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>();

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

/** A muted standby keeps decoding. Only the active deck may feed Web Audio's speakers. */
export function selectSpectrumOutput(element?: HTMLAudioElement) {
  const next = element && elementSources.get(element);
  if (next === speakerSource) return;
  speakerSource?.disconnect(speakerSource.context.destination);
  speakerSource = undefined;
  if (next) {
    next.connect(next.context.destination);
    speakerSource = next;
  }
}

export function releaseSpectrumElement(element: HTMLAudioElement) {
  if (elementSources.get(element) === speakerSource) selectSpectrumOutput();
  elementSources.delete(element);
}

export function openSpectrumInput(element: CapturableAudio): SpectrumInput | null {
  if (!window.AudioContext) return null;
  if (!element.captureStream) {
    primeSpectrumContext();
    const context = playerContext;
    if (!context) return null;
    const analyser = context.createAnalyser();
    let source: MediaElementAudioSourceNode | undefined;
    const attach = () => {
      if (context.state !== 'running' || source || element.paused || element.muted || !element.hasAttribute('data-music-audio')) return;
      try {
        let output = elementSources.get(element);
        if (!output) {
          // Preserve media playback semantics (including the silent switch) when
          // WebKit moves native media into Web Audio's output.
          const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
          if (session?.type === 'auto') session.type = 'playback';
          output = context.createMediaElementSource(element);
          elementSources.set(element, output);
        }
        selectSpectrumOutput(element);
        output.connect(analyser);
        source = output;
      } catch { /* The browser cannot analyse this recording. */ }
    };
    element.addEventListener('playing', attach);
    context.addEventListener('statechange', attach);
    attach();
    return { context, analyser, active: () => Boolean(source), release() {
      element.removeEventListener('playing', attach);
      context.removeEventListener('statechange', attach);
      // The engine owns the audible connection across visualizer and page changes.
      source?.disconnect(analyser);
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
