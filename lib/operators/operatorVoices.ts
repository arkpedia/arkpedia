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

// Keep templates independent of asset revisions. Playback resolves them against
// the page's content release, so an asset refresh does not rewrite every operator.
const OPERATORS = VOICE_DATA.operators as Record<string, OperatorVoiceData>;

export function getOperatorVoiceData(internalName: string | null | undefined): OperatorVoiceData | null {
  return internalName ? OPERATORS[internalName] ?? null : null;
}

/** Current credits are generated with the voice-line catalogue. The copy in an
 * operator's scraped record predates that pipeline and is fallback data only. */
export function getCurrentOperatorVoiceCredits(
  internalName: string | null | undefined,
  fallback: Record<string, string> | null | undefined = null,
): Record<string, string> | null | undefined {
  const voice = getOperatorVoiceData(internalName);
  if (!voice) return fallback;
  const credits: Record<string, string> = {};
  for (const pack of voice.packs) {
    if (pack.status !== 'current' || !pack.actors.length) continue;
    const language = pack.id === 'cn' ? 'Chinese' : pack.label;
    credits[language] = pack.actors.join(' / ');
  }
  return Object.keys(credits).length ? credits : fallback;
}
