import type { StageLayout } from '@/lib/minigames/stageGuesser';
import { stageTileMark, tileStyle } from '@/lib/stages/stageTiles';
import styles from '@/styles/games/stage-guesser.module.css';

export default function StageTileLegend({ layout, selected, onSelect }: {
  layout: StageLayout; selected: number | null; onSelect: (index: number | null) => void;
}) {
  const tile = selected === null ? null : layout.tileLegend[selected];
  const used = new Set(layout.tileGrid.flat());
  const entries = layout.tileLegend.map((entry, index) => ({ entry, index })).filter(({ index }) => used.has(index));
  return <div className={styles.tileGuide}>
    <p>Click a tile to inspect it, or choose a tile type from the legend.</p>
    {tile && <section className={styles.tileInfo} aria-label="Selected tile" aria-live="polite">
      <div><h3>{tile.name}</h3><button type="button" onClick={() => onSelect(null)} aria-label="Close tile details">×</button></div>
      <p>{tile.description}</p>
      <p>{tile.height === 'high' ? 'High ground' : 'Ground level'} · {tile.deployable === 'all' ? 'Melee or ranged deployment' : tile.deployable === 'melee' ? 'Melee deployment' : tile.deployable === 'ranged' ? 'Ranged deployment' : 'No deployment'} · {tile.walkable ? 'Enemies can walk here' : 'Enemies cannot walk here'}</p>
    </section>}
    <details>
      <summary>Map legend <span>{entries.length} tile types</span></summary>
      <div className={styles.tileTypes}>
        {entries.map(({ entry, index }) => {
          const appearance = tileStyle({ k: entry.key, high: entry.height === 'high', build: entry.deployable, walk: entry.walkable, fly: entry.flyable });
          return <button key={index} type="button" aria-pressed={selected === index} onClick={() => onSelect(selected === index ? null : index)}>
            <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
              <rect x="1" y="1" width="30" height="30" rx="2" fill={appearance.fill} stroke={appearance.stroke || 'var(--text-faint)'} />
              {appearance.mark && <path d={stageTileMark(appearance.mark, 0, 0, 32)} fill="none" stroke="var(--text-dim)" strokeWidth="1.6" />}
              {appearance.box && <rect x="8" y="8" width="16" height="16" fill="none" stroke={appearance.box} strokeWidth="2" />}
            </svg>
            <span>{entry.name}<small>{entry.height === 'high' ? 'High ground' : 'Ground level'}</small></span>
          </button>;
        })}
      </div>
    </details>
  </div>;
}
