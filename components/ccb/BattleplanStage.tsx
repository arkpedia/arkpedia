import { ContentArt } from '@/components/content/ContentImage';
import { stageModifiers } from '@/lib/ccb/modifiers';
import type { BattleplanMap, CcbStageStats, Contract, MapDetails } from '@/lib/ccb/types';
import BattleplanMapView from './BattleplanMapView';
import { CCB_TEXT as T } from './strings';
import { formatStatValue, statChange } from './StatComparison';
import styles from './BattleplanStage.module.css';

interface StageProps {
  map: BattleplanMap & { details: MapDetails | null };
  contracts: readonly Contract[];
}

const STAGE_STATS = [
  { stat: 'initialDp', label: T.initialDp, icon: 'cost' },
  { stat: 'dpRecovery', label: T.dpRecovery, icon: 'redeploy' },
  { stat: 'deployment', label: T.deployLimit, icon: 'squad' },
  { stat: 'life', label: T.life, icon: 'life' },
  { stat: 'squadSize', label: 'Squad limit', icon: 'squad' },
] as const;

function StageFacts({ details, modified, blocked }: { details: MapDetails | null; modified: CcbStageStats; blocked: ReadonlySet<string> }) {
  if (!details && !blocked.size && !STAGE_STATS.some(({ stat }) => modified[stat] != null)) return null;
  const layout = details?.layout;
  const counts = { ground: 0, high: 0 };
  if (layout) {
    for (const location of blocked) {
      const [row, col] = location.split(',').map(Number);
      const tile = layout.tileLegend[layout.tileGrid[row]?.[col]];
      if (tile) counts[tile.height === 'high' ? 'high' : 'ground']++;
    }
  }
  const byHeight = [counts.ground ? `${counts.ground} ground` : '', counts.high ? `${counts.high} high` : ''].filter(Boolean);
  const blockedDetail = counts.ground + counts.high === blocked.size ? byHeight.join(', ') : 'Terrain unavailable for some tiles';

  return <dl className={styles.facts} aria-label="Stage modifiers">
    {STAGE_STATS.map(({ stat, label, icon }) => {
      const baseline = details?.battle[stat] ?? null;
      const value = modified[stat] ?? null;
      const change = statChange(baseline, value);
      return <div key={stat}>
        <dt>
          <ContentArt src={`/stat-icons/${icon}.webp`} className={`mode-mark ${styles.factIcon}`} aria-hidden="true" />
          <span>{label}</span>
        </dt>
        <dd>
          <strong>{formatStatValue(value)}</strong>
          {change && <small className={change.direction}><span className="visually-hidden">Change </span>{change.text}</small>}
        </dd>
      </div>;
    })}
    <div className={styles.blockedFact}>
      <dt>
        <span aria-hidden="true" className={`${styles.factIcon} ${styles.legendSwatch}`} data-active={blocked.size > 0 || undefined}>×</span>
        <span>Blocked tiles</span>
      </dt>
      <dd aria-live="polite">
        <strong>{blocked.size}</strong>
        {blockedDetail && <small>({blockedDetail})</small>}
      </dd>
    </div>
  </dl>;
}

function MapFigure({ map, blocked, onOpen, detail = false }: {
  map: StageProps['map'];
  blocked: ReadonlySet<string>;
  onOpen?: () => void;
  detail?: boolean;
}) {
  const details = map.details;
  const layout = details?.layout;
  const image = details && (layout || details.preview || (detail && details.fullPreview))
    ? <BattleplanMapView name={map.name} details={details} blocked={blocked} inline={!detail} /> : null;
  return <figure className={detail ? styles.fullMap : styles.map}>
    {image && onOpen ? <button className={`btn-bare ${styles.open}`} type="button" aria-haspopup="dialog"
      aria-label={`Open stage map for ${map.name}`} onClick={onOpen}>
      {image}<span className={styles.enlarge} aria-hidden="true">⤢</span>
    </button> : image ?? <p className={styles.note}>{details ? 'Stage map unavailable.' : T.noStage}</p>}
  </figure>;
}

export default function BattleplanStage({ map, contracts, onOpenMap }: StageProps & { onOpenMap?: () => void }) {
  const { battle, blocked } = stageModifiers(map.details?.battle, contracts);
  return <section className={`panel op-section ${styles.stage}`} aria-label={`${map.name}: Stage`}>
    <h2 className="section-title">Stage</h2>
    <div className={styles.stageGrid}>
      <MapFigure map={map} blocked={blocked} onOpen={onOpenMap} />
      <StageFacts details={map.details} modified={battle} blocked={blocked} />
    </div>
  </section>;
}

export function BattleplanStageDetails({ map, contracts }: StageProps) {
  const { battle, blocked } = stageModifiers(map.details?.battle, contracts);
  return <div className={styles.details}>
    <MapFigure map={map} blocked={blocked} detail />
    <StageFacts details={map.details} modified={battle} blocked={blocked} />
  </div>;
}
