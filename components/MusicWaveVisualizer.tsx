// Purely decorative -- not actually audio-reactive (no frequency
// analysis feeds it), just a synth/equalizer-style visual flourish
// sitting under the lyrics, only shown while something's actually
// playing (see pages/music/index.tsx, which conditionally renders
// this).
//
// Each wave path is a repeating Q+T curve pair -- one full up-down
// cycle spans 100 units (50 for the Q up-curve, 50 for the reflected
// T down-curve), NOT 50. Animating translateX by only half that
// period was the actual cause of the visible "jump" at the loop
// boundary: it showed a phase-shifted version of the wave rather than
// a true repeat, so the shape at the end of one loop didn't match the
// shape at the start of the next. Shifting by the full 100-unit
// period (see the CSS keyframe) is what makes the scroll genuinely
// seamless.
//
// Amplitude scales with the user's volume setting via an explicit SVG
// transform (translate-scale-translate, pivoting exactly at the y=20
// baseline) rather than CSS transform-origin/transform-box, which has
// enough cross-browser inconsistency for SVG group elements to not be
// worth the risk here.
export default function MusicWaveVisualizer({ volume, className = '' }: { volume: number; className?: string }) {
  // Never fully flat even at volume 0 -- just a subtle line, not
  // nothing -- but scales up to a full swing by volume 100.
  const amplitude = 0.15 + (Math.max(0, Math.min(100, volume)) / 100) * 0.85;
  const amplitudeTransform = `translate(0, 20) scale(1, ${amplitude}) translate(0, -20)`;

  return (
    <div className={`music-wave-visualizer${className ? ` ${className}` : ''}`} aria-hidden="true">
      <svg viewBox="0 0 200 40" preserveAspectRatio="none" className="music-wave-svg">
        <g transform={amplitudeTransform}>
          <path
            className="music-wave music-wave-1"
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
    </div>
  );
}