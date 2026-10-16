import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import StyledSelect from '@/components/ui/StyledSelect';
import { devOnlyStaticProps } from '@/lib/dev/devOnly';
import styles from '@/components/dev/DevTools.module.css';

export const getStaticProps = devOnlyStaticProps;

type ExtractedSkill = { operator: string; skillName: string | null; eliteLevel: string | null; description: string | null };

export default function DevTools() {
  const [facilities, setFacilities] = useState<string[]>([]);
  const [facility, setFacility] = useState('');
  const [skills, setSkills] = useState<ExtractedSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('Loading facilities…');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/dev/extract-skills?facility=list', { signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.facilities) || !data.facilities.every((value: unknown) => typeof value === 'string')) {
          throw new Error(data.error || 'Could not read facilities.');
        }
        if (controller.signal.aborted) return;
        const list = data.facilities as string[];
        setFacilities(list);
        setFacility(list.includes('Factory') ? 'Factory' : list[0] ?? '');
        if (!list.length) { setStatus('No facilities found.'); setLoading(false); }
      })
      .catch(error => { if (!controller.signal.aborted) { setStatus(error instanceof Error ? error.message : String(error)); setLoading(false); } });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!facility) return;
    const controller = new AbortController();
    setLoading(true);
    setSkills([]);
    setStatus(`Loading ${facility} skills…`);
    fetch(`/api/dev/extract-skills?facility=${encodeURIComponent(facility)}`, { signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.skills)) throw new Error(data.error || 'Could not extract skills.');
        if (controller.signal.aborted) return;
        setSkills(data.skills);
        setStatus(`${data.skills.length} skills found for ${facility}.`);
      })
      .catch(error => { if (!controller.signal.aborted) setStatus(error instanceof Error ? error.message : String(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [facility]);

  const text = skills.map(skill => `${skill.operator}${skill.eliteLevel ? ` (${skill.eliteLevel})` : ''}\n${skill.skillName ?? ''}\n${skill.description ?? ''}`).join('\n\n');

  return <>
    <Head><title>Development tools — Arkpedia</title></Head>
    <PageHeader eyebrow="Rhodes Island // Local development" title="Development tools" sub="Edit records and publish artwork in their source repositories." />
    <main>
      <section className="op-section">
        <h2>Sources and tools</h2>
        <div className={styles.links}>
          <a className="ghost" href="https://github.com/arkpedia/arkpedia-data/tree/main/source">Game records</a>
          <a className="ghost" href="https://github.com/arkpedia/arkpedia-image-assets/blob/main/ADDING-ASSETS.md">Artwork</a>
          <Link className="ghost" href="/dev/ui">UI catalogue</Link>
          <Link className="ghost" href="/optimizer">Single-room optimizer</Link>
          <Link className="ghost" href="/bases/whole-base-optimizer">Whole-base optimizer</Link>
        </div>
      </section>
      <section className="op-section">
        <h2>Base skill extraction</h2>
        <div className={styles.controls}>
          <StyledSelect label="Facility" className={styles.facility} value={facility} options={facilities.map(value => ({ value, label: value }))} disabled={!facilities.length} onChange={setFacility} />
          <button type="button" className="ghost" disabled={loading || !text} onClick={async () => {
            try { await navigator.clipboard.writeText(text); setStatus('Copied to clipboard.'); }
            catch { setStatus('Select the text below to copy it.'); }
          }}>Copy all</button>
        </div>
        <p className={`hint ${styles.feedback}`} role="status">{status}</p>
        <textarea className={styles.output} aria-label="Extracted base skills" aria-busy={loading} readOnly value={text} onClick={event => event.currentTarget.select()} />
      </section>
    </main>
  </>;
}
