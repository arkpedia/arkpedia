import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import SegmentedControl from '@/components/ui/SegmentedControl';
import StyledSelect from '@/components/ui/StyledSelect';
import NumberInput from '@/components/ui/NumberInput';
import InfoPopover from '@/components/ui/InfoPopover';
import Image from '@/components/content/ContentImage';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import type { FacilityDef } from '@/lib/base/baseTypes';
import type { AccountRecord } from '@/lib/account/accountStore';
import { ownedBaseRoster } from '@/lib/base/optimizerRoster';
import type { AccountOptimizerInput, AccountOptimizerResult, LayoutRecommendation } from '@/lib/base/accountOptimizer';
import type { SimulationBase } from '@/lib/base/baseSimulation';
import { getFacilities } from '@/lib/base/baseConfig';
import { rotationClock } from '@/lib/base/baseRotationPlan';
import styles from './BaseAccountOptimizer.module.css';

const whole = (value: number) => Math.round(value).toLocaleString();
// Two results per browser page session; reopening the modal need not repeat a search.
const cachedResults = new Map<string, AccountOptimizerResult>();
// The reader's search time, kept for the page session like the results (it is part of their cache key).
let lastSearchMinutes = 2;
export default function BaseAccountOptimizer({ account, base, loginInterval, onInterval, onApply }: {
  account: AccountRecord | null; base: Omit<SimulationBase, 'facilities'>;
  loginInterval: number; onInterval: (hours: number) => void;
  onApply: (recommendation: LayoutRecommendation, startHour: number, externalGold: number) => boolean;
}) {
  const [objective, setObjective] = useState<AccountOptimizerInput['objective']>('balanced');
  const [externalGold, setExternalGold] = useState(0);
  const [compareLayouts, setCompareLayouts] = useState(true);
  const [searchMinutes, setSearchMinutes] = useState(lastSearchMinutes);
  const [startHour, setStartHour] = useState(8);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, label: '' });
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ key: string; value: AccountOptimizerResult } | null>(null);
  const [selected, setSelected] = useState('');
  const [selectedShift, setSelectedShift] = useState(0);
  const [saved, setSaved] = useState(false);
  const worker = useRef<Worker | null>(null);
  // The best result so far, kept while the search runs so stopping it still leaves a plan.
  const partial = useRef<AccountOptimizerResult | null>(null);
  const deadline = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cache = useRef(cachedResults);
  const byName = useMemo(() => new Map(base.operators.map(op => [op.name, op])), [base.operators]);
  const owned = useMemo(() => account ? ownedBaseRoster(account, new Set(base.operators.map(o => o.name))) : { roster: {}, assumed: [] }, [account, base.operators]);
  const input: AccountOptimizerInput = { base, roster: owned.roster, snapshot: account?.base, loginInterval, objective, externalGold, compareLayouts, searchSeconds: searchMinutes * 60 };
  // Includes the selected account and release data, so switching account or inputs
  // cannot apply a result produced from an earlier import or content release.
  const key = JSON.stringify(input, (_name, value) => value instanceof Set ? [...value].sort() : value);
  useEffect(() => {
    worker.current?.terminate(); worker.current = null;
    if (deadline.current) clearTimeout(deadline.current);
    setRunning(false); setSaved(false); setError('');
    return () => { worker.current?.terminate(); worker.current = null; if (deadline.current) clearTimeout(deadline.current); };
  }, [key]);
  const current = result?.key === key ? result.value : null;
  const recommendation = current?.recommendations.find(r => r.id === selected) ?? current?.recommendations[0];
  const facilities = recommendation ? getFacilities(recommendation.spots, recommendation.levels) : [];
  const shiftStaff = recommendation?.plan.shifts[selectedShift].assignments ?? {};
  const resting = facilities.filter(f => f.kind === 'dormitory').reduce((n, f) => n + (shiftStaff[f.id]?.filter(Boolean).length ?? 0), 0);
  const placed = new Set(Object.values(shiftStaff).flatMap(slots => slots.flatMap(slot => slot ? [slot.operatorName] : []))).size;
  const buildingCounts: Record<string, number> = {};
  const names = Object.fromEntries(facilities.filter(f => f.capacity).map(f => {
    buildingCounts[f.kind] = (buildingCounts[f.kind] ?? 0) + 1;
    return [f.id, `${f.label}${['tradingPost', 'factory', 'powerPlant', 'dormitory'].includes(f.kind) ? ` ${buildingCounts[f.kind]}` : ''}`];
  }));

  function show(value: AccountOptimizerResult, final: boolean) {
    if (final) {
      if (cache.current.size >= 2) cache.current.delete(cache.current.keys().next().value!);
      cache.current.set(key, value);
    }
    setResult({ key, value }); setSelected(value.recommendations[0]?.id ?? ''); setSelectedShift(0);
  }
  /** Stop the search; keep its best plan so far, if it found one. */
  function stop(message?: string) {
    worker.current?.terminate(); worker.current = null;
    if (deadline.current) clearTimeout(deadline.current);
    setRunning(false);
    if (partial.current) show(partial.current, false);
    else if (message) setError(message);
  }

  function run() {
    if (!account || worker.current) return;
    const cached = cache.current.get(key);
    if (cached) { setResult({ key, value: cached }); setSelected(cached.recommendations[0]?.id ?? ''); setSelectedShift(0); setSaved(false); setError(''); return; }
    setRunning(true); setError(''); setSaved(false); setProgress({ done: 0, total: 0, label: '' }); partial.current = null;
    try {
      const w = new Worker(new URL('../../lib/base/accountOptimizer.worker.ts', import.meta.url));
      worker.current = w;
      // The search keeps to its chosen time; this only catches a first stage that overruns on a very large roster.
      deadline.current = setTimeout(() => {
        if (worker.current !== w) return;
        stop('The search ran past its time without a first plan. Turn off Compare standard layouts to search only your base, then try again.');
      }, (searchMinutes + 3) * 60 * 1000);
      w.onmessage = (event: MessageEvent<{ progress?: typeof progress; partial?: AccountOptimizerResult; result?: AccountOptimizerResult; error?: string }>) => {
        if (worker.current !== w) return;
        if (event.data.partial) partial.current = event.data.partial;
        if (event.data.progress) { setProgress(event.data.progress); return; }
        if (deadline.current) clearTimeout(deadline.current);
        setRunning(false); w.terminate(); worker.current = null;
        if (event.data.result) show(event.data.result, true);
        else setError(event.data.error ?? 'Could not optimize this account.');
      };
      w.onerror = () => { if (worker.current !== w) return; stop('The optimizer stopped. Try again.'); };
      w.postMessage(input);
    } catch { worker.current?.terminate(); worker.current = null; if (deadline.current) clearTimeout(deadline.current); setRunning(false); setError('Could not start the optimizer. Reload and try again.'); }
  }

  function roomTile(room: FacilityDef) {
    const staff = recommendation!.plan.shifts[selectedShift].assignments[room.id]?.filter(s => !!s) ?? [];
    const product = recommendation!.products[room.id];
    return <section key={room.id} className={`base-room-surface base-overview-${room.kind} ${styles.room}${staff.length > 3 ? ` ${styles.wideRoom}` : ''}`} aria-label={`${names[room.id]}, level ${room.level}`}>
      <div className={styles.roomHeading}><strong className="base-room-surface-label">{names[room.id]}</strong><span>Lv{room.level}</span></div>
      <span className={styles.roomProduct}>{product === 'Precious Metals' ? 'Gold' : product === 'Battle Records' ? 'EXP' : room.kind === 'tradingPost' ? 'LMD' : room.kind === 'dormitory' ? 'Resting' : room.kind === 'powerPlant' ? 'Power' : 'Support'}</span>
      {staff.length ? <ul className={styles.portraits} style={{ gridTemplateColumns: `repeat(${staff.length}, minmax(0, 1fr))` }}>{staff.map(slot => {
        const op = byName.get(slot.operatorName);
        const progress = `${slot.eliteLevel === 'Elite 2' ? 'E2' : slot.eliteLevel === 'Elite 1' ? 'E1' : 'E0'} Lv${slot.level}`;
        return <li key={slot.operatorName} title={`${slot.operatorName} · ${progress}`}>
          {op && <Image src={getOperatorIconPath(op)} alt="" width={44} height={44} sizes="44px" decoding="async" />}
          <span className={styles.operatorName}>{slot.operatorName}</span><span className={styles.operatorLevel}>{progress}</span>
        </li>;
      })}</ul> : <p className="hint">No workers this shift</p>}
    </section>;
  }

  return <div className={styles.workspace}>
    <p className="hint">Beta · Calculations and simulations run on your PC. Processing time varies with your hardware.</p>
    {!account && <p className="sub"><Link href="/account">Import your account</Link> to recommend teams from your owned operators and their unlocked skills.</p>}
    <div className={styles.controls}>
      <div><span className="label-tag">Logins per day</span><SegmentedControl label="Optimizer logins per day" value={loginInterval} onChange={onInterval} options={[24, 12, 8, 6].map(h => ({ value: h, label: `${24 / h}×`, ariaLabel: `${24 / h} times a day, every ${h} hours` }))} /></div>
      <label>Priority<StyledSelect label="Optimizer priority" value={objective} onChange={v => setObjective(v as typeof objective)} options={[{ value: 'balanced', label: 'LMD + EXP' }, { value: 'lmd', label: 'LMD' }, { value: 'exp', label: 'EXP' }]} /></label>
      <label>Search time<StyledSelect label="Optimizer search time" value={String(searchMinutes)} onChange={v => { lastSearchMinutes = Number(v); setSearchMinutes(lastSearchMinutes); }} options={[{ value: '1', label: '1 min' }, { value: '2', label: '2 min' }, { value: '5', label: '5 min' }, { value: '10', label: '10 min' }]} /></label>
      <label>First login<StyledSelect label="First login hour" value={String(startHour)} onChange={v => { setStartHour(Number(v)); setSaved(false); }} options={Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, '0')}:00` }))} /></label>
    </div>
    <div className={styles.actions}>
      <label className="check"><input type="checkbox" checked={compareLayouts} onChange={e => setCompareLayouts(e.target.checked)} disabled={!account?.base} />Compare standard layouts</label>
      <button type="button" className="primary btn-sm" disabled={!account || running || !Object.keys(owned.roster).length} onClick={run}>{running ? 'Optimizing…' : 'Recommend layout'}</button>
      {running && <button type="button" className="ghost" title="Stop the search; the best plan found so far is kept" onClick={() => stop()}>Stop</button>}
    </div>
    <div className={styles.actions}>
      <label className={styles.gold}>Outside gold / day<NumberInput className="number-input" aria-label="External gold per day" min={0} max={1000} step="0.1" value={externalGold} onChange={e => setExternalGold(Number(e.target.value))} /></label>
      <InfoPopover label="Yield assumptions">
        <p>Logins are {loginInterval}h apart; collect at each login. LMD is capped by gold supply.</p>
        <p>LMD + EXP maximizes their sum, not equal output. Standard layouts assume their listed upgrades and furnished dorms.</p>
        <p>Estimated repeating rotation; some skills are approximate. Includes drones; excludes crafting and training.</p>
        <p><a href="https://docs.google.com/spreadsheets/d/1at6UTVRJXpiDlo7JucaQZdVQCSOZhAgN5jo4ZDFEWhk/edit?gid=2051144322#gid=2051144322" target="_blank" rel="noreferrer">Production reference ↗</a></p>
      </InfoPopover>
    </div>
    {owned.assumed.length > 0 && <p className="hint">Missing imported progress for {owned.assumed.length} operators: using E0 level 1.</p>}
    {running && <div role="status" aria-live="polite"><progress max={progress.total || 1} value={progress.done} /> {progress.total ? `${progress.done}% · ${progress.label}` : 'Preparing search…'}{partial.current?.recommendations[0] && <> · best so far {whole(partial.current.recommendations[0].score)} / day</>}<span className={styles.localNote}>Runs on your device for up to {searchMinutes} min; it stops early when nothing improves.</span></div>}
    {error && <p role="alert">{error}</p>}
    {result && !current && !running && <p role="status">Settings or account changed. Run the optimizer again.</p>}
    {current && !running && <>
      {!recommendation ? <p role="status">No repeating rotation without exhausted workers was found. Try more frequent logins or compare layouts.</p> : <>
        <div className={styles.resultHeader}>
          <div><span className="label-tag">Best found for your roster</span><h3>{recommendation.label}</h3></div>
          {current.recommendations.length > 1 && <StyledSelect label="Recommended layout" value={recommendation.id} onChange={id => { setSelected(id); setSelectedShift(0); setSaved(false); }} options={current.recommendations.map((r, i) => ({ value: r.id, label: `${r.label}${i === 0 ? ' · Recommended' : ''}` }))} />}
          <button type="button" className="primary btn-sm" disabled={saved} onClick={() => { setError(''); if (onApply(recommendation, startHour, externalGold)) setSaved(true); else setError('Could not save the rotation. Browser storage is unavailable or full.'); }}>{saved ? 'Rotation active' : 'Use as rotation'}</button>
        </div>
        <dl className={styles.yields} aria-label="Recommended daily yields">
          <div><dt>LMD / day</dt><dd>{whole(recommendation.output.lmd)}</dd></div>
          <div><dt>EXP / day</dt><dd>{whole(recommendation.output.exp)}</dd></div>
          <div><dt>Gold / day</dt><dd>{recommendation.output.goldMade.toFixed(1)}</dd></div>
        </dl>
        <div className={styles.planFacts}><span>Change staff every <strong>{recommendation.plan.stepHours}h</strong></span><span>Factories: <strong>{Object.values(recommendation.products).filter(v => v === 'Precious Metals').length} gold / {Object.values(recommendation.products).filter(v => v === 'Battle Records').length} EXP</strong></span><span>Cycle: <strong>{recommendation.plan.simulation.cycleHours}h</strong></span><span>{placed - resting} working · {resting} resting · {Object.keys(owned.roster).length - placed} unassigned</span>{recommendation.output.lmd + 0.1 < recommendation.plan.simulation.perDay.lmd && <span>LMD limited by gold supply</span>}</div>
        {current.recommendations.length > 1 && <details><summary>Compare layouts</summary><div className={styles.tableScroll}><table className={styles.table} aria-label="Recommended layouts"><thead><tr><th>Layout</th><th>LMD / day</th><th>EXP / day</th></tr></thead><tbody>
          {current.recommendations.map((r, i) => <tr key={r.id}><th><button type="button" className="filter-chip" aria-pressed={recommendation.id === r.id} onClick={() => { setSelected(r.id); setSelectedShift(0); setSaved(false); }}>{r.label}</button>{i === 0 && <span className={styles.best}>Recommended</span>}</th><td>{whole(r.output.lmd)}</td><td>{whole(r.output.exp)}</td></tr>)}
        </tbody></table></div></details>}
        <div className={styles.shiftToolbar}><SegmentedControl label="Optimizer shift" value={selectedShift} onChange={setSelectedShift} options={recommendation.plan.shifts.map((_, index) => ({ value: index, label: `Shift ${index + 1}`, title: rotationClock(startHour, index * recommendation.plan.stepHours) }))} /><h3>{rotationClock(startHour, selectedShift * recommendation.plan.stepHours)} → {rotationClock(startHour, (selectedShift + 1) * recommendation.plan.stepHours)}</h3></div>
        <div className={styles.roomGrid} aria-label="Production teams">{facilities.filter(f => ['tradingPost', 'factory', 'powerPlant'].includes(f.kind) && f.capacity).map(roomTile)}</div>
        <details open><summary>Support and resting teams</summary><div className={styles.roomGrid} aria-label="Support and resting teams">{facilities.filter(f => !['tradingPost', 'factory', 'powerPlant'].includes(f.kind) && recommendation.plan.shifts[selectedShift].assignments[f.id]?.some(Boolean)).map(roomTile)}</div></details>
        <div className={styles.actions}><span>Gold balance and saving</span><InfoPopover label="Gold balance and saving"><p>Gold demand: {recommendation.plan.simulation.perDay.goldSold.toFixed(1)} / day. {recommendation.output.lmd + 0.1 < recommendation.plan.simulation.perDay.lmd ? 'Add outside gold to fund full trading output.' : 'Supply covers sales.'}</p><p>Saving replaces your active timetable and keeps saved setups. The calculator keeps this gold limit. Only dorm workers recover.</p></InfoPopover></div>
        <details><summary>Search details and limits</summary><p>{current.searched} plans scored; {current.rejected} rotations excluded for exhaustion or failing to repeat.</p><ul>{[...new Set([...recommendation.plan.notes, ...recommendation.plan.simulation.warnings, ...recommendation.plan.simulation.caveats])].map(note => <li key={note}>{note}</li>)}</ul></details>
      </>}
    </>}
  </div>;
}
