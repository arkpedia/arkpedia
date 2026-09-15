import { useCallback, useEffect, useRef, useState } from 'react';
import { connectMusicBalance } from './audioBalance';
import { AudioOnsetDetector, MAX_INTRO_SECONDS } from './audioOnset';
import { clampClipPosition, randomClipStart } from './game';
import type { ClipStartPosition } from './game';
import type { SongClipCache } from './songClipCache';

interface AudioGraph {
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  analyser: AnalyserNode;
  gain: GainNode;
  samples: Float32Array<ArrayBuffer>;
}

function createAudioGraph(audio: HTMLAudioElement): AudioGraph {
  const context = new AudioContext();
  const source = context.createMediaElementSource(audio);
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  const gain = context.createGain();
  gain.gain.value = 0;
  source.connect(analyser);
  connectMusicBalance(context, analyser, gain);
  gain.connect(context.destination);
  return { context, source, analyser, gain, samples: new Float32Array(analyser.fftSize) };
}

export function useSongClip(songId: string | undefined, seconds: number, volume: number, cache: SongClipCache, randomPoint: number | null = null, startPosition: ClipStartPosition = 'beginning') {
  const position = useRef(0);
  const bufferClock = useRef<{ started: number; offset: number; duration: number } | null>(null);
  const prepared = useRef<AudioBuffer | null>(null);
  const bufferSource = useRef<AudioBufferSourceNode | null>(null);
  const graphRef = useRef<AudioGraph | null>(null);
  const onset = useRef<number | null>(null);
  const detector = useRef(new AudioOnsetDetector());
  const phase = useRef<'idle' | 'finding' | 'clip'>('idle');
  const volumeRef = useRef(volume);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frame = useRef<number>(0);
  const limit = useRef(seconds);
  const wantsPlayback = useRef(false);
  const playRequest = useRef(0);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'finding' | 'playing' | 'error'>('loading');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [sourceStart, setSourceStart] = useState<number | null>(null);

  const playableDuration = useCallback((requested = limit.current) => {
    const available = prepared.current?.duration ?? (onset.current !== null && Number.isFinite(audioRef.current?.duration)
      ? Math.max(0, audioRef.current!.duration - onset.current) : requested);
    return Math.min(requested, available);
  }, []);

  const stop = useCallback(() => {
    const clock = bufferClock.current;
    if (clock && graphRef.current) position.current = clampClipPosition(clock.offset + graphRef.current.context.currentTime - clock.started, clock.duration);
    else if (phase.current === 'clip' && onset.current !== null && audioRef.current) position.current = clampClipPosition(audioRef.current.currentTime - onset.current, playableDuration());
    setProgress(position.current / (playableDuration() || 1));
    bufferClock.current = null;
    playRequest.current += 1;
    wantsPlayback.current = false;
    phase.current = 'idle';
    if (bufferSource.current) {
      bufferSource.current.onended = null;
      bufferSource.current.stop(); bufferSource.current.disconnect(); bufferSource.current = null;
    }
    if (graphRef.current) graphRef.current.gain.gain.value = 0;
    if (stopTimer.current) clearTimeout(stopTimer.current);
    cancelAnimationFrame(frame.current);
    audioRef.current?.pause();
    setState((current) => current === 'playing' || current === 'finding' ? 'ready' : current);
  }, [playableDuration]);

  useEffect(() => { stop(); limit.current = seconds; position.current = 0; setProgress(0); }, [seconds, stop]);

  useEffect(() => {
    if (!songId) return;
    const audio = new Audio();
    audio.preload = 'metadata';
    prepared.current = null;
    audio.crossOrigin = 'anonymous';
    audio.volume = 1;
    onset.current = null; setSourceStart(null);
    audioRef.current = audio;
    let disposed = false;

    position.current = 0; setState('loading'); setError(''); setProgress(0);
    const fail = () => {
      if (disposed) return;
      stop(); setState('error'); setError('Audio could not load. Retry, or try another song without using a guess.');
    };
    const metadata = () => {
      if (disposed || randomPoint === null || onset.current !== null) return;
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) { fail(); return; }
      onset.current = randomClipStart(audio.duration, randomPoint, startPosition === 'middle' ? 'middle' : 'random');
      setSourceStart(onset.current);
      audio.currentTime = onset.current + position.current;
      if (wantsPlayback.current) phase.current = 'clip';
    };
    const ready = () => { if (!disposed) setState('ready'); };
    const pause = () => {
      if (graphRef.current) graphRef.current.gain.gain.value = 0;
      if (stopTimer.current) clearTimeout(stopTimer.current);
      cancelAnimationFrame(frame.current);
    };
    const playing = () => {
      if (disposed || !wantsPlayback.current) { audio.pause(); return; }
      if (audio.seeking) return;
      const graph = graphRef.current;
      if (!graph) return;
      if (randomPoint !== null && onset.current === null) { metadata(); if (onset.current === null) return; }
      if (phase.current === 'finding') {
        setState('finding');
        const findOpening = () => {
          if (disposed || !wantsPlayback.current || phase.current !== 'finding') return;
          graph.analyser.getFloatTimeDomainData(graph.samples);
          const start = detector.current.inspect(graph.samples, audio.currentTime);
          if (start !== null) {
            onset.current = start; setSourceStart(start);
            audio.pause();
            audio.currentTime = start + position.current;
            phase.current = 'clip';
            const request = playRequest.current;
            void audio.play().catch(() => { if (!disposed && request === playRequest.current) fail(); });
          } else if (audio.currentTime >= MAX_INTRO_SECONDS) {
            stop(); setState('error');
            setError('No audible opening found. Retry, or try another song without using a guess.');
          } else frame.current = requestAnimationFrame(findOpening);
        };
        cancelAnimationFrame(frame.current); findOpening();
        return;
      }
      if (phase.current !== 'clip') return;
      setState('playing');
      // Count only audio after the chosen starting point, using the media clock
      // so buffering cannot consume the clue. Replays share this same offset.
      const elapsed = () => Math.max(0, audio.currentTime - (onset.current || 0));
      if (stopTimer.current) clearTimeout(stopTimer.current);
      const checkBoundary = () => {
        if (!wantsPlayback.current || disposed) return;
        const remaining = playableDuration() - elapsed();
        if (remaining <= 0) { stop(); setProgress(1); }
        else {
          // Some decoders briefly report/replay position zero after a seek.
          // Keep that pre-roll silent until the media clock reaches the opening.
          graph.gain.gain.value = audio.currentTime >= (onset.current || 0) ? volumeRef.current / 100 : 0;
          stopTimer.current = setTimeout(checkBoundary, Math.max(4, Math.min(25, remaining * 1000)));
        }
      };
      checkBoundary();
      const tick = () => {
        position.current = clampClipPosition(elapsed(), playableDuration());
        setProgress(position.current / (playableDuration() || 1));
        if (elapsed() >= playableDuration()) { stop(); setProgress(1); }
        else frame.current = requestAnimationFrame(tick);
      };
      cancelAnimationFrame(frame.current); tick();
    };
    audio.addEventListener('loadedmetadata', metadata);
    audio.addEventListener('playing', playing);
    audio.addEventListener('waiting', pause);
    audio.addEventListener('pause', pause);
    audio.addEventListener('seeking', pause);
    const seeked = () => { if (!audio.paused && wantsPlayback.current) playing(); };
    audio.addEventListener('seeked', seeked);
    audio.addEventListener('error', fail);
    const ended = () => { if (onset.current === null) fail(); else stop(); };
    audio.addEventListener('ended', ended);
    const visibility = () => { if (document.hidden) { wantsPlayback.current = false; stop(); } };
    document.addEventListener('visibilitychange', visibility);
    cache.load(songId)
      .then(({ url, buffer }) => {
        if (disposed) return;
        if (buffer && randomPoint === null) {
          prepared.current = buffer;
          onset.current = 0; setSourceStart(0);
        } else {
          audio.src = url; audio.load();
        }
        // Create/resume the output graph only inside Play's user gesture. A
        // streamed source is ready to start even if Safari has not preloaded it.
        ready();
      }).catch(() => { if (!disposed) fail(); });
    return () => {
      disposed = true; stop(); prepared.current = null;
      if (stopTimer.current) clearTimeout(stopTimer.current);
      cancelAnimationFrame(frame.current);
      document.removeEventListener('visibilitychange', visibility);
      audio.removeEventListener('loadedmetadata', metadata);
      audio.removeEventListener('error', fail); audio.removeEventListener('ended', ended);
      audio.pause(); audio.removeAttribute('src'); audio.load(); audioRef.current = null;
      const graph = graphRef.current;
      graphRef.current = null;
      if (graph) { graph.gain.gain.value = 0; graph.source.disconnect(); void graph.context.close(); }
    };
  }, [songId, revision, stop, cache, playableDuration, randomPoint, startPosition]);

  useEffect(() => {
    volumeRef.current = volume;
    if (graphRef.current && phase.current === 'clip' && !audioRef.current?.seeking && (audioRef.current?.currentTime || 0) >= (onset.current || 0)) {
      graphRef.current.gain.gain.value = volume / 100;
    }
  }, [volume]);

  async function play(from?: number) {
    const audio = audioRef.current;
    if (!audio || state === 'loading' || state === 'error') return;
    stop(); setError('');
    const duration = playableDuration();
    const offset = clampClipPosition(from ?? (position.current >= duration ? 0 : position.current), duration);
    position.current = offset; setProgress(offset / (duration || 1));
    if (offset >= duration) return;
    const request = playRequest.current;
    try {
      let graph = graphRef.current;
      if (!graph) {
        graph = createAudioGraph(audio);
        graphRef.current = graph;
      }
      if (prepared.current) {
        const source = graph.context.createBufferSource();
        source.buffer = prepared.current;
        source.connect(graph.analyser);
        bufferSource.current = source;
        phase.current = 'clip';
        wantsPlayback.current = true;
        graph.gain.gain.value = volumeRef.current / 100;
        const context = graph.context;
        const resumed = context.resume();
        const started = context.currentTime;
        bufferClock.current = { started, offset, duration };
        source.onended = () => { if (request === playRequest.current) { stop(); setProgress(1); } };
        source.start(0, offset, duration - offset);
        setState('playing');
        const tick = () => {
          if (request !== playRequest.current) return;
          position.current = clampClipPosition(offset + context.currentTime - started, duration);
          setProgress(position.current / duration);
          frame.current = requestAnimationFrame(tick);
        };
        tick();
        await resumed;
        return;
      }
      detector.current = new AudioOnsetDetector();
      phase.current = onset.current === null ? 'finding' : 'clip';
      if (audio.readyState > 0) audio.currentTime = (onset.current || 0) + offset;
      wantsPlayback.current = true;
      if (phase.current === 'finding') setState('finding');
      // Both requests start in the user's gesture, including on mobile Safari.
      await Promise.all([graph.context.resume(), audio.play()]);
    } catch {
      if (audio !== audioRef.current || request !== playRequest.current) return;
      stop(); setError('Playback was interrupted. Press Play clip to try again.');
    }
  }

  function seek(value: number) {
    if (onset.current === null || state === 'loading' || state === 'finding' || state === 'error') return;
    const resume = wantsPlayback.current;
    stop();
    const duration = playableDuration();
    position.current = clampClipPosition(value, duration);
    setProgress(position.current / (duration || 1));
    if (resume && position.current < duration) void play(position.current);
  }

  return { state, error, progress, play, stop, seek, sourceStart, duration: playableDuration(seconds), canSeek: onset.current !== null && (state === 'ready' || state === 'playing'), retry: () => {
    if (songId) cache.remove(songId);
    setRevision((v) => v + 1);
  } };
}
