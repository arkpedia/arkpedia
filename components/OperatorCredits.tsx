import styles from './OperatorPage.module.css';
import type { ArtworkCredit } from '@/lib/operators/operatorArtworkCredits';

const LANGUAGE_CODES: Record<string, string> = {
  Japanese: 'JP', Chinese: 'CN', Mandarin: 'CN', English: 'EN', Korean: 'KR',
  Spanish: 'ES', Russian: 'RU', Italian: 'IT', German: 'DE', French: 'FR',
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

function CreditValue({ value, variants }: { value: string | null; variants: (string | null)[] }) {
  const labels = [...new Set([...variants, value].map(credit => credit || 'Not listed'))];
  const selected = value || 'Not listed';
  return <dd className={styles.creditValue}>
    {labels.map(label => <span key={label} aria-hidden={label !== selected}
      style={{ visibility: label === selected ? 'visible' : 'hidden' }}>{label}</span>)}
  </dd>;
}

export default function OperatorCredits({ artwork, variants, voices }: {
  artwork: ArtworkCredit;
  variants: ArtworkCredit[];
  voices?: Record<string, string> | null;
}) {
  const hasArtist = variants.some(credit => credit.illustrator || credit.originalDesigner);
  const hasDesigner = variants.some(credit => credit.originalDesigner);
  const voiceEntries = Object.entries(voices ?? {}).filter(([, credit]) => credit?.trim());
  if (!hasArtist && !voiceEntries.length) return null;
  return <section className={styles.credits} aria-label="Credits">
    <h3>Credits</h3>
    <div className={styles.creditGroups}>
      {hasArtist && <dl>
        <div><dt><CreditIcon kind="Illustrator" /></dt><CreditValue value={artwork.illustrator} variants={variants.map(credit => credit.illustrator)} /></div>
        {hasDesigner && <div><dt><CreditIcon kind="Original designer" /></dt><CreditValue value={artwork.originalDesigner} variants={variants.map(credit => credit.originalDesigner)} /></div>}
      </dl>}
      {voiceEntries.length > 0 && <dl>
        {voiceEntries.map(([language, credit]) => <div key={language}>
          <dt title={`${language} voice actor`}><CreditIcon kind="Voice actor" /><span aria-label={language}>{language.split(' & ').map(part => LANGUAGE_CODES[part] ?? part).join(' / ')}</span></dt>
          <dd>{credit.split(/(?<=\))\s+(?=[^()]+\()/).map(actor => <div key={actor}>{actor}</div>)}</dd>
        </div>)}
      </dl>}
    </div>
  </section>;
}
