import type { ReleaseGateway } from './github';
import type { ReleaseStore } from './store';
import type { ReleaseCommand, ReleaseEntry, ReleaseQueueData } from './types';

export class ReleaseConflict extends Error {}

export function releaseQueue(store: ReleaseStore, gateway: ReleaseGateway) {
  async function snapshot(): Promise<ReleaseQueueData> {
    const [entries, previewSource] = await Promise.all([
      store.list(), gateway.identity('staging').then(info => info.source).catch(() => null),
    ]);
    return { entries, previewSource, publicationEnabled: gateway.enabled };
  }

  async function refresh(entry: ReleaseEntry) {
    if (entry.state !== 'publishing' || !entry.target) return;
    const [live, deployment] = await Promise.all([
      gateway.identity('production').catch(() => null),
      gateway.deployment(entry.target).catch(() => 'pending'),
    ]);
    if (deployment === 'failed') { await store.needsReview(entry); return; }
    if (live?.source === entry.target) {
      if (live.fingerprint !== entry.fingerprint) await store.needsReview(entry);
      else if (deployment === 'success') await store.finish(entry);
      return;
    }
    const main = await gateway.main().catch(() => null);
    if (main && main !== entry.base && main !== entry.target) await store.needsReview(entry);
  }

  async function publish(entry: ReleaseEntry, actor: string) {
    if (!gateway.enabled) throw new ReleaseConflict('Production publication is unavailable.');
    if (entry.state !== 'queued' && entry.state !== 'publishing') throw new ReleaseConflict('This release needs a fresh Preview.');
    if (entry.state === 'publishing' && await gateway.main() !== entry.base) {
      await refresh(entry);
      return;
    }
    const { candidate, target } = await gateway.review(entry.pullRequest, entry.paths);
    if (candidate.source !== entry.source || candidate.base !== entry.base || candidate.fingerprint !== entry.fingerprint ||
        (entry.target && entry.target !== target)) throw new ReleaseConflict('The reviewed Preview or its base changed. Queue the current build again.');
    // Commit intent before mutating GitHub. Retrying a lost response uses the
    // same immutable target without a forced update, so it cannot replace main.
    if (entry.state === 'queued' && !await store.start(entry, target, actor)) {
      throw new ReleaseConflict('The draft changed or another release is publishing. Refresh and try again.');
    }
    try {
      await gateway.advance(target);
    } catch (error) {
      const current = await store.read(entry.source);
      if (current && gateway.rejected(error)) {
        const main = await gateway.main().catch(() => null);
        if (main === entry.base) await store.returnToQueue(current);
        else if (main && main !== target) await store.needsReview(current);
      }
      throw Error('GitHub did not confirm publication. Check status before retrying.');
    }
  }

  async function run(command: ReleaseCommand, actor: string) {
    if (command.action === 'queue') {
      const { candidate } = await gateway.review(command.pullRequest, command.paths);
      await store.queue(candidate, actor);
      return snapshot();
    }
    const entry = await store.read(command.source);
    if (!entry || command.revision !== entry.revision) throw new ReleaseConflict('This release changed. Refresh before continuing.');
    if (command.action === 'save-note') {
      if (!await store.saveNote(entry, command.note, actor)) throw new ReleaseConflict('The release note can only be edited while queued.');
    } else if (command.action === 'publish') await publish(entry, actor);
    else await refresh(entry);
    return snapshot();
  }

  return { snapshot, run };
}
