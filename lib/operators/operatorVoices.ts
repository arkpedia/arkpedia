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

/** One set of lines and the recordings of them: an operator's own, or an outfit's. */
export interface OperatorVoiceSet {
  textLocale: 'en' | 'zh-CN';
  lines: OperatorVoiceLine[];
  packs: OperatorVoicePack[];
}

/**
 * An outfit's own voice set (scripts/build/build-operator-voices.mjs): the game plays it
 * instead of the operator's while the outfit is worn. Its own text, or the same text
 * recorded again (Mudrock's outfits, Luo Xiaohei's Elite 2 art); its packs read the
 * folder named after `id`, the set's word key in the game's tables.
 */
export interface OperatorSkinVoiceSet extends OperatorVoiceSet {
  id: string;
  /** The outfits that use it, by name: "Red Countess", or every one sharing it. */
  label: string;
  skinIds: string[];
}

export interface OperatorVoiceData extends OperatorVoiceSet {
  /** Present only when an outfit has a voice set of its own; in the skin table's order. */
  skinVoices?: OperatorSkinVoiceSet[];
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
