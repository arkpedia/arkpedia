import type { OperatorVoiceData } from './operatorVoices';
import { clipUrl, hasRecording, preferredRecordingPack } from './voiceRecording.mjs';

export interface ChibiVoiceClip { id: string; title: string; url: string }
export interface ChibiTapVoices { tap?: ChibiVoiceClip; trust?: ChibiVoiceClip }

/** Use the selected outfit's recordings, including shared sets such as Mudrock's. */
export function chibiTapVoices(data: OperatorVoiceData | null | undefined, appearance: string): ChibiTapVoices {
  const set = data?.skinVoices?.find(set => set.label === appearance || set.label.split(', ').includes(appearance)) ?? data;
  if (!set) return {};
  const pack = preferredRecordingPack(set.packs.filter(pack => pack.status === 'current'));
  const clip = (id: string) => {
    const line = set.lines.find(line => line.id === id && line.status === 'current');
    const url = pack && line && hasRecording(line, pack) ? clipUrl(pack.audioTemplate, id) : null;
    return url && line ? { id, title: line.title, url } : undefined;
  };
  return { tap: clip('CN_034'), trust: clip('CN_036') };
}
