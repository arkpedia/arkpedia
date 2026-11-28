import type { GetStaticProps } from 'next';
import { useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import PageMeta from '@/components/layout/PageMeta';
import ReleaseQueue, { type ReleaseQueueClient } from '@/components/dashboard/ReleaseQueue';
import { type ReleaseQueueData } from '@/lib/release-queue/types';

const key = 'arkpedia:release-queue-demo-v1';
const source = 'a'.repeat(40);
const sample: ReleaseQueueData = {
  entries: [{
    source, base: 'b'.repeat(40), fingerprint: 'c'.repeat(64), pullRequest: 172,
    title: 'Sample planner and schedule update', paths: ['/pull-planner', '/schedule'],
    note: null, state: 'queued', target: null, revision: 1,
  }],
  previewSource: source,
  readySource: source,
  publicationEnabled: true,
};

function readDemo(): ReleaseQueueData {
  try {
    const data: ReleaseQueueData = JSON.parse(sessionStorage.getItem(key) ?? 'null') ?? sample;
    return { ...data, readySource: data.previewSource };
  }
  catch { return sample; }
}

const client: ReleaseQueueClient = {
  async load() { return readDemo(); },
  async send(command) {
    const data = readDemo();
    if (command.action === 'queue') {
      if (data.entries.some(entry => entry.pullRequest === command.pullRequest)) {
        throw Error('That sample PR is already queued. Choose a different number.');
      }
      const previewSource = command.pullRequest.toString(16).padStart(40, '0');
      const next: ReleaseQueueData = { ...data, previewSource, readySource: previewSource, entries: [{
        ...sample.entries[0], source: previewSource, pullRequest: command.pullRequest,
        title: `Sample release #${command.pullRequest}`, paths: command.paths,
      }, ...data.entries] };
      sessionStorage.setItem(key, JSON.stringify(next));
      return next;
    }
    const row = data.entries.find(entry => entry.source === command.source && entry.revision === command.revision);
    if (!row) throw Error('Refresh the demo queue.');
    const next: ReleaseQueueData = { ...data, entries: data.entries.map(entry => {
      if (entry.source !== row.source) return entry;
      const revision = entry.revision + 1;
      if (command.action === 'save-note' && entry.state === 'queued') return { ...entry, revision, note: command.note };
      if (command.action === 'publish' && entry.state === 'queued') return { ...entry, revision, state: 'publishing' };
      if (command.action === 'refresh' && entry.state === 'publishing') return { ...entry, revision, state: 'published' };
      return entry;
    }) };
    sessionStorage.setItem(key, JSON.stringify(next));
    return next;
  },
};

export default function ReleaseQueuePreview() {
  const [sampleRevision, setSampleRevision] = useState(0);
  return <>
    <PageMeta title="Release queue preview" description="Try reviewing and publishing a sample Arkpedia release." noindex />
    <PageHeader eyebrow="Arkpedia // Editorial workspace" title="Releases" slim compact actions={
      <button type="button" className="ghost btn-sm" onClick={() => {
        sessionStorage.removeItem(key);
        setSampleRevision(revision => revision + 1);
      }}>Reset demo</button>
    } />
    <ReleaseQueue key={sampleRevision} client={client} demo />
  </>;
}

export const getStaticProps: GetStaticProps = () =>
  process.env.ARKPEDIA_PREVIEW === '1' || process.env.NODE_ENV === 'development'
    ? { props: {} } : { notFound: true };
