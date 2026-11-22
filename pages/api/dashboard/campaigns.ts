import type { NextApiRequest, NextApiResponse } from 'next';
import { dashboardActor, dashboardDatabase, dashboardEnv, dashboardOrigin } from '@/lib/dashboard/access';
import maintenance from './maintenance';
import { samePlacements } from '@/lib/sponsors/campaignSchedule';
import { editorCatalog, expireReaderCampaigns } from '@/lib/dashboard/campaignCatalog';
import { campaignHistory, EditConflict, InvalidEdit, invalidateCampaignEdits, recentCampaignChanges, saveCampaign } from '@/lib/dashboard/campaignStore';

export const config = { api: { bodyParser: { sizeLimit: '2mb' } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST' && req.body?.action === 'refresh') return maintenance(req, res);
  res.setHeader('Cache-Control', 'private, no-store');
  const env = dashboardEnv();
  const actor = await dashboardActor(env, req.headers);
  if (!actor) return void res.status(403).end();
  const db = dashboardDatabase(env);
  if (!db) return void res.status(503).json({ error: 'Campaign storage is unavailable.' });
  try {
    if (req.method === 'GET' && req.query.view === 'recent') return void res.json(await recentCampaignChanges(db));
    if (req.method === 'GET' && req.query.history !== undefined) {
      const { history, before } = req.query;
      if (typeof history !== 'string' || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(history) ||
          (before !== undefined && (typeof before !== 'string' || !/^[1-9][0-9]*$/.test(before) || !Number.isSafeInteger(Number(before))))) {
        throw new InvalidEdit('Invalid campaign history request.');
      }
      return void res.json(await campaignHistory(db, history, before === undefined ? undefined : Number(before)));
    }
    if (req.method === 'POST') {
      if (req.headers.origin !== dashboardOrigin(env)?.origin) return void res.status(403).end();
      if (req.headers['content-type']?.split(';')[0] !== 'application/json') return void res.status(415).end();
      if (req.body?.creating || req.body?.campaign?.eventActivityId) {
        const { base, edits, events } = await editorCatalog();
        const id = req.body.id;
        const incoming = req.body.campaign;
        if (req.body.creating && (base.some(c => c.id === id) || edits.some(edit => edit.id === id))) {
          throw new InvalidEdit('This campaign ID is already in use. Choose a new ID.');
        }
        if (incoming?.eventActivityId) {
          const prior = edits.find(e => e.id === id)?.campaign;
          if (!events.some(e => e.id === incoming.eventActivityId) && prior?.eventActivityId !== incoming.eventActivityId) {
            throw new InvalidEdit('Choose an event from the published Global schedule.');
          }
          if (incoming.replacesCampaignId) {
            const outgoing = edits.find(e => e.id === incoming.replacesCampaignId)?.campaign ?? base.find(c => c.id === incoming.replacesCampaignId);
            if (!outgoing || !Array.isArray(incoming.placements) || !samePlacements(outgoing, incoming)) {
              throw new InvalidEdit('Choose a campaign with the same placements to replace.');
            }
          }
        }
      }
      await saveCampaign(db, actor, req.body);
      invalidateCampaignEdits();
      expireReaderCampaigns();
    } else if (req.method !== 'GET') return void res.status(405).end();
    res.json(await editorCatalog());
  } catch (error) {
    if (error instanceof InvalidEdit) return void res.status(400).json({ error: error.message });
    if (error instanceof EditConflict) return void res.status(409).json({ error: 'Another editor saved this campaign. Reload before saving.' });
    res.status(503).json({ error: 'Campaign storage is unavailable. Reload to check the latest revision.' });
  }
}
