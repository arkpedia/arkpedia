import type { OperatorVoiceData } from './operatorVoices';
import { clipUrl, hasRecording, preferredRecordingPack } from './voiceRecording.mjs';

export interface ChibiVoiceClip { id: string; title: string; url: string }
export interface ChibiVoiceLanguage { id: string; label: string; tap?: ChibiVoiceClip; trust?: ChibiVoiceClip }
export interface ChibiTapVoices { tap?: ChibiVoiceClip; trust?: ChibiVoiceClip; languages?: ChibiVoiceLanguage[] }

/** Use the selected outfit's recordings, including shared sets such as Mudrock's. */
export function chibiTapVoices(data: OperatorVoiceData | null | undefined, appearance: string): ChibiTapVoices {
  const set = data?.skinVoices?.find(set => set.label === appearance || set.label.split(', ').includes(appearance)) ?? data;
  if (!set) return {};
  const pack = preferredRecordingPack(set.packs.filter(pack => pack.status === 'current'));
  const clip = (id: string, recordingPack = pack) => {
    const line = set.lines.find(line => line.id === id && line.status === 'current');
    const url = recordingPack && line && hasRecording(line, recordingPack) ? clipUrl(recordingPack.audioTemplate, id) : null;
    return url && line ? { id, title: line.title, url } : undefined;
  };
  const languages = set.packs.filter(pack => pack.status === 'current').map(pack => ({
    id: pack.id, label: pack.label, tap: clip('CN_034', pack), trust: clip('CN_036', pack),
  })).filter(language => language.tap || language.trust);
  return { tap: clip('CN_034'), trust: clip('CN_036'), ...(languages.length ? { languages } : {}) };
}

/** Resolve every language before a walking chibi leaves its content page. */
export function resolveChibiVoices(voices: ChibiTapVoices | undefined, resolve: (url: string) => string): ChibiTapVoices | undefined {
  if (!voices) return undefined;
  const clip = (value?: ChibiVoiceClip) => value ? { ...value, url: resolve(value.url) } : undefined;
  return { tap: clip(voices.tap), trust: clip(voices.trust), languages: voices.languages?.map(language => ({ ...language, tap: clip(language.tap), trust: clip(language.trust) })) };
}
