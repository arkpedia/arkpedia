import { setSetting } from '@/lib/settings/siteSettings';
import { useSiteSetting } from '@/lib/settings/useSiteSetting';
import { useEffect, useId, useRef } from 'react';
import type { EngineKind } from '@/lib/music/playbackEngine';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { openSpectrumInput, primeSpectrumContext } from '@/lib/music/spectrumInput';

const bands = 48;
const lowHz = 62.5;
const highHz = 16000;
const plotHeight = 48;

interface SpectrumProps { playing: boolean; engine: EngineKind; trackId: string }

function Spectrum({ playing, engine, trackId }: SpectrumProps) {
  const gradient = useId();
  const svg = useRef<SVGSVGElement>(null);
  const trace = useRef<SVGPathElement>(null);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  useEffect(() => {
    const element = document.querySelector<HTMLAudioElement>('audio[data-music-audio]');
    const graph = svg.current;
    const path = trace.current;
    if (!playing || engine !== 'msr' || reducedMotion || !element || !graph || !path) return;
    let input: ReturnType<typeof openSpectrumInput>;
    try { input = openSpectrumInput(element); } catch { return; }
    if (!input) return;
    const { analyser, context: audio, active, release } = input;
    let frame = 0;
    analyser.fftSize = 8192;
    analyser.minDecibels = -90;
    analyser.maxDecibels = -18;
    analyser.smoothingTimeConstant = 0.68;
    const samples = new Uint8Array(analyser.frequencyBinCount);
    const binHz = audio.sampleRate / analyser.fftSize;
    const edges = Array.from({ length: bands + 1 }, (_, i) =>
      Math.min(samples.length, Math.ceil(lowHz * (highHz / lowHz) ** (i / bands) / binHz)));

    let lastFrame = -100;
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (now - lastFrame < 40) return;
      lastFrame = now;
      if (audio.state !== 'running' || !active()) {
        graph.removeAttribute('data-live');
        return;
      }
      analyser.getByteFrequencyData(samples);
      const bars = [];
      for (let i = 0; i < bands; i++) {
        let peak = 0;
        for (let bin = edges[i]; bin < edges[i + 1]; bin++) peak = Math.max(peak, samples[bin]);
        const height = (peak / 255 * plotHeight).toFixed(1);
        bars.push(`M${i * 10 + 1} ${plotHeight}v-${height}h8v${height}Z`);
      }
      path.setAttribute('d', bars.join(''));
      graph.setAttribute('data-live', '');
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      release();
      path.removeAttribute('d');
      graph.removeAttribute('data-live');
    };
  }, [engine, playing, reducedMotion, trackId]);

  const status = !playing ? 'Paused' : reducedMotion ? 'Reduced motion' : engine === 'youtube' ? 'Spectrum unavailable for YouTube playback' : 'Live spectrum unavailable';
  return (
    <>
      <span className="music-spectrum-plot">
        <svg ref={svg} viewBox={`0 0 ${bands * 10} ${plotHeight}`} preserveAspectRatio="none" className="music-wave-svg" aria-hidden="true">
          <defs>
            <linearGradient id={gradient} gradientUnits="userSpaceOnUse" x2={bands * 10}>
              <stop stopColor="var(--rarity-3)" />
              <stop offset="25%" stopColor="var(--rarity-3)" />
              <stop offset="25%" stopColor="var(--teal)" />
              <stop offset="75%" stopColor="var(--teal)" />
              <stop offset="75%" stopColor="var(--amber)" />
              <stop offset="100%" stopColor="var(--amber)" />
            </linearGradient>
          </defs>
          <path className="music-spectrum-grid" d="M0 0.5H480 M0 24H480 M0 47.5H480 M120 0V48 M240 0V48 M360 0V48" />
          <path ref={trace} className="music-wave-live" fill={`url(#${gradient})`} />
          <path d="M0 47.5H480" stroke={`url(#${gradient})`} />
        </svg>
        <span className="music-spectrum-status">{status}</span>
      </span>
      <span className="music-spectrum-axis" aria-hidden="true">
        <span>62.5 Hz</span><span>250 Hz</span><span>1 kHz</span><span>4 kHz</span><span>16 kHz</span>
      </span>
    </>
  );
}

function OriginalWaves({ volume }: { volume: number }) {
  const amplitude = 0.15 + (Math.max(0, Math.min(100, volume)) / 100) * 0.85;
  const amplitudeTransform = `translate(0, 20) scale(1, ${amplitude}) translate(0, -20)`;

  return (
    <svg viewBox="0 0 200 40" preserveAspectRatio="none" className="music-original-waves" aria-hidden="true">
      <g transform={amplitudeTransform}>
        <path
          className="music-wave"
          d="M-200,20 Q-175,6 -150,20 T-100,20 T-50,20 T0,20 T50,20 T100,20 T150,20 T200,20 T250,20 T300,20 T350,20 T400,20"
          fill="none"
        />
        <path
          className="music-wave music-wave-2"
          d="M-200,22 Q-175,34 -150,22 T-100,22 T-50,22 T0,22 T50,22 T100,22 T150,22 T200,22 T250,22 T300,22 T350,22 T400,22"
          fill="none"
        />
        <path
          className="music-wave music-wave-3"
          d="M-200,18 Q-175,10 -150,18 T-100,18 T-50,18 T0,18 T50,18 T100,18 T150,18 T200,18 T250,18 T300,18 T350,18 T400,18"
          fill="none"
        />
      </g>
    </svg>
  );
}

export default function MusicWaveVisualizer({ volume, ...spectrum }: SpectrumProps & { volume: number }) {
  const descriptionId = useId();
  const mode = useSiteSetting('musicVisualizer');
  const waves = mode === 'waves';
  const action = waves ? 'Switch to frequency spectrum' : 'Switch to original waves';
  const description = waves ? 'Original decorative waves.' : 'Bass from 62.5 to 250 Hz, mids to 4 kHz and highs to 16 kHz. Height shows signal level from −90 to −18 dB.';
  return <button type="button" className="btn-bare music-wave-visualizer" data-playing={spectrum.playing}
    aria-label={action} aria-describedby={descriptionId} title={description + ' ' + action}
    onClick={() => {
      if (waves && spectrum.engine === 'msr') primeSpectrumContext();
      setSetting('musicVisualizer', waves ? 'spectrum' : 'waves');
    }}>
    <span id={descriptionId} className="visually-hidden">{description}</span>
    {waves ? <OriginalWaves volume={volume} /> : <Spectrum {...spectrum} />}
    <span className="music-visualizer-switch" aria-hidden="true">⇄</span>
  </button>;
}
