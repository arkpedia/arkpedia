import DataLink from '@/components/account/DataLink';
import { useReleaseTable } from '@/lib/content/context';
import type { SuperMetaOperator } from '@/lib/selectors/scoring';
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
        for (const field of ['kukkikazeRating', 'communityRating', 'mainSkills'] as const) {
          if (typeof stored[field] === 'boolean') next[field] = stored[field];
        }
        for (const field of ['subSkills', 'likesIS', 'likesRA'] as const) next[field] = stored[field] === true;
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
  const { operators: superMeta } = useReleaseTable<{ operators: SuperMetaOperator[] }>('selector-super-meta');
  const automatic = selectorCoverage(candidates, ownedNames, superMeta);
  const [showScoring, setShowScoring] = useState(false);
  const coverageRows = [
    { key: 'arts', label: 'Lack Arts damage dealers', points: '+0.5', note: 'Account default: three or fewer owned 6★ Casters / Supporters combined.' },
    { key: 'trueDamage', label: 'Lack True damage dealers', points: '+0.5', note: 'Account default: no owned 6★ True damage dealer.' },
    { key: 'gameDestroyer', label: 'Lack super-meta operators', points: '+1', note: `Includes Kukkikaze ratings of 7.0+${superMeta.length ? ` plus ${new Intl.ListFormat('en', { type: 'conjunction' }).format(superMeta.map(op => op.name))}` : ''}.` },
    { key: 'reveal', label: 'Lack invisibility reveal', points: '+0.25', note: 'Base talents only; skills and module upgrades are excluded.' },
  ] as const;
  return <div className="selector-personalization">
    {([{ key: 'kukkikazeRating', label: 'Kukkikaze rating' }, { key: 'communityRating', label: 'Community average' }] as const).map(row => <div key={row.key} className="selector-personalization-row">
      <span>{row.label}</span>
      <SegmentedControl className="selector-personalization-choice" label={row.label} options={YES_NO} value={preferences[row.key] ? 'yes' : 'no'} onChange={value => onChange({ ...preferences, [row.key]: value === 'yes' })} />
    </div>)}
    <button type="button" className="ghost btn-sm" aria-expanded={showScoring} aria-controls="selector-rating-scale" onClick={() => setShowScoring(value => !value)}>See scoring</button>
    {showScoring && <div id="selector-rating-scale" className="selector-rating-scale">
      <div className="selector-rating-key"><span>Rating → points</span><span>Maximum +2</span></div>
      <dl className="selector-rating-grid" aria-label="Rating to recommendation points">
        {Array.from({ length: 15 }, (_, index) => (58 + index) / 10).map(rating => <div key={rating}>
          <dt>{rating.toFixed(1)}</dt><dd>{pointLabel(ratingPoints(rating)!)}</dd>
        </div>)}
      </dl>
      <p className="hint">Community averages round to one decimal. If only one rating is available, its points double. Turning a rating off removes its points without doubling the other rating.</p>
    </div>}
    {([{ key: 'mainSkills', label: 'Main priority skills', points: '+0.5' }, { key: 'subSkills', label: 'Sub priority skills', points: '+0.1' }] as const).map(row => <div key={row.key} className="selector-personalization-row">
      <span>{row.label} <span className="hint">· {row.points} / skill</span></span>
      <SegmentedControl className="selector-personalization-choice" label={row.label} options={YES_NO} value={preferences[row.key] ? 'yes' : 'no'} onChange={value => onChange({ ...preferences, [row.key]: value === 'yes' })} />
    </div>)}
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
    {([{ key: 'likesIS', label: 'I like IS', module: 'IS' }, { key: 'likesRA', label: 'I like RA', module: 'RA' }] as const).map(row => <div key={row.key} className="selector-personalization-row">
      <span>{row.label} <span className="hint">· {row.module} module +1</span></span>
      <SegmentedControl className="selector-personalization-choice" label={row.label} options={YES_NO} value={preferences[row.key] ? 'yes' : 'no'} onChange={value => onChange({ ...preferences, [row.key]: value === 'yes' })} />
    </div>)}
    <div className="selector-personalization-footer">
      <button type="button" className="ghost btn-sm" onClick={() => onChange({ ...DEFAULT_SELECTOR_PREFERENCES })}>{ownedNames === null ? 'Reset defaults' : 'Use account defaults'}</button>
      {ownedNames === null && <DataLink />}
    </div>
  </div>;
}
