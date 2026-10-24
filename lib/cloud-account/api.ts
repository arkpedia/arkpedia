import type { NextApiRequest, NextApiResponse } from 'next';
import { fromNodeHeaders } from 'better-auth/node';
import { accountAuth, accountsEnv, type AccountsEnv } from '@/lib/cloud-account/server';
import { personalData, validateCloudData } from '@/lib/cloud-account/data';
import type { AccountProfile } from './profile';

export interface CloudSave { revision: number; gameSync: number; paused: number; payload: string; updatedAt: string }

export function createCloudAccountHandler(resolveEnv: () => AccountsEnv | null = accountsEnv) {
return async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Cookie');
  const env = resolveEnv();
  if (!env) return res.status(503).json({ error: 'Cloud accounts are not configured on this deployment.' });
  if (!['GET', 'PUT', 'PATCH', 'DELETE'].includes(req.method ?? '')) {
    res.setHeader('Allow', 'GET, PUT, PATCH, DELETE');
    return res.status(405).end();
  }
  if (req.method !== 'GET' && (req.headers.origin !== env.ARKPEDIA_AUTH_URL || !req.headers['content-type']?.startsWith('application/json'))) {
    return res.status(403).json({ error: 'This request must come from Arkpedia.' });
  }
  try {
    const auth = accountAuth(env);
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) return res.status(401).json({ error: 'Sign in to Arkpedia to continue.', providers:
      [env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? 'google' : null, env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET ? 'discord' : null].filter(Boolean) });
    const db = env.ARKPEDIA_ACCOUNTS_DB, userId = session.user.id;
    await db.prepare('INSERT INTO cloud_save (userId, updatedAt) VALUES (?, ?) ON CONFLICT(userId) DO NOTHING').bind(userId, new Date().toISOString()).run();
    const row = await db.prepare('SELECT revision, gameSync, paused, payload, updatedAt FROM cloud_save WHERE userId = ?').bind(userId).first<CloudSave>();
    if (!row) throw new Error('Missing save');
    const profile = await db.prepare('SELECT username, friendTag, friendServer FROM arkpedia_profile WHERE userId = ?').bind(userId).first<AccountProfile>();
    if (req.method === 'GET') {
      const linkedAccounts = (await db.prepare('SELECT id, providerId FROM account WHERE userId = ?').bind(userId).all<{ id: string; providerId: string }>()).results;
      return res.json({ user: { id: userId, name: profile?.username ?? '' }, profile, linkedAccounts,
      linkedProviders: linkedAccounts.map(p => p.providerId),
      providers: [env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? 'google' : null, env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET ? 'discord' : null].filter(Boolean),
      revision: row.revision, gameSync: !!row.gameSync, paused: !!row.paused, data: JSON.parse(row.payload), updatedAt: row.updatedAt });
    }
    // Bind a browser decision to its displayed identity as well as its revision.
    // A sign-in changed in another tab must never upload the old user's local save.
    if (req.body?.owner !== userId) return res.status(409).json({ error: 'Your signed-in account changed. Reload before syncing.' });
    if (!profile && req.method !== 'DELETE' && !(req.method === 'PATCH' && req.body?.gameSync === false)) return res.status(428).json({ error: 'Choose your Arkpedia username before syncing.' });
    if (!Number.isSafeInteger(req.body?.revision) || req.body.revision < 0) return res.status(400).json({ error: 'A save revision is required.' });
    if (req.body.revision !== row.revision) return res.status(409).json({ error: 'Your cloud save changed on another device. Choose which copy to keep.' });
    let gameSync = !!row.gameSync, data;
    if (req.method === 'PATCH') {
      if (typeof req.body.gameSync !== 'boolean') return res.status(400).json({ error: 'Choose whether to save imported game data.' });
      gameSync = req.body.gameSync;
      data = gameSync ? JSON.parse(row.payload) : personalData(JSON.parse(row.payload));
    } else if (req.method === 'DELETE') {
      gameSync = false;
      data = {};
    } else {
      try { data = validateCloudData(req.body.data, gameSync); }
      catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid save.' }); }
    }
    const paused = req.method === 'DELETE' ? true : req.method === 'PUT' ? false : !!row.paused;
    const result = await db.prepare('UPDATE cloud_save SET payload = ?, gameSync = ?, paused = ?, revision = revision + 1, updatedAt = ? WHERE userId = ? AND revision = ?')
      .bind(JSON.stringify(data), gameSync ? 1 : 0, paused ? 1 : 0, new Date().toISOString(), userId, row.revision).run();
    if (result.meta.changes !== 1) return res.status(409).json({ error: 'Your cloud save changed on another device. Choose which copy to keep.' });
    return res.json({ revision: row.revision + 1, gameSync, paused, data });
  } catch { return res.status(503).json({ error: 'Your cloud save is temporarily unavailable. Your browser data has not been changed.' }); }
};
}
