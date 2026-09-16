import { pinAssetUrl } from '@/lib/assets/revisions';
import VOICE_DATA from '@/data/operator-voice-lines.json';

export type OperatorVoiceCategory = 'profile' | 'combat' | 'special' | 'unused';
export type OperatorVoiceStatus = 'current' | 'legacy' | 'unused';

export interface OperatorVoiceLine {
  id: string;
  title: string;
  text: string | null;
  category: OperatorVoiceCategory;
  status: OperatorVoiceStatus;
  unlock: string | null;
  order: number;
  /** Present when an orphan recording only exists in specific language packs. */
  availablePacks?: string[];
}

export interface OperatorVoicePack {
  id: string;
  label: string;
  actors: string[];
  status: 'current' | 'legacy';
  audioTemplate: string | null;
}

export interface OperatorVoiceData {
  textLocale: 'en' | 'zh-CN';
  lines: OperatorVoiceLine[];
  packs: OperatorVoicePack[];
}

const OPERATORS = Object.fromEntries(Object.entries(VOICE_DATA.operators as Record<string, OperatorVoiceData>)
  .map(([id, operator]) => [id, { ...operator, packs: operator.packs.map(pack => ({
    ...pack, audioTemplate: pack.audioTemplate ? pinAssetUrl(pack.audioTemplate) : null,
  })) }])) as Record<string, OperatorVoiceData>;

export function getOperatorVoiceData(internalName: string | null | undefined): OperatorVoiceData | null {
  return internalName ? OPERATORS[internalName] ?? null : null;
}
