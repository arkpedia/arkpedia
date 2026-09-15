// About -44 dB RMS. Ignore digital silence, low-level noise and isolated clicks,
// but retain quiet musical openings. Inspect before the user's volume control.
const MIN_RMS = 0.006;
const SUSTAIN_SECONDS = 0.04;
export const MAX_INTRO_SECONDS = 20;

export class AudioOnsetDetector {
  private candidate: number | null = null;

  inspect(samples: Float32Array, time: number): number | null {
    let energy = 0;
    for (const sample of samples) energy += sample * sample;
    const rms = samples.length ? Math.sqrt(energy / samples.length) : 0;
    if (rms < MIN_RMS) {
      this.candidate = null;
      return null;
    }
    if (this.candidate === null) this.candidate = time;
    return time - this.candidate >= SUSTAIN_SECONDS ? this.candidate : null;
  }
}

/** Scan decoded PCM without playing it. Check channels independently so a
 * stereo signal cannot cancel itself out when locating the opening. */
export function findBufferedOpening(channels: Float32Array[], sampleRate: number): number | null {
  const detectors = channels.map(() => new AudioOnsetDetector());
  const windowSize = Math.max(1, Math.round(sampleRate * 0.01));
  const length = Math.min(channels[0]?.length || 0, Math.floor(MAX_INTRO_SECONDS * sampleRate));
  for (let offset = 0; offset + windowSize <= length; offset += windowSize) {
    for (let channel = 0; channel < channels.length; channel++) {
      const opening = detectors[channel].inspect(channels[channel].subarray(offset, offset + windowSize), offset / sampleRate);
      if (opening !== null) return opening;
    }
  }
  return null;
}
