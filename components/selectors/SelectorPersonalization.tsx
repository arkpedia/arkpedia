import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { DEFAULT_SELECTOR_PREFERENCES, pointLabel, ratingPoints, selectorCoverage, type SelectorCandidate, type SelectorPreferences } from '@/lib/selectors/scoring';

export function useSelectorPreferences(server: string | null) {
  const key = `arkpediaSelectorPreferences:${server ?? 'manual'}`;
  const [preferences, setPreferences] = useState(DEFAULT_SELECTOR_PREFERENCES);
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(key) ?? 'null');
      const next = { ...DEFAULT_SELECTOR_PREFERENCES };
      if (stored?.version === 1) {
        next.subSkills = stored.subSkills === true;
        for (const field of ['arts', 'trueDamage', 'gameDestroyer', 'reveal'] as const) {
          if (typeof stored[field] === 'boolean') next[field] = stored[field];
        }
      }
      setPreferences(next);
    } catch { setPreferences(DEFAULT_SELECTOR_PREFERENCES); }
  }, [key]);
  const change = useCallback((next: SelectorPreferences) => {
    setPreferences(next);
    try { localStorage.setItem(key, JSON.stringify({ version: 1, ...next })); } catch { /* Keep the choices for this visit. */ }
  }, [key]);
  return [preferences, change] as const;
}

const YES_NO = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] as const;
export default function SelectorPersonalization({ candidates, ownedNames, preferences, onChange }: {
  candidates: SelectorCandidate[];
  ownedNames: readonly string[] | null;
  preferences: SelectorPreferences;
  onChange: (next: SelectorPreferences) => void;
}) {
  const automatic = selectorCoverage(candidates, ownedNames);
  const [showScoring, setShowScoring] = useState(false);
  const coverageRows = [
    { key: 'arts', label: 'Lack Arts damage dealers', points: '+0.5', note: 'Account default: three or fewer owned 6★ Casters / Supporters combined.' },
    { key: 'trueDamage', label: 'Lack True damage dealers', points: '+0.5', note: 'Account default: no owned 6★ True damage dealer.' },
    { key: 'gameDestroyer', label: 'Lack super-meta operators', points: '+1', note: 'Includes Kukkikaze ratings of 7.0+ plus Ines, Ela, Lemuen, Eyjafjalla the Hvít Aska, Ascalon, Lappland the Decadenza, Logos, Yu, Ulpianus, Exusiai the New Covenant, Wiš\'adel and Tragodia.' },
    { key: 'reveal', label: 'Lack invisibility reveal', points: '+0.25', note: 'Base talents only; skills and module upgrades are excluded.' },
  ] as const;
  return <div className="selector-personalization">
    <div className="selector-personalization-row">
      <span>Kukkikaze rating <span className="hint">· Fixed</span></span>
      <button type="button" className="ghost btn-sm" aria-expanded={showScoring} aria-controls="selector-rating-scale" onClick={() => setShowScoring(value => !value)}>See scoring</button>
    </div>
    <div className="selector-personalization-row">
      <span>Community average <span className="hint">· Fixed</span></span>
      <button type="button" className="ghost btn-sm" aria-expanded={showScoring} aria-controls="selector-rating-scale" onClick={() => setShowScoring(value => !value)}>See scoring</button>
    </div>
    {showScoring && <div id="selector-rating-scale" className="selector-rating-scale">
      {Array.from({ length: 15 }, (_, index) => (58 + index) / 10).map(rating => <span key={rating}>{rating.toFixed(1)} → <strong>{pointLabel(ratingPoints(rating)!)}</strong></span>)}
      <p className="hint">Community averages round to one decimal. If only one rating is available, its points double.</p>
    </div>}
    <div className="selector-personalization-row"><span>Main priority skills <span className="hint">· Fixed</span></span><strong>+0.5 / skill</strong></div>
    <div className="selector-personalization-row">
      <span>Sub priority skills <span className="hint">· +0.1 / skill</span></span>
      <SegmentedControl className="selector-personalization-choice" label="Sub priority skill bonus" options={[{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }]} value={preferences.subSkills ? 'on' : 'off'} onChange={value => onChange({ ...preferences, subSkills: value === 'on' })} />
    </div>
    {coverageRows.map(row => {
      const value = preferences[row.key] ?? automatic[row.key];
      const source = preferences[row.key] !== null ? 'Manual' : ownedNames !== null ? value === null ? 'Account: unknown' : 'Account' : 'Default';
      return <div key={row.key} className="selector-personalization-row">
        <div title={row.note}><span>{row.label} <span className="hint">· {row.points}{source !== 'Default' ? ` · ${source}` : ''}</span></span>
          {row.key === 'arts' && <small className="hint">Account: ≤3 owned 6★ Casters / Supporters.</small>}
          {row.key === 'reveal' && <small className="hint">Talents only.</small>}
        </div>
        <SegmentedControl className="selector-personalization-choice" label={row.label} options={YES_NO} value={value === null ? '' : value ? 'yes' : 'no'} onChange={choice => onChange({ ...preferences, [row.key]: choice === 'yes' })} />
      </div>;
    })}
    <div className="selector-personalization-footer">
      <button type="button" className="ghost btn-sm" onClick={() => onChange({ ...DEFAULT_SELECTOR_PREFERENCES })}>{ownedNames === null ? 'Reset defaults' : 'Use account defaults'}</button>
      {ownedNames === null && <Link href="/account">Import account</Link>}
    </div>
  </div>;
}
