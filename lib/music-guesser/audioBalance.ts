/** Moderate, always-on leveling for differently mastered recordings. Keep the
 * user's volume after this stage so turning it down never changes compression.
 * Web Audio adds automatic makeup gain: the output trim compensates for it
 * and leaves headroom rather than amplifying quiet intros/noise.
 * https://www.w3.org/TR/webaudio-1.0/#computing-the-makeup-gain */
export const MUSIC_BALANCE = {
  threshold: -28,
  knee: 12,
  ratio: 6,
  attack: 0.003,
  release: 0.25,
  outputGain: 0.2,
} as const;

export function connectMusicBalance(context: BaseAudioContext, input: AudioNode, output: AudioNode) {
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = MUSIC_BALANCE.threshold;
  compressor.knee.value = MUSIC_BALANCE.knee;
  compressor.ratio.value = MUSIC_BALANCE.ratio;
  compressor.attack.value = MUSIC_BALANCE.attack;
  compressor.release.value = MUSIC_BALANCE.release;
  const headroom = context.createGain();
  headroom.gain.value = MUSIC_BALANCE.outputGain;
  input.connect(compressor);
  compressor.connect(headroom);
  headroom.connect(output);
}
