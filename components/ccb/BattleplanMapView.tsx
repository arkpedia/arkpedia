import { useState } from 'react';
import { ContentImg } from '@/components/content/ContentImage';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { stageTileMark, tileStyle, type TileMark } from '@/lib/stages/stageTiles';
import type { BattleplanLayout, MapDetails } from '@/lib/ccb/types';
import { CcbMapImage } from './art';
import styles from './BattleplanStage.module.css';

const CELL = 32;
const getTileStyle = (tile: BattleplanLayout['tileLegend'][number]) =>
  tileStyle({ k: tile.key, high: tile.height === 'high', build: tile.deployable, walk: tile.walkable, fly: tile.flyable });

function mapTileMark(mark: TileMark, x: number, y: number) {
  // Keep the X distinct from hazards. In CCB it marks contract-blocked deployment.
  return mark === 'hazard' ? `M${x + 16} ${y + 9}v9m0 5v1` : stageTileMark(mark, x, y, CELL);
}

function TerrainLegend({ layout }: { layout: BattleplanLayout }) {
  const hazards = new Map<string, string | null>();
  for (const tile of layout.tileLegend) {
    const paint = getTileStyle(tile);
    if (paint.mark !== 'hazard') continue;
    const description = layout.tileDescriptions?.[tile.key];
    hazards.set(description?.name || paint.label || tile.key, description?.description ?? null);
  }
  return <ul className={styles.mapLegend} aria-label="Map legend">
    {[...hazards].map(([name, description]) => <li key={name}>
      <span className={styles.factIcon} aria-hidden="true">!</span>
      <span>{name}{description && <small>{description}</small>}</span>
    </li>)}
    <li><span className={`${styles.factIcon} ${styles.legendSwatch}`} data-active aria-hidden="true">×</span>Blocked by a contract</li>
    <li>Red square · Enemy spawn</li>
    <li>Blue square · Protection objective</li>
    {layout.tileLegend.some(tile => getTileStyle(tile).mark === 'portal') && <li>Arc · Portal or tunnel</li>}
  </ul>;
}

function StageTerrain({ layout, blocked, label }: {
  layout: BattleplanLayout;
  blocked: ReadonlySet<string>;
  label: string;
}) {
  const { cols, rows, tileGrid, tileLegend, tileDescriptions } = layout;
  return <svg className={styles.terrain} role="img" aria-label={label} viewBox={`0 0 ${cols * CELL} ${rows * CELL}`}>
    {tileGrid.map((row, r) => row.map((index, c) => {
      const tile = tileLegend[index];
      if (!tile) return null;
      const key = `${r},${c}`;
      const unavailable = blocked.has(key);
      const high = tile.height === 'high';
      const paint = getTileStyle(tile);
      const name = tileDescriptions?.[tile.key]?.name || paint.label || tile.key;
      const deployment = tile.deployable === 'ranged' ? 'Ranged deployment'
        : tile.deployable === 'melee' ? 'Melee deployment' : 'No deployment';
      if (paint.fill === 'none' && !unavailable) return null;
      const x = c * CELL;
      const y = (rows - 1 - r) * CELL;
      return <g key={key} data-blocked={unavailable || undefined} data-row={r} data-col={c} data-height={high ? 'high' : 'ground'}>
        <title>{`${name} · ${unavailable ? 'Blocked by a contract' : deployment}`}</title>
        <rect x={x + 1} y={y + 1} width={CELL - 2} height={CELL - 2} fill={paint.fill} stroke={paint.stroke} />
        {paint.box && <rect x={x + 7} y={y + 7} width={CELL - 14} height={CELL - 14} fill="none" stroke={paint.box} />}
        {paint.mark && !unavailable && <path className={styles.tileMark} d={mapTileMark(paint.mark, x, y)} />}
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
  const schematic = layout && (inline || view === 'schematic' || !preview);
  return <>
    {!inline && layout && preview && <SegmentedControl label="Map view" value={view} onChange={setView}
      options={[{ value: 'schematic', label: 'Schematic' }, { value: 'ingame', label: 'In-game screenshot' }]} />}
    <span className={styles.mapView} style={{ aspectRatio: layout ? `${layout.cols} / ${layout.rows}` : '16 / 9' }}>
      {schematic
        ? <StageTerrain layout={layout} blocked={blocked} label={`Tile map of ${name}`} />
        : full ? <CcbMapImage path={full} className={styles.render} alt={previewAlt} onError={() => setUnavailable(full)} />
          : preview && <ContentImg className={styles.render} src={preview} alt={previewAlt} />}
    </span>
    {!inline && schematic && <TerrainLegend layout={layout} />}
  </>;
}
