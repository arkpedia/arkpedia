import type { OperatorVoiceData } from '../operators/operatorVoices';
import { clipUrl, hasRecording } from '../operators/voiceRecording.mjs';
import type { ArtworkVoice } from './dynamicPlayback';

export interface ArtworkVoicePack {
  id: string;
  label: string;
  voices: ArtworkVoice[];
}

/** Outfit recordings take precedence; only outfits without a voice set use the base lines. */
export function artworkVoicePacks(data: OperatorVoiceData | null | undefined, skinId: string): ArtworkVoicePack[] {
  const set = data?.skinVoices?.find(s => s.skinIds.includes(skinId)) ?? data;
  return set?.packs.filter(pack => pack.status === 'current').map(pack => ({
    id: pack.id,
    label: pack.label,
    voices: set.lines.filter(line => hasRecording(line, pack)).map(line => ({
      id: line.id, title: line.title, url: clipUrl(pack.audioTemplate, line.id)!,
    })),
  })).filter(pack => pack.voices.length > 0) ?? [];
}

export function artworkVoicePack(packs: ArtworkVoicePack[], language: string): ArtworkVoicePack | undefined {
  return packs.find(pack => pack.id === language) ?? packs.find(pack => pack.id === 'cn') ?? packs[0];
}
