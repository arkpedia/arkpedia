import ScrollRow from '@/components/ui/ScrollRow';
import { CcbGlyph } from './art';
import { contractSummary, groupComplete, maximumContractScore } from '@/lib/ccb/modifiers';
import type { BattleplanMap, Contract, ContractGroup } from '@/lib/ccb/types';
import { CCB_TEXT as T } from './strings';
import styles from './Battleplan.module.css';

type BoardProps = { selected: string[]; names: Record<string, string>; onSelect: (contract: Contract) => void; onFocus: (contract: Contract) => void };

/** Every indicator group at once, each drawn as the game's small tree of contract tiles. */
export default function ContractBoard({ map, ...props }: BoardProps & { map: BattleplanMap }) {
  return <div className={styles.groups}>{map.groups.map(group => <GroupTree key={group.id} group={group} {...props} />)}</div>;
}

const TILE = 52;
const PAD = 40;

function GroupTree({ group, selected, names, onSelect, onFocus }: BoardProps & { group: ContractGroup }) {
  const score = group.contracts.filter(row => selected.includes(row.id)).reduce((sum, row) => sum + row.score, 0);
  const max = maximumContractScore(group.contracts);
  const complete = groupComplete(group, selected);
  const minX = Math.min(...group.contracts.map(row => row.x)) - PAD;
  const minY = Math.min(...group.contracts.map(row => row.y)) - PAD;
  const width = Math.max(...group.contracts.map(row => row.x)) - minX + PAD;
  const height = Math.max(...group.contracts.map(row => row.y)) - minY + PAD + 14;
  const edges = group.contracts.flatMap(row => row.adjacent.flatMap(id => {
    const other = group.contracts.find(item => item.id === id);
    return other && id > row.id ? [{ from: row, to: other }] : [];
  }));
  return <section className={styles.group} aria-label={group.name}>
    <header className={styles.groupHead} data-complete={complete || undefined}>
      <span className={styles.groupScore}>▲ {score}<span> / {max}</span></span>
      {!!group.bonus && <span className={`${styles.bonus} ${complete ? styles.bonusOn : ''}`} title={T.groupBonus(group.bonus)} aria-label={T.groupBonus(group.bonus)}>▲+{group.bonus}</span>}
      <strong>{group.name}</strong>
      {complete && <span className={styles.completed}>{T.completed}</span>}
    </header>
    <ScrollRow label={`${group.name} contracts`} controls={width > 270} persistentScrollbar={width > 270} className={styles.graphViewport}>
      <div className={styles.nodeGraph} style={{ width, minWidth: width, height }}>
        <svg className={styles.connections} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">{edges.map(({ from, to }) => <path key={`${from.id}-${to.id}`} className={selected.includes(from.id) && selected.includes(to.id) ? styles.connected : ''} d={`M ${from.x - minX} ${from.y - minY} H ${to.x - minX} V ${to.y - minY}`} />)}</svg>
        {group.contracts.map(contract => {
          const on = selected.includes(contract.id);
          const icon = contract.icon;
          const summary = contractSummary(contract, names);
          return <button type="button" key={contract.id} title={summary} aria-pressed={on} aria-label={`${summary}, ${contract.score}`} className={`btn-bare ${styles.contractNode} ${on ? styles.selectedNode : ''}`} style={{ left: contract.x - minX - TILE / 2, top: contract.y - minY - TILE / 2 }} onMouseEnter={() => onFocus(contract)} onFocus={() => onFocus(contract)} onClick={() => { onFocus(contract); onSelect(contract); }}>
            <span className={styles.tile}>{icon ? <CcbGlyph kind="runeicon" id={icon} className={styles.tileGlyph} /> : <span className={styles.tileGlyph}>◆</span>}{on && <span className={styles.tick} aria-hidden="true">✓</span>}</span>
            <span className={styles.points}>▲{contract.score}</span>
          </button>;
        })}
      </div>
    </ScrollRow>
  </section>;
}
