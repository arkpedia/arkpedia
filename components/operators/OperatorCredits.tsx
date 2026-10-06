import styles from './OperatorPage.module.css';
import type { ArtworkCredit } from '@/lib/operators/operatorArtworkCredits';
import type { OperatorVoicePack } from '@/lib/operators/operatorVoices';
import OperatorRelationPopover, { RelatedOperator } from './OperatorRelationPopover';

const LANGUAGE_CODES: Record<string, string> = {
  Japanese: 'JP', Chinese: 'CN', Mandarin: 'CN', English: 'EN', Korean: 'KR',
  Spanish: 'ES', Russian: 'RU', Italian: 'IT', German: 'DE', French: 'FR',
  'Regional Chinese': 'CN-R', Collaboration: 'CO',
};

function CreditIcon({ kind }: { kind: 'Illustrator' | 'Original designer' | 'Voice actor' }) {
  return <svg role="img" aria-label={kind} viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <title>{kind}</title>
    {kind === 'Illustrator' ? <>
      <path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.5-3.3 1.7 1.7 0 0 1 1.3-2.8H18a3 3 0 0 0 3-3C21 6.9 17 3 12 3Z" />
      <circle cx="7.5" cy="10" r=".8" /><circle cx="11" cy="6.8" r=".8" /><circle cx="16" cy="8.2" r=".8" />
    </> : kind === 'Original designer' ? <>
      <path d="m4 16-1 5 5-1L21 7l-4-4L4 16Z M14 6l4 4 M4 16l4 4" />
    </> : <>
      <rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2 M12 19v3 M8 22h8" />
    </>}
  </svg>;
}

function CreditValue({ value, variants, related }: { value: string | null; variants: (string | null)[]; related: Record<string, RelatedOperator[]> }) {
  const labels = [...new Set([...variants, value].map(credit => credit || 'Not listed'))];
  const selected = value || 'Not listed';
  return <dd className={styles.creditValue}>
    {labels.map(label => <span key={label} aria-hidden={label !== selected}
      style={{ visibility: label === selected ? 'visible' : 'hidden', pointerEvents: label === selected ? undefined : 'none' }}>
      {/* Credits sit in the overview: another illustrator's operator opens at its top, on its art. */}
      <OperatorRelationPopover label={label} title={`Also illustrated by ${label}`} operators={related[label] ?? []} section={null} />
    </span>)}
  </dd>;
}

export default function OperatorCredits({ artwork, variants, voicePacks, relatedByArtist = {}, relatedByVoiceActor = {} }: {
  artwork: ArtworkCredit;
  variants: ArtworkCredit[];
  voicePacks?: OperatorVoicePack[] | null;
  relatedByArtist?: Record<string, RelatedOperator[]>;
  relatedByVoiceActor?: Record<string, RelatedOperator[]>;
}) {
  const hasArtist = variants.some(credit => credit.illustrator || credit.originalDesigner);
  const hasDesigner = variants.some(credit => credit.originalDesigner);
  const voiceEntries = (voicePacks ?? []).filter(pack => pack.status === 'current' && pack.actors.some(actor => actor.trim()));
  if (!hasArtist && !voiceEntries.length) return null;
  return <section className={styles.credits} aria-label="Credits">
    <h3>Credits</h3>
    <div className={styles.creditGroups}>
      {hasArtist && <dl>
        <div><dt><CreditIcon kind="Illustrator" /></dt><CreditValue value={artwork.illustrator} variants={variants.map(credit => credit.illustrator)} related={relatedByArtist} /></div>
        {hasDesigner && <div><dt><CreditIcon kind="Original designer" /></dt><CreditValue value={artwork.originalDesigner} variants={variants.map(credit => credit.originalDesigner)} related={relatedByArtist} /></div>}
      </dl>}
      {voiceEntries.length > 0 && <dl>
        {voiceEntries.map(pack => <div key={pack.id}>
          <dt title={`${pack.label} voice actor`}><CreditIcon kind="Voice actor" /><span aria-label={pack.label}>{LANGUAGE_CODES[pack.label] ?? pack.label}</span></dt>
          <dd>{pack.actors.map(actor => <div key={actor}><OperatorRelationPopover label={actor} title={`Also voiced by ${actor}`} operators={relatedByVoiceActor[actor] ?? []} section="voiceLines" /></div>)}</dd>
        </div>)}
      </dl>}
    </div>
  </section>;
}
