import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ContentImg } from '@/components/content/ContentImage';
import SearchInput from '@/components/ui/SearchInput';
import SegmentedControl from '@/components/ui/SegmentedControl';
import StyledSelect from '@/components/ui/StyledSelect';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import { operatorHref } from '@/lib/operators/operatorHref';
import { getOperatorSearchResults } from '@/lib/operators/operatorSearch';
import { useOperatorSearchCatalogue } from '@/lib/operators/useOperatorSearchCatalogue';
import type { GuideDocument, GuideField, GuideValue } from '@/lib/dashboard/operatorGuide';
import type { SkillRecommendationEntry } from '@/lib/operators/operatorTypes';
import styles from './CampaignEditor.module.css';

const blankEntry: SkillRecommendationEntry = { mastery: 'm3', priority: 'main', order: null, explanation: null };
const ranks = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'];
const priorities = [{ value: 'main', label: 'Main' }, { value: 'sub', label: 'Sub' }, { value: '', label: 'Unranked' }] as const;

function MasteryFields({ entries, change }: { entries: SkillRecommendationEntry[]; change: (next: SkillRecommendationEntry[]) => void }) {
  function update(index: number, patch: Partial<SkillRecommendationEntry>) {
    change(entries.map((entry, i) => i === index ? { ...entry, ...patch } : entry));
  }
  return <>
    {entries.map((entry, i) => <fieldset className={styles.guideEntry} key={i}>
      <legend className="label-tag">Recommendation {i + 1}</legend>
      <div className={styles.guideControls}>
        <div><span className="label-tag">Priority</span><SegmentedControl label="Priority" options={priorities}
          value={String(entry.priority) === 'primary' ? 'main' : entry.priority ?? ''} onChange={value => update(i, { priority: value || null })} /></div>
        <label>Mastery level<StyledSelect label="Mastery level" value={entry.mastery ?? ''} onChange={level => update(i, { mastery: level || null })}
          options={['', 'm1', 'm2', 'm3'].map(value => ({ value, label: value.toUpperCase() || 'Unspecified' }))} /></label>
        <label>Order<StyledSelect label="Order" value={entry.order ?? ''} onChange={order => update(i, { order: order || null })}
          options={[...new Set([...ranks, entry.order ?? ''])].map(value => ({ value, label: value || 'Unspecified' }))} /></label>
      </div>
      <label>Explanation<textarea className="prose-input" rows={4} maxLength={5000} value={entry.explanation ?? ''} onChange={e => update(i, { explanation: e.target.value || null })} /></label>
      <button className="ghost" type="button" onClick={() => change(entries.filter((_, index) => i !== index))}>Remove recommendation</button>
    </fieldset>)}
    <button className="btn-sm" type="button" disabled={entries.length >= 12} onClick={() => change([...entries, { ...blankEntry }])}>Add recommendation</button>
  </>;
}

function endpoint(name: string) { return '/api/dashboard/operator-guides?' + new URLSearchParams({ operator: name }); }

export default function OperatorGuides() {
  const { operators, loading } = useOperatorSearchCatalogue(true);
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [doc, setDoc] = useState<GuideDocument | null>(null);
  const [key, setKey] = useState('');
  const [kind, setKind] = useState<GuideValue['kind']>('mastery');
  const [draft, setDraft] = useState<GuideValue | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const field = doc?.fields.find(row => row.key === key);
  const value = draft ?? field?.value;
  const restoring = !!field?.customized && draft === field.source;
  const dirty = restoring || !!draft && JSON.stringify(draft) !== JSON.stringify(field?.value);
  const matches = getOperatorSearchResults(operators, query);
  const operator = operators.find(op => op.name === doc?.name);

  useEffect(() => {
    if (!name) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(endpoint(name), { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('Could not load this operator’s guides.');
        const result: GuideDocument = await response.json();
        if (controller.signal.aborted) return;
        setDoc(result); setKey(result.fields[0]?.key ?? ''); setKind(result.fields[0]?.source.kind ?? 'mastery');
      } catch {
        if (!controller.signal.aborted) setError('Could not load this operator’s guides.');
      }
    }
    void load();
    return () => controller.abort();
  }, [name, attempt]);

  function open(operator: string) {
    setQuery(''); setName(operator); setAttempt(n => n + 1); setDoc(null);
    setKey(''); setDraft(null); setMessage(''); setError('');
  }

  function selectField(next: string) {
    setKey(next); setDraft(null); setError(''); setMessage('');
  }

  async function publish(next: GuideValue | null) {
    if (!field || !doc || saving) return;
    setSaving(true); setMessage(''); setError('');
    try {
      const response = await fetch(endpoint(name), { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, revision: field.revision, source: field.source, value: next }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not confirm publication.');
      setDoc({ ...doc, fields: doc.fields.map(row => row.key === key ? result as GuideField : row) });
      setDraft(null); setMessage(result.refreshed ? 'Published to the operator page.' : 'Saved. The operator page will update on its next refresh.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not confirm publication.'); }
    finally { setSaving(false); }
  }

  return <main className={styles.workspace}>
    <div className={styles.guideLayout}>
      <aside className={'panel ' + styles.guideSidebar}>
        <h2 className="section-title">Find operator</h2>
        <fieldset disabled={saving || dirty} className={styles.guidePicker}>
          <SearchInput label="Search operators" placeholder="Search operators…" value={query} onChange={setQuery} suggestions={matches}
            getKey={op => op.name} renderSuggestion={op => <><ContentImg src={getOperatorIconPath(op)} width={32} height={32} alt="" />{op.name}</>} onPick={op => open(op.name)} suggestLabel="Matching operators"
            emptyText={loading ? 'Loading operators…' : 'No operators found.'} />
          {doc && <><div className={styles.operatorIdentity}>
            {operator && <ContentImg src={getOperatorIconPath(operator)} width={48} height={48} alt="" />}
            <h3 className="entity-title">{doc.name}</h3></div><SegmentedControl label="Guide type"
            options={([{ value: 'mastery', label: 'Mastery' }, { value: 'video', label: 'Video credits' }] as const).map(option =>
              ({ ...option, disabled: !doc.fields.some(row => row.source.kind === option.value) }))}
            value={kind} onChange={next => { setKind(next); selectField(doc.fields.find(row => row.source.kind === next)!.key); }} />
            <div className={styles.guideList}>
              {doc.fields.filter(row => row.source.kind === kind).map(row => <button type="button" key={row.key} className="filter-chip" aria-label={row.title} title={row.title} aria-pressed={row.key === key}
                onClick={() => selectField(row.key)}>
                {row.icon && <ContentImg src={row.icon} width={24} height={24} alt="" />}<span>{row.source.kind === 'mastery' ? <>Skill {row.key.slice(1)}<span className={styles.skillName}>{row.title.slice(('Skill ' + row.key.slice(1)).length)}</span></> : row.title}</span></button>)}</div></>}
        </fieldset>
      </aside>
      <section className={'panel ' + styles.guideBody}>
        {!field || !value ? <>{error ? <p role="alert">{error} <button type="button" className="btn-sm" onClick={() => open(name)}>Retry</button></p> :
          <p role="status">{!name ? 'Choose an operator to edit mastery priorities or guide video credits.' : !doc ? 'Loading guides…' : 'This operator has no skills or guide videos.'}</p>}</> :
        <><div className={styles.guideHeading}><h2 className="section-title">{field.title}</h2>
          <Link prefetch={false} className="ghost" href={operatorHref(name, value.kind === 'mastery' ? 'mastery' : 'guides')} target="_blank" rel="noopener">View operator ↗</Link></div>
          <form onSubmit={e => { e.preventDefault(); void publish(restoring ? null : value); }}>
            <fieldset className={styles.guideForm} disabled={saving}>
              {value.kind === 'mastery' ? <MasteryFields entries={value.entries} change={entries => setDraft({ kind: 'mastery', entries })} /> : <>
                <div><a className="ghost" href={'https://www.youtube.com/watch?v=' + encodeURIComponent(key.slice('video:'.length))} target="_blank" rel="noopener noreferrer">Watch video ↗</a></div>
                <label>Video title<input type="text" className="prose-input" value={value.label} maxLength={500} onChange={e => setDraft({ ...value, label: e.target.value })} /></label>
                <label>Creator credit<input type="text" className="prose-input" value={value.creator} maxLength={200} onChange={e => setDraft({ ...value, creator: e.target.value })} /></label>
              </>}
              <div className={styles.actions}><button type="submit" className="primary btn-sm" disabled={!dirty}>{restoring ? 'Restore source version' : 'Publish changes'}</button>
                {dirty && <button type="button" className="ghost" onClick={() => { setDraft(null); setError(''); }}>Discard edits</button>}
                {field.customized && !dirty && <button type="button" className="ghost" onClick={() => setDraft(field.source)}>Preview source version</button>}
              </div>
            </fieldset>
          </form>
          {error && <p role="alert">{error} <button className="btn-sm" onClick={() => { if (!dirty || window.confirm('Discard your edits and reload this guide?')) open(name); }}>Reload guide</button></p>}
          <p role="status">{saving ? 'Publishing…' : dirty ? 'Unpublished edits' : message}</p>
        </>}
      </section>
    </div>
  </main>;
}
