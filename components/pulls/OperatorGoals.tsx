import StyledSelect from '@/components/ui/StyledSelect';
import Rarity, { rarityLevel } from '@/components/ui/Rarity';
import { SectionHelp } from './SectionHelp';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { BannerGoal } from '@/lib/pulls/plan';
import { formatChance, selectedRules, type BannerOdds, type OddsRequest, type OddsResult, type OddsOperator } from '@/lib/pulls/probability';
import { ContentImg } from '@/components/content/ContentImage';
import { formatNumber } from '@/lib/pulls/format';

export function OperatorGoals({ rules, goal, onChange, children, inactive = false }: { children: ReactNode; inactive?: boolean; rules?: BannerOdds; goal: BannerGoal; onChange: (goal: BannerGoal) => void }) {
  const [response, setResponse] = useState<{ key: string; result?: OddsResult; error?: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const request = useMemo<OddsRequest | null>(() => !inactive && rules && goal.targets?.length ? { rules, pulls: goal.pulls, targets: goal.targets, spark: goal.includeSpark ?? false, roster: goal.rateUpRoster } : null, [inactive, rules, goal.pulls, goal.targets, goal.includeSpark, goal.rateUpRoster]);
  const key = JSON.stringify(request);
  useEffect(() => {
    if (!request) return;
    let worker: Worker | undefined;
    const timer = window.setTimeout(() => {
      try {
        worker = new Worker(new URL('../../lib/pulls/probability.worker.ts', import.meta.url));
        worker.onmessage = event => { setResponse({ key, ...event.data }); worker?.terminate(); };
        worker.onerror = () => { setResponse({ key, error: 'Could not calculate chances. Retry to calculate again.' }); worker?.terminate(); };
        worker.postMessage(request);
      } catch { setResponse({ key, error: 'Could not start the probability calculator. Retry or reload this page.' }); }
    }, 300);
    return () => { clearTimeout(timer); worker?.terminate(); };
  }, [key, request, retry]);
  if (!rules) return <>{children}<p className="hint">Operator chances are not available yet: this banner’s rules need verification.</p></>;
  const targets = goal.targets || [];
  const roster = goal.rateUpRoster || [];
  let available = rules.operators;
  let rosterError = '';
  if (rules.type === 'orienteering') {
    try { available = selectedRules({ rules, pulls: goal.pulls, targets, spark: false, roster }).operators; }
    catch { available = []; rosterError = 'Choose three 6★ and three 5★ operators to set this banner’s rate-up roster.'; }
  }
  const result = response?.key === key ? response.result : undefined;
  const error = response?.key === key ? response.error : undefined;
  const toggle = (name: string) => onChange({ ...goal, targets: targets.some(t => t.name === name) ? targets.filter(t => t.name !== name) : [...targets, { name, copies: 1 }] });
  const chip = (op: OddsOperator, selection: string[], onClick: () => void, disabled = false) => <button key={op.name} type="button" className="btn-bare pulls-operator-choice" aria-pressed={selection.includes(op.name)} onClick={onClick} disabled={disabled}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {op.icon && <ContentImg src={op.icon} alt="" width="42" height="42" />}
    <span><b>{op.name}</b><small><Rarity n={rarityLevel(op.rarity)} />{op.spark ? ` · ${op.spark} spark tokens` : ''}</small></span>
  </button>;
  const goalChip = (op: OddsOperator) => {
    const target = targets.find(t => t.name === op.name);
    return <div key={op.name} className="pulls-operator-option" data-selected={!!target}>
      {chip(op, targets.map(t => t.name), () => toggle(op.name))}
      {target && <div className="pulls-operator-count">
        <StyledSelect label={`Copies wanted of ${op.name}`} menuMinWidth={72} value={String(target.copies)}
          onChange={value => onChange({ ...goal, targets: targets.map(t => t.name === op.name ? { ...t, copies: Number(value) } : t) })}
          options={[1, 2, 3, 4, 5, 6].map(n => ({ value: String(n), label: String(n) }))} />
      </div>}
    </div>;
  };
  return <section className="pulls-operator-goals" aria-label={`Operator goals for ${goal.banner}`}>
    <div className="pulls-goals-heading"><h3>Operator goals</h3>    <SectionHelp title={`Operator goals: ${goal.banner.replace(/^\[[^\]]*\]\s*/, '')}`} links={[{label: 'pull budget', selector: `input[aria-label=${JSON.stringify(`Pull budget for ${goal.banner}`)}]`}]}>
      <ol><li>{rules.type === 'orienteering' ? 'Choose three rate-up operators of each rarity, then select your goals.' : 'Select one or more operators.'}</li><li>Choose how many new copies you want.</li><li>Enter your pull budget to compare individual and combined chances.</li></ol>
      <p>Individual rows show at least the listed number of new copies. With sparking, each row spends all spark tokens on that operator. The combined chance shares one spark token balance across all your goals.</p>
      {rules.type === 'limited' && <p>One pull earns one spark token. Exchange costs appear on each operator. The extra {rules.bonus} at 300 pulls is always included, even with sparking off.</p>}
      <details className="pulls-help-rules"><summary>Calculation rules &amp; sources</summary>
      <p>Calculated by tracking pity, banner guarantees and copy counts together, without simulated runs. Only rule-backed guarantees display 100%.</p>

      <p className="hint">Assumes a fresh banner: zero starting pity, no previous pulls, and the first-ten 5★-or-higher guarantee unused. Each banner is calculated independently; Standard pity carried from another banner is not included. Counts mean new copies, excluding operators you already own. All budgeted pulls are spent, even after reaching a goal.</p>
      <p className="hint">6★ starts at 2%. After 50 misses, pull 51 is 4%, then +2 percentage points per miss, up to 100% on pull 99. Any 6★ resets pity. Base 5★ is 8%; this model scales the non-6★ rarity rates proportionally as pity rises.</p>
      {rules.type === 'single' && <p className="hint">Featured 6★: 50% of 6★ rolls. Featured 5★ operators share 50% of 5★ rolls. After 150 consecutive misses of the featured 6★, the next 6★ is featured; this safety net can trigger once on this banner.</p>}
      {rules.type === 'crossover' && <p className="hint">Crossover banners guarantee the featured 6★ within every 120 pulls, resetting when obtained. If no featured 5★ comes in the first 50 pulls, the next 5★ is featured. With two featured 5★, the next 5★ after the first of them is the other one, once. The featured 6★ has 50% of 6★ rolls; the featured 5★ share 50% of 5★ rolls.</p>}
      {rules.type === 'orienteering' && <p className="hint">Only your three chosen 6★ operators can appear, equally likely. Your chosen 5★ operators share 60% of 5★ rolls; the rest of the Standard 5★ pool shares 40%.</p>}
      {rules.type === 'limited' && <><p className="hint">The two featured 6★ operators share 70% equally. Returning limiteds use their listed weight within the remaining 30%; boosted returning operators have five times an ordinary operator’s weight. Featured 5★ shares 50% of 5★ rolls.</p><p className="hint">Uses this banner’s published CN exchange roster with a projected Global ordinary pool. Global roster changes may change returning-operator odds. Shop costs and the 300-pull gift are tied to this specific banner.</p><details><summary>Projected ordinary 6★ pool ({rules.ordinarySix?.length})</summary><p className="hint">{rules.ordinarySix?.join(' · ')}</p></details></>}
      <p className="hint">Upcoming Global banners use the published CN rules. {rules.sources.map((source, i) => <a key={source} href={source} target="_blank" rel="noreferrer">Official rules{i ? ` ${i + 1}` : ''} (CN)</a>)}</p>
      </details>
    </SectionHelp></div>
    <div className="pulls-goals-layout">
    <div className="pulls-goals-inputs">
    {rules.type === 'orienteering' && <details className="pulls-odds-details" open={available.length === 0 ? true : undefined}>
      <summary>Set rate-up roster ({roster.length}/6)</summary>
      {[6, 5].map(rarity => <div key={rarity}><p className="hint"><Rarity n={rarityLevel(rarity)} /> · {rules.operators.filter(op => op.rarity === rarity && roster.includes(op.name)).length}/3 selected</p><div className="pulls-operator-choices">{rules.operators.filter(op => op.rarity === rarity).map(op => chip(op, roster, () => {
        const next = roster.includes(op.name) ? roster.filter(n => n !== op.name) : [...roster, op.name];
        onChange({ ...goal, rateUpRoster: next, targets: targets.filter(t => next.includes(t.name)) });
      }, !roster.includes(op.name) && rules.operators.filter(o => o.rarity === rarity && roster.includes(o.name)).length >= 3))}</div></div>)}
    </details>}
    {rosterError ? <p className="hint">{rosterError}</p> : <>
      <div className="pulls-operator-choices pulls-goal-choices">{available.filter(op => op.kind === 'featured').map(goalChip)}</div>
      {available.some(op => op.kind === 'returning') && <details className="pulls-odds-details"><summary>Returning limited operators</summary><div className="pulls-operator-choices pulls-goal-choices">{available.filter(op => op.kind === 'returning').map(goalChip)}</div></details>}
    </>}
    {rules.type === 'limited' && <label className="check pulls-ticket-used"><input type="checkbox" checked={goal.includeSpark ?? false} onChange={event => onChange({ ...goal, includeSpark: event.target.checked })} />Include sparking</label>}
    </div>
    <div className="pulls-goals-outcome">
    {children}
    {inactive ? null : targets.length > 0 ? (
      <div className="pulls-odds-result" aria-live="polite" aria-busy={!result && !error}>
        {error ? <p className="pulls-plan-warning">{error} <button type="button" className="ghost btn-sm" onClick={() => setRetry(n => n + 1)}>Retry</button></p> : result ? <>
          <div className="pulls-odds-headline"><span>{targets.length > 1 ? 'All goals' : 'Goal chance'}<small>Calculated · {formatNumber(goal.pulls)} pulls · 0 pity</small></span><strong>{formatChance(result.all)}</strong></div>
          <details className="pulls-odds-details pulls-copy-details" open={detailsOpen} onToggle={event => setDetailsOpen(event.currentTarget.open)}>
          <summary>{goal.includeSpark && rules.type === 'limited' ? 'Chance when prioritising each operator' : 'Chances per operator'}</summary>
          <p className="hint pulls-note">{goal.includeSpark && rules.type === 'limited' && <>Each row can use the full spark budget. All goals share it. </>}At least N new copies{goal.includeSpark && rules.type === 'limited' ? ' · each operator prioritized' : ''}</p>
          {targets.map((target, i) => <div className="pulls-copy-row" key={target.name}><b>{target.name}</b><dl>{result.copies[i].map((chance, j) => <div key={j}><dt>{j + 1}{j === 0 ? ' copy' : ' copies'}</dt><dd>{formatChance(chance)}</dd></div>)}</dl></div>)}
          </details>
        </> : <p className="hint pulls-note">Calculating chances…</p>}
      </div>
    ) : <div className="pulls-odds-empty">Select an operator to see your chances.</div>}
    </div>
    </div>
  </section>;
}
