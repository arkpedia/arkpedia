import type { CSSProperties } from 'react';
import { ContentImg } from '@/components/content/ContentImage';
import { CHART_STRINGS as CHART } from '@/lib/tier-list/chartStrings';
import type { MakerSample } from '@/lib/tier-list/makerSamples';
import { TIER_LIST_STRINGS as TIER } from '@/lib/tier-list/strings';
import styles from './Polls.module.css';

function SamplePortrait({ name, image, style }: { name: string; image: string; style?: CSSProperties }) {
  return <ContentImg className={styles.samplePortrait} src={image} alt={name} title={name} width={40} height={40} style={style} />;
}

function SamplePreview({ sample }: { sample: MakerSample }) {
  if (sample.kind === 'tier') {
    return <div className={styles.sampleTier}>
      {sample.rows.map((row) => (
        <div className={styles.sampleTierRow} key={row.label}>
          <b style={{ '--sample-row-color': row.color } as CSSProperties}>{row.label}</b>
          {row.portraits.map((portrait) => <SamplePortrait key={portrait.name} {...portrait} />)}
        </div>
      ))}
    </div>;
  }

  if (sample.kind === 'grid') {
    return <div className={styles.sampleGrid}>
      <span aria-hidden="true" />
      {sample.columnLabels.map((label) => <b key={label}>{label}</b>)}
      {sample.rowLabels.map((label, row) => [
        <b key={label}>{label}</b>,
        ...sample.columnLabels.map((column, col) => {
          const portrait = sample.portraits[row * sample.columnLabels.length + col];
          return <span className={styles.sampleCell} key={`${label}-${column}`}>{portrait && <SamplePortrait {...portrait} />}</span>;
        }),
      ])}
    </div>;
  }

  return <div className={styles.sampleAxes}>
    {Object.entries(sample.labels).map(([end, label]) => <b key={end} style={{ gridArea: end }}>{label}</b>)}
    <div className={styles.samplePlane}>
      {sample.points.map(({ portrait, x, y }) => (
        <SamplePortrait key={portrait.name} {...portrait} style={{ left: `${x * 100}%`, top: `${y * 100}%` }} />
      ))}
    </div>
  </div>;
}

export default function MakerSampleCards({ samples }: { samples: MakerSample[] }) {
  return <section className={styles.previous} aria-labelledby="make-your-own-title">
    <h2 id="make-your-own-title" className="section-title">{TIER.indexHeading}</h2>
    {samples.map((sample) => {
      const heading = sample.kind === 'tier' ? TIER.title : `${CHART.navLabel} · ${CHART.kinds[sample.kind]}`;
      return <a key={sample.kind} className={`directory-card lift ${styles.makerCard}`} href={sample.href} aria-labelledby={`maker-sample-${sample.kind}`}>
        <div className={styles.archiveCopy}>
          <h3 id={`maker-sample-${sample.kind}`} className={`entity-title entity-title-name ${styles.archiveTitle}`}>{heading}</h3>
          {sample.kind === 'axes' && <p>Elite 0 base stats</p>}
          <span className={styles.archiveAction}>Open sample</span>
        </div>
        <SamplePreview sample={sample} />
      </a>;
    })}
  </section>;
}
