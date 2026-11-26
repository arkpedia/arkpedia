import { useState } from 'react';
import ScrollRow from '@/components/ui/ScrollRow';
import { CcbGlyph } from './art';
import { contractSummary, groupComplete, maximumContractScore } from '@/lib/ccb/modifiers';
import type { BattleplanMap, Contract, ContractGroup } from '@/lib/ccb/types';
import { CCB_TEXT as T } from './strings';
import styles from './Battleplan.module.css';

type SelectionProps = { selected: string[]; names: Record<string, string>; onSelect: (contract: Contract) => void };

export default function ContractBoard({ map, selected, onGroup, onInspect, inDialog = false }: {
  map: BattleplanMap;
  selected: string[];
  onGroup: (group: ContractGroup) => void;
  onInspect: (group: ContractGroup) => void;
  inDialog?: boolean;
}) {
  return <ul className={styles.riskChecklist}>{map.groups.map(group => {
    const score = group.contracts.filter(row => selected.includes(row.id)).reduce((sum, row) => sum + row.score, 0);
    const max = maximumContractScore(group.contracts);
    const complete = groupComplete(group, selected);
    const hasSelection = group.contracts.some(row => selected.includes(row.id));
    const icon = group.contracts.find(row => row.icon)?.icon;
    return <li key={group.id} className={styles.category}>
      <label className={`check ${styles.categoryCheck}`}>
        <input type="checkbox" aria-label={`Select ${group.name} contracts`} checked={complete}
          ref={input => { if (input) input.indeterminate = hasSelection && !complete; }}
          onChange={() => onGroup(group)} />
      </label>
      <button type="button" className={`btn-bare ${styles.categoryDetails}`} aria-haspopup={inDialog ? undefined : 'dialog'}
        aria-label={`View ${group.name} contracts`} onClick={() => onInspect(group)}>
        {icon ? <CcbGlyph kind="runeicon" id={icon} className={styles.categoryGlyph} /> : <span aria-hidden="true" />}
        <span>{group.name}</span>
        <span className={styles.groupScore}>{score}/{max}</span>
        <span aria-hidden="true">›</span>
      </button>
    </li>;
  })}</ul>;
}

const TILE = 52;
const PAD = 40;

export function ContractTree({ group, selected, names, onSelect, sectionId }: SelectionProps & { group: ContractGroup; sectionId: string }) {
  const [focused, onFocus] = useState<Contract | null>(null);
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
  return <section id={sectionId} tabIndex={-1} className={styles.group} style={{ flexBasis: width }} aria-label={group.name}>
    <div className={styles.groupHead}>
      <h3 className="entity-title entity-title-sm">{group.name}</h3>
      <span className={styles.groupScore}>▲ {score}<span> / {max}</span></span>
      {!!group.bonus && <span className={`${styles.bonus} ${complete ? styles.bonusOn : ''}`} title={T.groupBonus(group.bonus)} aria-label={T.groupBonus(group.bonus)}>▲+{group.bonus}</span>}
    </div>
    <p className={styles.contractHint} aria-live="polite">{focused ? contractSummary(focused, names) : T.hover}</p>
    <ScrollRow label={`${group.name} contracts`} controls={width > 254} persistentScrollbar={width > 254} className={styles.graphViewport}>
      <div className={styles.nodeGraph} style={{ width, minWidth: width, height }}>
        <svg className={styles.connections} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">{edges.map(({ from, to }) => <path key={`${from.id}-${to.id}`} className={selected.includes(from.id) && selected.includes(to.id) ? styles.connected : ''} d={`M ${from.x - minX} ${from.y - minY} H ${to.x - minX} V ${to.y - minY}`} />)}</svg>
        {group.contracts.map(contract => {
          const on = selected.includes(contract.id);
          const icon = contract.icon;
          const summary = contractSummary(contract, names);
          return <button type="button" key={contract.id} title={summary} aria-pressed={on} aria-label={`${summary}, ${contract.score}`} className={`btn-bare ${styles.contractNode} ${on ? styles.selectedNode : ''}`} style={{ left: contract.x - minX - TILE / 2, top: contract.y - minY - TILE / 2 }} onMouseEnter={() => onFocus(contract)} onFocus={() => onFocus(contract)} onClick={() => { onFocus(contract); onSelect(contract); }}>
            <span className={styles.tile}>{icon ? <CcbGlyph kind="runeicon" id={icon} className={styles.tileGlyph} /> : <span className={styles.tileGlyph}>◆</span>}</span>
            <span className={styles.points}>▲{contract.score}</span>
          </button>;
        })}
      </div>
    </ScrollRow>
  </section>;
}
