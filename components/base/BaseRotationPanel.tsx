import NumberInput from '@/components/ui/NumberInput';
import StyledSelect from '@/components/ui/StyledSelect';
import type { SavedBasePreset } from '@/lib/base/baseSavedPresets';
import { analyzeRotation, rotationClock, type BaseRotationPlan, type RotationStage } from '@/lib/base/baseRotationPlan';
/** Combine operators that exhaust at the same time without hiding any names. */
function groupWarnings(warnings: string[]) {
  const groups = new Map<string, { prefix: string; hours: string; names: string[] }>();
  const other: string[] = [];
  for (const warning of warnings) {
    const match = warning.match(/^(Next cycle: )?(.+) reaches 0 Morale after ([\d.]+h)\.$/);
    if (!match) { other.push(warning); continue; }
    const [, prefix = '', name, hours] = match, key = prefix + hours;
    const group = groups.get(key) ?? { prefix, hours, names: [] };
    group.names.push(name); groups.set(key, group);
  }
  return [...other, ...Array.from(groups.values(), g => `${g.prefix}${g.names.join(', ')} ${g.names.length > 1 ? 'reach' : 'reaches'} 0 Morale after ${g.hours}.`)];
}
export default function BaseRotationPanel({ plan, onChange, presets, onLoad, initialMorale, owned, stages: calculatedStages }: {
  plan: BaseRotationPlan; onChange: (plan: BaseRotationPlan) => void; presets: SavedBasePreset[];
  onLoad: (id: string) => void; initialMorale: Record<string, number>; owned?: ReadonlySet<string>; imported: boolean;
  stages?: RotationStage[];
}) {
  const stages = calculatedStages ?? analyzeRotation(plan, presets, initialMorale, owned), duration = plan.shifts.reduce((n, s) => n + s.hours, 0);
  return <section className="base-rotation-plan" aria-label="Rotation timetable">
    <div className="base-rotation-heading"><label>Starts at <StyledSelect label="Rotation start time" value={String(plan.startHour)} onChange={v => onChange({ ...plan, startHour: Number(v) })} options={Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, '0')}:00` }))} /></label><span className="hint">Repeats every {duration || '—'}h</span></div>
    <p className="hint">Repeating rotation after morale settles. Collect at every login and shift change.</p>
    {!presets.length && <p className="base-empty-message">Save your working team and resting team as presets, then add them as shifts.</p>}
    {plan.shifts.map((shift, index) => {
      const stage = stages[index], repeat = stages[index + plan.shifts.length];
      const warnings = groupWarnings([...new Set([...(stage?.warnings ?? []), ...(repeat?.warnings ?? []).map(w => `Next cycle: ${w}`)])]);
      return <div className="base-rotation-shift" key={shift.id}>
        <div className="base-rotation-time"><strong>{rotationClock(plan.startHour, stage.start)}</strong><span>to {rotationClock(plan.startHour, stage.end)}</span></div>
        <StyledSelect label={`Shift ${index + 1} setup`} placeholder="Choose saved setup" value={shift.presetId} onChange={v => onChange({ ...plan, shifts: plan.shifts.map(s => s.id === shift.id ? { ...s, presetId: v } : s) })} options={presets.map(p => ({ value: p.id, label: p.name }))} />
        <label>Hours <NumberInput aria-label={`Shift ${index + 1} hours`} min="0.25" max="48" step="0.25" value={shift.hours} onChange={e => { const hours = Number(e.target.value); if (hours >= 0.25 && hours <= 48) onChange({ ...plan, shifts: plan.shifts.map(s => s.id === shift.id ? { ...s, hours } : s) }); }} /></label>
        <button type="button" className="ghost" disabled={!presets.some(p => p.id === shift.presetId)} onClick={() => onLoad(shift.presetId)}>View in base</button>
        <button type="button" className="ghost btn-icon" disabled={index === 0} aria-label={`Move shift ${index + 1} earlier`} onClick={() => { const shifts = [...plan.shifts]; [shifts[index - 1], shifts[index]] = [shifts[index], shifts[index - 1]]; onChange({ ...plan, shifts }); }}>↑</button>
        <button type="button" className="ghost" aria-label={`Remove shift ${index + 1}`} onClick={() => onChange({ ...plan, shifts: plan.shifts.filter(s => s.id !== shift.id) })}>Remove</button>
        <p className="base-rotation-team">Working: {stage.working.join(', ') || '—'}<br />Resting: {stage.resting.join(', ') || '—'}</p>
        {warnings.length > 0 && <ul className="base-rotation-warnings">{warnings.map(w => <li key={w}>{w}</li>)}</ul>}
      </div>;
    })}
    <button type="button" className="primary" disabled={!presets.length || plan.shifts.length >= 24} onClick={() => onChange({ ...plan, shifts: [...plan.shifts, { id: crypto.randomUUID(), presetId: presets[0]?.id ?? '', hours: 12 }] })}>Add shift</button>
  </section>;
}
