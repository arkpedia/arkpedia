import { useState } from 'react';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { summonStats, type Summon } from '@/lib/operators/summonStats';
const LABELS: Record<string, string> = { maxHp: 'HP', atk: 'ATK', def: 'DEF', magicResistance: 'RES', cost: 'DP cost', blockCnt: 'Block', baseAttackTime: 'Attack interval', respawnTime: 'Redeploy' };
export default function OperatorSummons({ summons }: { summons: Summon[] }) {
  const [selected, setSelected] = useState(summons[0]?.id), [elite, setElite] = useState(2), [level, setLevel] = useState(90);
  const summon = summons.find(value => value.id === selected) ?? summons[0];
  if (!summon) return null;
  const stage = Math.min(elite, summon.phases.length - 1), phase = summon.phases[stage], shownLevel = Math.min(level, phase.maxLevel);
  const stats = summonStats(summon, stage, shownLevel);
  return <div className="operator-summons">
    <SegmentedControl label="Summon" options={summons.map(value => ({ value: value.id, label: value.name }))} value={summon.id} onChange={setSelected} />
    <SegmentedControl label="Summon promotion" options={summon.phases.map((_, index) => ({ value: index, label: `Elite ${index}` }))} value={stage} onChange={setElite} />
    <label>Level {shownLevel}<input aria-label="Summon level" type="range" min="1" max={phase.maxLevel} value={shownLevel} onChange={e => setLevel(Number(e.target.value))} /></label>
    <dl className="free-op-summary">{Object.entries(stats).map(([key, value]) => <div key={key}><dt>{LABELS[key]}</dt><dd>{key === 'baseAttackTime' || key === 'respawnTime' ? `${Number(value.toFixed(2))}s` : Math.round(value).toLocaleString()}</dd></div>)}</dl>
    <p className="hint">Base summon stats before skills, talents and modules. Some summons inherit additional stats from their operator.</p>
  </div>;
}
