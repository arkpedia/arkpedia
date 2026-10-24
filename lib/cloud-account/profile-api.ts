import type { NextApiRequest, NextApiResponse } from 'next';
import { fromNodeHeaders } from 'better-auth/node';
import { accountAuth, accountsEnv, type AccountsEnv } from './server';
import { normalizeUsername, validateProfile } from './profile';

export function createAccountProfileHandler(resolveEnv: () => AccountsEnv | null = accountsEnv) {
  return async function handler(req: NextApiRequest, res: NextApiResponse) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Cookie');
    const env = resolveEnv();
    if (!env) return res.status(503).json({ error: 'Accounts are unavailable on this deployment.' });
    if (!['GET', 'PUT', 'DELETE'].includes(req.method ?? '')) {
      res.setHeader('Allow', 'GET, PUT, DELETE'); return res.status(405).end();
    }
    if (req.method !== 'GET' && (req.headers.origin !== env.ARKPEDIA_AUTH_URL || !req.headers['content-type']?.startsWith('application/json'))) {
      return res.status(403).json({ error: 'This request must come from Arkpedia.' });
    }
    try {
      const auth = accountAuth(env), headers = fromNodeHeaders(req.headers);
      const session = await auth.api.getSession({ headers });
      if (!session) return res.status(401).json({ error: 'Sign in to choose your username.' });
      const db = env.ARKPEDIA_ACCOUNTS_DB, owner = session.user.id;
      if (req.method === 'GET') {
        let normalized;
        try { normalized = normalizeUsername(req.query.username); }
        catch (error) { return res.status(400).json({ error: (error as Error).message }); }
        const taken = await db.prepare('SELECT userId FROM arkpedia_profile WHERE usernameKey = ?').bind(normalized.key).first<{ userId: string }>();
        return res.json({ available: !taken || taken.userId === owner, username: normalized.username });
      }
      if (req.body?.owner !== owner) return res.status(409).json({ error: 'Your signed-in account changed. Reopen account settings.' });
      if (req.method === 'DELETE') {
        const current = await db.prepare('SELECT username FROM arkpedia_profile WHERE userId = ?').bind(owner).first<{ username: string }>();
        if (req.body.confirmation !== (current?.username ?? 'DELETE')) return res.status(400).json({ error: 'Type the confirmation exactly before deleting your account.' });
        try {
          const deleted = await auth.api.deleteUser({ headers, body: { callbackURL: `${env.ARKPEDIA_AUTH_URL}/account` }, returnHeaders: true });
          res.setHeader('Set-Cookie', deleted.headers.getSetCookie());
          return res.json({ deleted: true });
        } catch (error) {
          const failure = error as { statusCode?: number; body?: { code?: string } };
          const needsLogin = failure.statusCode === 401 || failure.statusCode === 403 || failure.body?.code === 'SESSION_EXPIRED';
          return res.status(needsLogin ? 403 : 503).json({ error: needsLogin
            ? 'Confirm with your login provider, then try deleting again.' : 'Account deletion could not finish. Try again when the service is available.' });
        }
      }
      let profile;
      try { profile = validateProfile(req.body); }
      catch (error) { return res.status(400).json({ error: (error as Error).message }); }
      try {
        // D1 batch is transactional. The unique key settles concurrent claims server-side.
        await db.batch([
          db.prepare('INSERT INTO arkpedia_profile (userId, username, usernameKey, friendTag, friendServer, updatedAt) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(userId) DO UPDATE SET username = excluded.username, usernameKey = excluded.usernameKey, friendTag = excluded.friendTag, friendServer = excluded.friendServer, updatedAt = excluded.updatedAt')
            .bind(owner, profile.username, profile.key, profile.friendTag, profile.friendServer, new Date().toISOString()),
          db.prepare('UPDATE "user" SET name = ?, image = NULL, updatedAt = ? WHERE id = ?').bind(profile.username, new Date().toISOString(), owner),
        ]);
      } catch (error) {
        if (/unique|constraint.*username/i.test(String(error))) return res.status(409).json({ error: 'That username was just taken. Choose another.' });
        throw error;
      }
      return res.json({ profile: { username: profile.username, friendTag: profile.friendTag, friendServer: profile.friendServer } });
    } catch { return res.status(503).json({ error: 'Your profile could not be saved. Your account and saves are unchanged.' }); }
  };
}
