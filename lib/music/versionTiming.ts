import type { LyricLine } from './albumsDataServer';
import measuredTimings from '@/config/music-recording-timings.json';

// Recordings compared at 18 points across their shared music, with independent
// spectral checks for differently mastered mixes. See docs/audits/music-timing-2026-11-09.md.
// Each offset is vocal time minus instrumental time, in seconds. Durations are
// only a fallback for a switch made before the other file has supplied metadata.
type RecordingPair = [vocal: string, instrumental: string, offset: number, vocalLength: number, instrumentalLength: number];
const recordings = measuredTimings.pairs as RecordingPair[];

// Each upload has its own clock; a video intro must not move the native recording's
// lyrics or be mistaken for a difference between the vocal and instrumental.
type Upload = [video: string, cid: string, nativeMinusUpload: number, nativeLength: number, uploadLength: number];
const uploads = new Map((measuredTimings.youtubeAliases as Upload[]).map(row => [row[0], row]));

function recording(id: string) {
  const upload = uploads.get(id);
  return { cid: upload?.[1] ?? id.replace(/^msr:/, ''), offset: upload?.[2] ?? 0, duration: upload?.[4] };
}

export function versionTiming(from: string, to: string) {
  const source = recording(from), target = recording(to);
  for (const [vocal, instrumental, offset, vocalLength, instrumentalLength] of recordings) {
    if (source.cid === vocal && target.cid === instrumental) return { offset: source.offset - offset - target.offset, duration: target.duration ?? instrumentalLength };
    if (source.cid === instrumental && target.cid === vocal) return { offset: source.offset + offset - target.offset, duration: target.duration ?? vocalLength };
  }
  return { offset: 0, duration: Infinity };
}

// Each section of Speed of Light’s short MSR edit was matched against the full
// recording. Repeated backing sections use the corresponding refrain as a guide.
const shortEditSections = [
  { start: 0, end: 42.2, offset: 8.8392 },
  { start: 42.2, end: 59.18, offset: 163.1262 },
  { start: 59.18, end: 76.5, offset: 145.9832 },
  { start: 76.5, end: 85.627, offset: 137.412 },
];

/** Project borrowed vocal cues onto the recording’s own clock, including lyric seeks. */
export function instrumentalLyricLines(lines: LyricLine[], track: string, ownClock = false): LyricLine[] {
  const { cid: id, offset: uploadOffset } = recording(track);
  const pair = recordings.find(([, instrumental]) => instrumental === id);
  if (!lines.some(line => line.time > 0)) return lines;
  const borrowed = !ownClock && Boolean(pair || id === '125012');
  if (!borrowed && !uploadOffset) return lines;
  const sections = borrowed ? pair ? [{ start: 0, end: pair[4], offset: pair[2] }] : shortEditSections : [{ start: 0, end: Infinity, offset: 0 }];
  return sections.flatMap(({ start, end, offset }) => lines.flatMap(line => {
    const time = line.time - offset;
    if (time < start || time >= end) return [];
    return [{ ...line, time: Math.max(0, time - uploadOffset) }];
  }));
}
