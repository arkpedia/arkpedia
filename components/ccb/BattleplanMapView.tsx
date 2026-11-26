import { useState } from 'react';
import { ContentImg } from '@/components/content/ContentImage';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { stageTileMark, tileStyle } from '@/lib/stages/stageTiles';
import type { BattleplanLayout, MapDetails } from '@/lib/ccb/types';
import { CcbMapImage } from './art';
import styles from './BattleplanStage.module.css';

const CELL = 32;

function StageTerrain({ layout, blocked, label }: {
  layout: BattleplanLayout;
  blocked: ReadonlySet<string>;
  label: string;
}) {
  const { cols, rows, tileGrid, tileLegend } = layout;
  return <svg className={styles.terrain} role="img" aria-label={label} viewBox={`0 0 ${cols * CELL} ${rows * CELL}`}>
    {tileGrid.map((row, r) => row.map((index, c) => {
      const tile = tileLegend[index];
      if (!tile) return null;
      const key = `${r},${c}`;
      const unavailable = blocked.has(key);
      const high = tile.height === 'high';
      const paint = tileStyle({ k: tile.key, high, build: tile.deployable, walk: tile.walkable, fly: tile.flyable });
      if (paint.fill === 'none' && !unavailable) return null;
      const x = c * CELL;
      const y = (rows - 1 - r) * CELL;
      return <g key={key} data-blocked={unavailable || undefined} data-row={r} data-col={c} data-height={high ? 'high' : 'ground'}>
        <title>{unavailable ? 'Blocked deployment tile' : paint.label ?? tile.key}</title>
        <rect x={x + 1} y={y + 1} width={CELL - 2} height={CELL - 2} fill={paint.fill} stroke={paint.stroke} />
        {paint.box && <rect x={x + 7} y={y + 7} width={CELL - 14} height={CELL - 14} fill="none" stroke={paint.box} />}
        {paint.mark && !unavailable && <path className={styles.tileMark} d={stageTileMark(paint.mark, x, y, CELL)} />}
        {unavailable && <>
          <rect className={styles.blockedTile} x={x + 1} y={y + 1} width={CELL - 2} height={CELL - 2} />
          <path className={styles.blockedMark} d={`M${x + 9} ${y + 9}l14 14m0 -14l-14 14`} />
        </>}
      </g>;
    }))}
  </svg>;
}

export default function BattleplanMapView({ name, details, blocked, inline = false }: {
  name: string;
  details: MapDetails;
  blocked: ReadonlySet<string>;
  inline?: boolean;
}) {
  const { layout } = details;
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const full = inline || details.fullPreview === unavailable ? undefined : details.fullPreview;
  const preview = full ?? details.preview;
  const previewAlt = `In-game screenshot of ${name}`;
  const [view, setView] = useState<'schematic' | 'ingame'>(layout ? 'schematic' : 'ingame');
  return <>
    {!inline && layout && preview && <SegmentedControl label="Map view" value={view} onChange={setView}
      options={[{ value: 'schematic', label: 'Schematic' }, { value: 'ingame', label: 'In-game screenshot' }]} />}
    <span className={styles.mapView} style={{ aspectRatio: layout ? `${layout.cols} / ${layout.rows}` : '16 / 9' }}>
      {layout && (inline || view === 'schematic' || !preview)
        ? <StageTerrain layout={layout} blocked={blocked} label={`Tile map of ${name}`} />
        : full ? <CcbMapImage path={full} className={styles.render} alt={previewAlt} onError={() => setUnavailable(full)} />
          : preview && <ContentImg className={styles.render} src={preview} alt={previewAlt} />}
    </span>
  </>;
}
