import Image from '@/components/content/ContentImage';

/** Where a technique or synergy comes from on an operator: a badge of either page. */
export interface SourceBadge {
  label: string;
  skillIconPath: string | null;
  talentLabel: string | null;
  skillNumber?: number;
}

export type SourceKind = 'skill' | 'talent' | 'trait' | 'module';

/** A skill badge carries no talentLabel; talents are "T1".."T3", the trait is "Trait", and
 *  anything else is a module's letter (lib/techniques/buildTechniqueGroups.ts). */
export function sourceKind(badge: SourceBadge): SourceKind {
  if (badge.talentLabel === null) return 'skill';
  if (/^T\d+$/.test(badge.talentLabel)) return 'talent';
  if (badge.talentLabel === 'Trait') return 'trait';
  return 'module';
}

/** "S2 · Skill name", "Talent 1", "Trait", "Module DEA-Y (Stage 3)". */
export function sourceName(badge: SourceBadge): string {
  const kind = sourceKind(badge);
  if (kind === 'skill') return badge.skillNumber ? `S${badge.skillNumber} · ${badge.label}` : badge.label;
  if (kind === 'talent') return `Talent ${badge.talentLabel!.slice(1)}`;
  if (kind === 'trait') return 'Trait';
  return badge.label;
}

/** The skill's icon, or the talent's, trait's or module's short label, then its name. */
export default function SourceTag({ badge }: { badge: SourceBadge }) {
  const kind = sourceKind(badge);
  return (
    <span className="technique-source-tag">
      {kind === 'skill' && badge.skillIconPath
        ? <Image className="technique-source-icon" src={badge.skillIconPath} alt="" width={22} height={22} />
        : <span className="technique-source-chip" aria-hidden="true">{kind === 'skill' ? 'S' : kind === 'trait' ? 'TR' : badge.talentLabel}</span>}
      <span className="technique-source-name">{sourceName(badge)}</span>
    </span>
  );
}
