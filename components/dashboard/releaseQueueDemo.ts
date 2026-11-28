import type { ReleaseQueueClient } from './ReleaseQueue';
import type { ReleaseQueueData } from '@/lib/release-queue/types';

export const releaseQueueDemoKey = 'arkpedia:release-queue-demo-v1';
const source = 'a'.repeat(40);
const sample: ReleaseQueueData = {
  entries: [{
    source, base: 'b'.repeat(40), fingerprint: 'c'.repeat(64), pullRequest: 172,
    title: 'Sample planner and schedule update', paths: ['/pull-planner', '/schedule'],
    note: null, state: 'queued', target: null, revision: 1,
  }, {
    source: 'd'.repeat(40), base: 'b'.repeat(40), fingerprint: 'e'.repeat(64), pullRequest: 172,
    title: 'Earlier sample planner build', paths: ['/pull-planner'],
    note: null, state: 'queued', target: null, revision: 1,
  }],
  previewSource: source,
  readySource: source,
  publicationEnabled: true,
};

function readDemo(): ReleaseQueueData {
  try {
    const data: ReleaseQueueData = JSON.parse(sessionStorage.getItem(releaseQueueDemoKey) ?? 'null') ?? sample;
    return { ...data, readySource: data.previewSource };
  }
  catch { return sample; }
}

export const releaseQueueDemo: ReleaseQueueClient = {
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
      sessionStorage.setItem(releaseQueueDemoKey, JSON.stringify(next));
      return next;
    }
    const row = data.entries.find(entry => entry.source === command.source && entry.revision === command.revision);
    if (!row) throw Error('Refresh the demo queue.');
    const published = command.action === 'refresh' && row.state === 'publishing';
    const next: ReleaseQueueData = { ...data, entries: data.entries.map(entry => {
      if (published && entry.pullRequest === row.pullRequest && (entry.state === 'queued' || entry.state === 'needs_review')) {
        return { ...entry, state: 'superseded' };
      }
      if (entry.source !== row.source) return entry;
      const revision = entry.revision + 1;
      if (command.action === 'save-note' && entry.state === 'queued') return { ...entry, revision, note: command.note };
      if (command.action === 'publish' && entry.state === 'queued') return { ...entry, revision, state: 'publishing' };
      if (published) return { ...entry, revision, state: 'published' };
      return entry;
    }) };
    sessionStorage.setItem(releaseQueueDemoKey, JSON.stringify(next));
    return next;
  },
};
