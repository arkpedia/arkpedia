import { findBufferedOpening, MAX_INTRO_SECONDS } from './audioOnset';
import { CLIP_SECONDS } from './game';

const FIRST_BYTES = 1024 * 1024;
const MAX_BYTES = 2 * FIRST_BYTES;
const MAX_PCM_BYTES = 12 * FIRST_BYTES;
const LONGEST_CLIP = CLIP_SECONDS[CLIP_SECONDS.length - 1];

/** PCM WAV needs much more data per second than MP3. Read the declared byte
 * rate and data offset, keeping a hard cap even for malformed headers. */
function audioPrefixBudget(bytes: Uint8Array): (opening: number | null) => number {
  const text = (offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length));
  if (text(0, 4) !== 'RIFF' || text(8, 4) !== 'WAVE') return () => MAX_BYTES;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let byteRate = 0;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const size = view.getUint32(offset + 4, true);
    if (text(offset, 4) === 'fmt ' && size >= 16 && offset + 24 <= bytes.length) {
      const format = view.getUint16(offset + 8, true);
      if (![1, 3, 0xfffe].includes(format)) return () => MAX_BYTES;
      byteRate = view.getUint32(offset + 16, true);
    }
    if (text(offset, 4) === 'data' && byteRate > 0) {
      // With no onset yet, include the entire detection window plus the clue.
      return (opening) => Math.max(MAX_BYTES, Math.min(MAX_PCM_BYTES, Math.ceil(offset + 8 + byteRate * ((opening ?? MAX_INTRO_SECONDS) + LONGEST_CLIP + 0.1))));
    }
    offset += 8 + size + size % 2;
  }
  return () => MAX_BYTES;
}

export function nextAudioPrefixSize(bytes: Uint8Array, opening: number | null): number {
  return audioPrefixBudget(bytes)(opening);
}

// A server may ignore Range. Stop reading at the cap in that case as well.
export async function readAudioPrefix(response: Response, cap: number): Promise<Uint8Array<ArrayBuffer>> {
  if (!response.ok || !response.body) throw new Error('Audio unavailable');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < cap) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = value.subarray(0, cap - size);
      chunks.push(chunk); size += chunk.length;
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

/** Best-effort fast path for independently decodable audio prefixes (such as
 * the catalogue's MP3 streams). Some codecs/browsers require complete files:
 * return null then and retain the streamed player instead of fetching a whole song. */
async function decodeOpening(url: string, signal: AbortSignal): Promise<AudioBuffer | null> {
  const decoder = new OfflineAudioContext(2, 1, 44100);
  let cap = FIRST_BYTES;
  for (let attempt = 0; attempt < 2; attempt++) {
    signal.throwIfAborted();
    const response = await fetch(url, { headers: { Range: `bytes=0-${cap - 1}` }, signal });
    const bytes = await readAudioPrefix(response, cap);
    const completeFile = bytes.length < cap;
    // Firefox/Chromium detach the input ArrayBuffer during decode. Retain the
    // tiny header-derived budget first, without copying the entire audio file.
    const nextPrefixSize = audioPrefixBudget(bytes);
    let decoded: AudioBuffer;
    try {
      decoded = await decoder.decodeAudioData(bytes.buffer);
    } catch {
      signal.throwIfAborted();
      return null;
    }
    signal.throwIfAborted();
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i));
    const opening = findBufferedOpening(channels, decoded.sampleRate);
    if (opening === null || (decoded.duration < opening + LONGEST_CLIP && !completeFile)) {
      cap = nextPrefixSize(opening);
      continue;
    }
    const start = Math.round(opening * decoded.sampleRate);
    const length = Math.min(decoded.length - start, Math.round(LONGEST_CLIP * decoded.sampleRate));
    const clip = decoder.createBuffer(decoded.numberOfChannels, length, decoded.sampleRate);
    channels.forEach((channel, i) => clip.copyToChannel(channel.subarray(start, start + length), i));
    return clip;
  }
  return null;
}

/** Preloading is optional. A slow fetch or a decoder waiting for the rest of a
 * partial file must not prevent the user from starting streamed playback. */
export async function prepareClip(url: string, signal: AbortSignal, timeoutMs = 15000): Promise<AudioBuffer | null> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: () => void = () => {};
  const deadline = new Promise<null>((resolve, reject) => {
    abort = () => { controller.abort(); reject(new DOMException('Audio preparation aborted', 'AbortError')); };
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => { resolve(null); controller.abort(); }, timeoutMs);
  });
  try {
    return await Promise.race([deadline, decodeOpening(url, controller.signal)]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
    controller.abort();
  }
}
