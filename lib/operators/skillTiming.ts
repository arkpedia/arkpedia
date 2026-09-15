import type { Skill, SkillLevel } from './operatorTypes';

export type SkillTiming = { kind: 'duration' | 'effect' | 'instant' | 'ammo'; seconds?: number };

export function getSkillTiming(level: SkillLevel | undefined, skill: Skill | undefined, timing?: SkillTiming | null): { label: string; value: string } {
  const raw = String(level?.duration ?? skill?.duration ?? '').trim();
  // Preserve curated infinite/passive durations; a -1 game duration alone is ambiguous.
  if (/∞|infinite|unlimited/i.test(raw)) return { label: 'Duration', value: '∞' };
  if (raw && Number.isFinite(Number(raw)) && Number(raw) > 0) return { label: 'Duration', value: `${Number(raw)}s` };
  if (/(?:unlimited|infinite|indefinite) duration|lasts indefinitely/i.test(level?.description ?? '')) return { label: 'Duration', value: '∞' };
  if (/passive/i.test(skill?.activationType ?? '')) return { label: 'Duration', value: 'Passive' };
  if (timing?.kind === 'effect') return { label: 'Target effect', value: `${timing.seconds}s` };
  if (timing?.kind === 'duration') return { label: 'Duration', value: `${timing.seconds}s` };
  if (timing?.kind === 'ammo') return { label: 'Duration', value: 'Ammo-based' };
  if (timing?.kind === 'instant') return { label: 'Duration', value: 'Instant' };
  return { label: 'Duration', value: raw && !/^[–—-]$/.test(raw) ? raw : '—' };
}
