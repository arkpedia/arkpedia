import type { NextApiRequest, NextApiResponse } from 'next';
import { acceptDashboardWrite, dashboardDatabase, dashboardRequest } from '@/lib/dashboard/access';
import { releaseGateway } from '@/lib/release-queue/github';
import { releaseQueue, ReleaseConflict } from '@/lib/release-queue/service';
import { releaseStore } from '@/lib/release-queue/store';
import { reviewPaths, validCommit, type ReleaseCommand } from '@/lib/release-queue/types';
import { parseUpdate } from '@/lib/site-updates/store';

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

function parseCommand(value: unknown): ReleaseCommand {
  if (!value || typeof value !== 'object') throw Error('Choose a release action.');
  const { action, pullRequest, paths, source, revision, note } = value as Record<string, unknown>;
  if (action === 'queue') {
    if (typeof pullRequest !== 'number' || !Number.isSafeInteger(pullRequest) || pullRequest < 1) throw Error('Enter a pull request number.');
    return { action, pullRequest, paths: reviewPaths(paths) };
  }
  if (!validCommit(source) || typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1) {
    throw Error('Choose a valid release revision.');
  }
  if (action === 'save-note') return { action, source, revision, note: note === null ? null : parseUpdate(note) };
  if (action === 'publish' || action === 'refresh') return { action, source, revision };
  throw Error('Choose a release action.');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await dashboardRequest(req, res);
  if (!session) return;
  const { env, actor } = session;
  const db = dashboardDatabase(env);
  if (!db || env.ARKPEDIA_DEPLOYMENT_ROLE !== 'production') return res.status(503).json({ error: 'Release storage is unavailable.' });
  const service = releaseQueue(releaseStore(db), releaseGateway(env.ARKPEDIA_RELEASE_QUEUE_GITHUB_TOKEN));
  if (req.method === 'GET') {
    try { return res.json(await service.snapshot()); }
    catch { return res.status(503).json({ error: 'Release storage is unavailable.' }); }
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).end();
  }
  if (!acceptDashboardWrite(env, req, res)) return;
  let command: ReleaseCommand;
  try { command = parseCommand(req.body); }
  catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid release action.' }); }
  try { return res.json(await service.run(command, actor)); }
  catch (error) {
    // Do not expose D1 or provider internals. Gate messages contain only fixed
    // review reasons; errors from storage can contain unpublished draft content.
    const message = error instanceof Error && (
      error instanceof ReleaseConflict || /^GitHub (?:returned HTTP|did not confirm|has not confirmed)\b/.test(error.message) ||
      /^(?:Preview must match|Preview refused:|Pilot release refused:|The merge tree differs|The build identity )/.test(error.message)
    ) ? error.message : 'Could not confirm the release action. Refresh to check the queue.';
    return res.status(error instanceof ReleaseConflict ? 409 : 503).json({ error: message });
  }
}
