import { useState } from 'react';
import ScrollRow from '@/components/ui/ScrollRow';
import { contractSummary, maximumContractScore } from '@/lib/ccb/modifiers';
import type { BattleplanMap, Contract, ContractGroup } from '@/lib/ccb/types';
import styles from './Battleplan.module.css';

export default function ContractBoard({ map, selected, names, onSelect }: { map: BattleplanMap; selected: string[]; names: Record<string, string>; onSelect: (contract: Contract) => void }) {
  const [openId, setOpen] = useState<string | null>(null);
  const group = map.groups.find(row => row.id === openId);
  const rows = [...new Set(map.groups.map(row => Math.round(row.y)))].sort((a, b) => a - b);
  if (!map.main) return <NodeGraph group={map.groups[0]} selected={selected} names={names} onSelect={onSelect} />;
  if (group) return <>
    <div className={styles.row}><button className="ghost btn-sm" onClick={() => setOpen(null)}>‹ All criteria</button><h3>{group.name}</h3><span className={styles.groupScore}>▲ {group.contracts.filter(row => selected.includes(row.id)).reduce((sum, row) => sum + row.score, 0)} / {maximumContractScore(group.contracts)}</span></div>
    <NodeGraph group={group} selected={selected} names={names} onSelect={onSelect} />
  </>;
  return <div className={styles.groups}>
    {map.groups.map(group => {
      const score = group.contracts.filter(row => selected.includes(row.id)).reduce((sum, row) => sum + row.score, 0);
      return <button type="button" className={`btn-bare ${styles.groupTrigger}`} key={group.id} style={{ gridRow: rows.indexOf(Math.round(group.y)) + 1, gridColumn: group.width > 400 ? '1 / -1' : group.x > 400 ? '2' : '1' }} aria-label={`${group.name}, ${score} of ${maximumContractScore(group.contracts)} points`} onClick={() => setOpen(group.id)}>
        <span className={styles.groupIcon} aria-hidden="true">{group.contracts.some(row => row.effects.some(effect => effect.key.startsWith('enemy_'))) ? '▲' : '◆'}</span>
        <span><span className={styles.groupScore}>▲ {score} <span>/ {maximumContractScore(group.contracts)}</span></span><strong>{group.name}</strong></span><span aria-hidden="true">»</span>
      </button>;
    })}
  </div>;
}

function NodeGraph({ group, selected, names, onSelect }: { group: ContractGroup; selected: string[]; names: Record<string, string>; onSelect: (contract: Contract) => void }) {
  const [focusedId, setFocused] = useState(group.contracts.find(row => selected.includes(row.id))?.id ?? group.contracts[0]?.id);
  const focused = group.contracts.find(row => row.id === focusedId) ?? group.contracts[0];
  const minX = Math.min(...group.contracts.map(row => row.x)) - 45;
  const minY = Math.min(...group.contracts.map(row => row.y)) - 45;
  const width = Math.max(...group.contracts.map(row => row.x)) - minX + 45;
  const height = Math.max(...group.contracts.map(row => row.y)) - minY + 45;
  const edges = group.contracts.flatMap(row => row.adjacent.flatMap(id => {
    const other = group.contracts.find(item => item.id === id);
    return other && id > row.id ? [{ from: row, to: other }] : [];
  }));
  return <>
    <ScrollRow label="Contract nodes" controls={width > 300} className={styles.graphViewport}>
    <div className={styles.nodeGraph} style={{ aspectRatio: `${width} / ${height}`, width: Math.min(width, 560), minWidth: Math.min(width, 560) }}>
      <svg className={styles.connections} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" preserveAspectRatio="none">{edges.map(({ from, to }) => <path key={`${from.id}-${to.id}`} className={selected.includes(from.id) && selected.includes(to.id) ? styles.connected : ''} d={`M ${from.x - minX} ${from.y - minY} H ${to.x - minX} V ${to.y - minY}`} />)}</svg>
      {group.contracts.map(contract => <label key={contract.id} title={contractSummary(contract, names)} className={`check ${styles.contractNode} ${selected.includes(contract.id) ? styles.selectedNode : ''}`} style={{ left: `${(contract.x - minX) / width * 100}%`, top: `${(contract.y - minY) / height * 100}%`, width: `${Math.min(68 / width * 100, 75)}%` }} onFocus={() => setFocused(contract.id)}>
        <input type="checkbox" aria-label={`${contractSummary(contract, names)}, ${contract.score} points`} checked={selected.includes(contract.id)} onChange={() => { setFocused(contract.id); onSelect(contract); }} />
        <span className={styles.points}>▲{contract.score}</span><span className={styles.nodeName}>{!/[\u3400-\u9fff]/.test(contractSummary(contract, names)) ? contractSummary(contract, names).replace(/^(All enemies|All operators)( on (ground|high) tiles)?: /, '') : contract.name}</span>
      </label>)}
    </div>
    </ScrollRow>
    {focused && <p className={styles.nodeDescription} aria-live="polite">{contractSummary(focused, names)}</p>}
  </>;
}
