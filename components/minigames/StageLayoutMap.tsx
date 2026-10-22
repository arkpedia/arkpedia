import type { StageLayout } from '@/lib/minigames/stageGuesser';
import { stageTileMark, tileStyle } from '@/lib/stages/stageTiles';

const CELL = 32;
const GAP = 3;
const PAD = 14;

/** The stage browser's tile language, without routes, units or identifying labels. */
export default function StageLayoutMap({ layout, selectedTile = null, onSelect }: { layout: StageLayout; selectedTile?: number | null; onSelect?: (index: number) => void }) {
  const { rows, cols, tileGrid, tileLegend } = layout;
  return <svg viewBox={`0 0 ${cols * (CELL + GAP) - GAP + PAD * 2} ${rows * (CELL + GAP) - GAP + PAD * 2}`}
    role="img" aria-label="Stage layout to identify" preserveAspectRatio="xMidYMid meet">
    {tileGrid.map((row, r) => row.map((index, c) => {
      const tile = tileLegend[index];
      const style = tileStyle({ k: tile.key, high: tile.height === 'high', build: tile.deployable, walk: tile.walkable, fly: tile.flyable });
      const x = PAD + c * (CELL + GAP);
      // Geometry row zero is the bottom of the battlefield, just as in the stage browser.
      const y = PAD + (rows - 1 - r) * (CELL + GAP);
      const selected = selectedTile === index;
      // The adjacent legend exposes the same actions as keyboard-accessible buttons.
      const select = onSelect ? () => onSelect(index) : undefined;
      if (style.fill === 'none') return <rect key={`${r}-${c}`} x={x + 4} y={y + 4} width={CELL - 8} height={CELL - 8} rx={2}
        fill="transparent" stroke={selected ? 'var(--teal)' : 'var(--stage-map-void-stroke, #1c1c1e)'} strokeWidth={selected ? 2 : 1} onClick={select} style={select ? { cursor: 'pointer' } : undefined} />;
      const lift = tile.height === 'high' ? 3 : 0;
      return <g key={`${r}-${c}`} onClick={select} style={select ? { cursor: 'pointer' } : undefined}>
        {lift > 0 && <rect x={x} y={y + lift} width={CELL} height={CELL - lift} rx={2} fill="var(--stage-map-raised-edge, #191a1a)" />}
        <rect x={x} y={y - lift} width={CELL} height={CELL} rx={2} fill={style.fill}
          stroke={style.stroke || (lift ? 'var(--stage-map-high-stroke, #8a8c8d)' : 'var(--stage-map-ground-stroke, #1b1c1d)')} strokeWidth={style.stroke ? 1.4 : 1} />
        {selected && <rect x={x - 1} y={y - lift - 1} width={CELL + 2} height={CELL + 2} rx={2} fill="none" stroke="var(--teal)" strokeWidth={2} />}
        {style.mark && <path d={stageTileMark(style.mark, x, y - lift, CELL)} fill="none" stroke="var(--text-dim, #d0c9bd)" strokeWidth={1.6} strokeLinecap="round" />}
        {style.box && <rect x={x + 8} y={y + 8} width={CELL - 16} height={CELL - 16} fill="none" stroke={style.box} strokeWidth={2} />}
      </g>;
    }))}
  </svg>;
}
