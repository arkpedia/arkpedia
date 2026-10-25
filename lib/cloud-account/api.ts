import type { NextApiRequest, NextApiResponse } from 'next';
import { fromNodeHeaders } from 'better-auth/node';
import { accountAuth, accountsEnv, type AccountsEnv } from './server';
import { assertNoCredentials, GAME_KEYS, validateCloudData, type CloudData } from './data';
import { archiveStatements, readArchives } from './archive';
import type { AccountProfile } from './profile';
import { archiveFromAccount, mergePullArchives, parsePullArchives } from '@/lib/account/pullArchive';
import { parseAccount, parseOtherAccounts } from '@/lib/account/accountStore';

export interface CloudSave { revision: number; archiveRevision: number; gameSync: number; historySync: number; personalSync: number; paused: number; payload: string; updatedAt: string }
export function createCloudAccountHandler(resolveEnv: () => AccountsEnv | null = accountsEnv) {
return async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('Vary', 'Cookie');
  const env = resolveEnv();
  if (!env) return res.status(503).json({ error: 'Cloud accounts are not configured on this deployment.' });
  if (!['GET', 'PUT', 'POST', 'PATCH', 'DELETE'].includes(req.method ?? '')) { res.setHeader('Allow', 'GET, PUT, POST, PATCH, DELETE'); return res.status(405).end(); }
  if (req.method !== 'GET' && (req.headers.origin !== env.ARKPEDIA_AUTH_URL || !req.headers['content-type']?.startsWith('application/json'))) return res.status(403).json({ error: 'This request must come from Arkpedia.' });
  try {
    const auth = accountAuth(env), session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    const providers = [env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? 'google' : null, env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET ? 'discord' : null].filter(Boolean);
    if (!session) return res.status(401).json({ error: 'Sign in to Arkpedia to continue.', providers });
    const db = env.ARKPEDIA_ACCOUNTS_DB, userId = session.user.id;
    await db.prepare('INSERT INTO cloud_save (userId, updatedAt) VALUES (?, ?) ON CONFLICT(userId) DO NOTHING').bind(userId, new Date().toISOString()).run();
    let row = await db.prepare('SELECT revision, archiveRevision, gameSync, historySync, personalSync, paused, payload, updatedAt FROM cloud_save WHERE userId = ?').bind(userId).first<CloudSave>();
    if (!row) throw new Error('Missing save');
    // Capture imports written by an older Worker between migration and deployment.
    // A snapshot is projected only after its history is durably merged in the same transaction.
    if (req.method === 'GET' && row.historySync && row.gameSync) {
      const snapshot = JSON.parse(row.payload);
      const legacy = [parseAccount(JSON.stringify(snapshot.arkpediaAccount) ?? null), ...Object.values(parseOtherAccounts(JSON.stringify(snapshot.arkpediaOtherAccounts) ?? null))].flatMap(archiveFromAccount);
      if (legacy.length) {
        const mutationId = crypto.randomUUID(), updatedAt = new Date().toISOString();
        const projected = validateCloudData(snapshot, true, !!row.personalSync);
        const results = await db.batch([
          db.prepare('UPDATE cloud_save SET payload = ?, mutationId = ?, revision = revision + 1, archiveRevision = archiveRevision + 1, updatedAt = ? WHERE userId = ? AND revision = ?').bind(JSON.stringify(projected), mutationId, updatedAt, userId, row.revision),
          ...archiveStatements(db, userId, mutationId, legacy),
        ]);
        if (results[0].meta.changes !== 1) return res.status(409).json({ error: 'Another device updated your archive. Retry sync; existing pulls are safe.' });
        row = { ...row, payload: JSON.stringify(projected), revision: row.revision + 1, archiveRevision: row.archiveRevision + 1, updatedAt };
      }
    }
    const profile = await db.prepare('SELECT username, friendTag, friendServer FROM arkpedia_profile WHERE userId = ?').bind(userId).first<AccountProfile>();
    const saved = async (revision: number, archiveRevision: number, data: CloudData, personalSync: boolean, historySync: boolean, gameSync: boolean, paused: boolean, unchanged = false) =>
      ({ revision, archiveRevision, data, personalSync, historySync, gameSync, paused, ...(unchanged ? { archivesUnchanged: true } : { archives: historySync ? await readArchives(db, userId) : [] }) });
    if (req.method === 'GET') {
      const linkedAccounts = (await db.prepare('SELECT id, providerId FROM account WHERE userId = ?').bind(userId).all<{ id: string; providerId: string }>()).results;
      return res.json({ user: { id: userId, name: profile?.username ?? '' }, profile, linkedAccounts,
        linkedProviders: linkedAccounts.map(p => p.providerId), providers, updatedAt: row.updatedAt,
        ...await saved(row.revision, row.archiveRevision, JSON.parse(row.payload), !!row.personalSync, !!row.historySync, !!row.gameSync, !!row.paused,
          req.headers['x-arkpedia-archive-owner'] === userId && req.headers['x-arkpedia-archive-revision'] === String(row.archiveRevision)) });
    }
    if (req.body?.owner !== userId) return res.status(409).json({ error: 'Your signed-in account changed. Reload before syncing.' });
    const withdrawing = req.method === 'PATCH' && ['gameSync', 'historySync', 'personalSync'].some(key => req.body[key] === false) && !['gameSync', 'historySync', 'personalSync'].some(key => req.body[key] === true);
    if (!profile && req.method !== 'DELETE' && !withdrawing) return res.status(428).json({ error: 'Choose your Arkpedia username before syncing.' });
    if (!Number.isSafeInteger(req.body?.revision) || req.body.revision < 0) return res.status(400).json({ error: 'A save revision is required.' });
    if (req.body.revision !== row.revision) return res.status(409).json({ error: 'Your cloud save changed on another device. Retry with its latest revision.' });
    let personalSync = !!row.personalSync, historySync = !!row.historySync, gameSync = !!row.gameSync;
    let data = JSON.parse(row.payload) as CloudData;
    if (req.method === 'PATCH') {
      const keys = ['personalSync', 'historySync', 'gameSync'];
      if (!keys.some(key => Object.hasOwn(req.body, key)) || keys.some(key => Object.hasOwn(req.body, key) && typeof req.body[key] !== 'boolean')) return res.status(400).json({ error: 'Choose which data to save.' });
      personalSync = req.body.personalSync ?? personalSync; historySync = req.body.historySync ?? historySync; gameSync = req.body.gameSync ?? gameSync;
      // Older open tabs offered one imported-data choice, explicitly including history.
      if (req.body.savingVersion !== 2 && typeof req.body.gameSync === 'boolean' && req.body.historySync === undefined) historySync = req.body.gameSync;
      data = validateCloudData(Object.fromEntries(Object.entries(data).filter(([key]) => GAME_KEYS.has(key) ? gameSync : personalSync)), gameSync, personalSync);
    } else if (req.method === 'DELETE') { data = {}; gameSync = false; historySync = false; }
    else if (req.method === 'PUT') {
      try { data = validateCloudData(req.body.data, gameSync, personalSync); }
      catch (error) { return res.status(400).json({ error: (error as Error).message }); }
    }
    if (req.method === 'POST' && (!historySync || row.paused)) return res.status(403).json({ error: 'Enable pull-history saving and resume cloud saving first.' });
    const mutationId = crypto.randomUUID(), updatedAt = new Date().toISOString();
    const paused = req.method === 'DELETE' ? true : req.method === 'PUT' ? false : !!row.paused;
    const statements = [];
    if (!historySync) statements.push(db.prepare('DELETE FROM pull_archive_account WHERE userId = ? AND EXISTS (SELECT 1 FROM cloud_save WHERE userId = ? AND mutationId = ?)').bind(userId, userId, mutationId));
    let archiveInput = req.body.archives;
    try {
      if (archiveInput !== undefined) { assertNoCredentials(archiveInput); archiveInput = parsePullArchives(archiveInput); }
      if (req.method === 'PUT' && historySync && gameSync) {
        const oldTabRecords = [parseAccount(JSON.stringify(req.body.data?.arkpediaAccount) ?? null), ...Object.values(parseOtherAccounts(JSON.stringify(req.body.data?.arkpediaOtherAccounts) ?? null))];
        const legacy = oldTabRecords.flatMap(archiveFromAccount);
        if (legacy.length) archiveInput = mergePullArchives(archiveInput ?? [], legacy);
      }
    } catch (error) { return res.status(400).json({ error: (error as Error).message }); }
    if (archiveInput !== undefined) {
      if (!historySync || paused) return res.status(403).json({ error: 'Saving pull history requires your permission.' });
      try {
        assertNoCredentials(archiveInput);
        if (new TextEncoder().encode(JSON.stringify(archiveInput)).length > 900_000) throw new Error('Archive upload is too large. Send smaller batches; existing cloud history is unchanged.');
        statements.push(...archiveStatements(db, userId, mutationId, archiveInput));
      } catch (error) { return res.status(400).json({ error: (error as Error).message }); }
    }
    const archiveRevision = row.archiveRevision + (archiveInput !== undefined || historySync !== !!row.historySync || req.method === 'DELETE' ? 1 : 0);
    statements.unshift(db.prepare('UPDATE cloud_save SET payload = ?, personalSync = ?, historySync = ?, gameSync = ?, paused = ?, mutationId = ?, revision = revision + 1, archiveRevision = ?, updatedAt = ? WHERE userId = ? AND revision = ?')
      .bind(JSON.stringify(data), personalSync ? 1 : 0, historySync ? 1 : 0, gameSync ? 1 : 0, paused ? 1 : 0, mutationId, archiveRevision, updatedAt, userId, row.revision));
    const results = await db.batch(statements);
    if (results[0].meta.changes !== 1) return res.status(409).json({ error: 'Your cloud save changed on another device. Retry with its latest revision.' });
    return res.json({ ...await saved(row.revision + 1, archiveRevision, data, personalSync, historySync, gameSync, paused), updatedAt });
  } catch { return res.status(503).json({ error: 'Your cloud save is temporarily unavailable. Your browser data has not been changed.' }); }
};
}
