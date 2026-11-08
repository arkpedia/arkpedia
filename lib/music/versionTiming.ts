import type { LyricLine } from './albumsDataServer';

// Monster Siren recordings compared at 18 points across their shared music.
// Each offset is vocal time minus instrumental time, in seconds. Durations are
// only a fallback for a switch made before the other file has supplied metadata.
type RecordingPair = [vocal: string, instrumental: string, offset: number, vocalLength: number, instrumentalLength: number];
const recordings: RecordingPair[] = [
  ['461129', '306884', 14.6255, 221.683, 206.500], // Still the Same
  ['779468', '048776', 7.863, 212.177, 204.315], // Paper Boat
  ['048753', '125025', 0, 170.526, 156.842], // Тонкий снег
  ['232244', '953967', 0.00775, 212.008, 207.894], // Nightmare's Descent
  ['125061', '514532', -0.68725, 225, 224], // ONE BY ONE
  ['697628', '461156', -0.032, 218.897, 216.253], // Mortal Eye
  ['514569', '953904', 0.3415, 185.723, 184.570], // Snowy Night
  ['697641', '461172', 0.02825, 211.877, 211.772], // Thorns In You
  ['048735', '306841', 0.17725, 243.796, 243.620], // Spark for Dream
  ['779439', '461194', 0.11125, 249.248, 249.101], // Immutable
  ['125014', '514588', -0.07275, 270.580, 270.128], // Lullabye
  ['125093', '461175', -0.12075, 253.829, 253.810], // A Long Vacation
  ['306852', '880377', 0.24, 252.560, 249.514], // ALIVE
  ['697661', '697669', 0.229, 251.496, 250.420], // Rock the Night Away (spectral timing)
  ['880317', '514528', 0, 252.087, 251.475], // Sailing For
  ['461182', '232299', 0, 247.421, 246.911], // Awaken
  ['125000', '306842', 0.00775, 222.343, 222.335], // Melting White
  ['048736', '461183', 0.00775, 204.962, 204.954], // 随意随意呀
];

// Data Saver uploads independently matched to their Monster Siren recordings.
const youtubeToMsr: Record<string, string> = {
  DxMj5INKYQA: '461129', '1JJDnq2EVuc': '306884',
  '2Qul6EjQmYc': '779468', 'klxYxU_4c-k': '048776',
  lR7kZ2xwofI: '125012',
};

export function versionTiming(from: string, to: string) {
  from = youtubeToMsr[from] ?? from;
  to = youtubeToMsr[to] ?? to;
  for (const [vocal, instrumental, offset, vocalLength, instrumentalLength] of recordings) {
    if (from === vocal && to === instrumental) return { offset: -offset, duration: instrumentalLength };
    if (from === instrumental && to === vocal) return { offset, duration: vocalLength };
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
export function instrumentalLyricLines(lines: LyricLine[], recording: string): LyricLine[] {
  const id = youtubeToMsr[recording] ?? recording;
  const pair = recordings.find(([, instrumental]) => instrumental === id);
  if ((!pair && id !== '125012') || !lines.some(line => line.time > 0)) return lines;
  const sections = pair ? [{ start: 0, end: pair[4], offset: pair[2] }] : shortEditSections;
  return sections.flatMap(({ start, end, offset }) => lines.flatMap(line => {
    const time = line.time - offset;
    if (time < start || time >= end) return [];
    // The short YouTube upload has a further 89.5 ms of leading audio.
    return [{ ...line, time: recording === 'lR7kZ2xwofI' ? time + 0.0895 : time }];
  }));
}
