import type { NextApiRequest, NextApiResponse } from 'next';
import { accountAuth, accountsEnv, type AccountsEnv } from './server';
import { accountReturnPath } from './navigation';

const ORIGIN = 'https://www.arkpedia.net';
const CALLBACK = 'net.arkpedia.mobile://auth';
const PROOF = /^[A-Za-z0-9_-]{43}$/;
type Flow = { challenge: string; provider: 'google' | 'discord'; mode: 'sign-in' | 'link' | 'confirm' | 'delete'; returnPath: string; owner?: string; token?: string };
export async function nativeAuthChallenge(verifier: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return Buffer.from(hash).toString('base64url');
}
const random = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
const requestHeaders = (req: NextApiRequest) => new Headers({ cookie: req.headers.cookie ?? '', origin: ORIGIN });

/** Browser OAuth and WebView sessions use separate cookie stores. Only native code holds
 * the verifier and imports the resulting HttpOnly cookie; URLs contain no session token.
 * Custom schemes work when sideloading without an associated-domain entitlement. */
export function createNativeAuthHandler(resolveEnv: () => AccountsEnv | null = accountsEnv) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const env = resolveEnv();
    if (!env || env.ARKPEDIA_DEPLOYMENT_ROLE !== 'production' || env.ARKPEDIA_ACCOUNTS_ENABLED !== '1' || env.ARKPEDIA_AUTH_URL !== ORIGIN) return res.status(404).end();
    const action = req.query.action;
    const post = action === 'begin' || action === 'redeem';
    if (!['begin', 'start', 'complete', 'redeem'].includes(String(action))) return res.status(404).end();
    if (req.method !== (post ? 'POST' : 'GET')) return res.status(405).end();
    if (post && (req.headers.origin !== ORIGIN || !req.headers['content-type']?.startsWith('application/json'))) return res.status(403).end();
    const auth = accountAuth(env);
    const adapter = (await auth.$context).internalAdapter;
    const save = (key: string, value: unknown, seconds: number) => adapter.createVerificationValue({ identifier: key, value: JSON.stringify(value), expiresAt: new Date(Date.now() + seconds * 1000) });
    const take = async <T,>(key: string): Promise<T | null> => {
      const row = await adapter.consumeVerificationValue(key);
      return row ? JSON.parse(row.value) as T : null;
    };
    const cookies: string[] = [];
    const collectCookies = (response: Response) => { cookies.push(...response.headers.getSetCookie()); };
    const redirect = (url: string) => {
      if (cookies.length) res.setHeader('Set-Cookie', cookies);
      return res.redirect(302, url);
    };
    try {
      if (action === 'begin') {
        // Bound unauthenticated initiation using the existing rate-limit table. Hash IPs
        // with the deployment secret; never store raw addresses in handoff records.
        const key = 'native-auth:' + await nativeAuthChallenge(env.BETTER_AUTH_SECRET + ':' + (req.headers['cf-connecting-ip'] ?? 'unknown'));
        const now = Date.now();
        const allowed = await env.ARKPEDIA_ACCOUNTS_DB.prepare(`INSERT INTO rateLimit (id, "key", count, lastRequest) VALUES (?, ?, 1, ?)
          ON CONFLICT("key") DO UPDATE SET count = CASE WHEN lastRequest < ? THEN 1 ELSE count + 1 END,
          lastRequest = CASE WHEN lastRequest < ? THEN excluded.lastRequest ELSE lastRequest END
          WHERE lastRequest < ? OR count < 12 RETURNING count`).bind(key, key, now, now - 60_000, now - 60_000, now - 60_000).first();
        if (!allowed) { res.setHeader('Retry-After', '60'); return res.status(429).json({ error: 'Please wait a minute before trying again.' }); }
        const { challenge, provider, mode, returnPath } = req.body ?? {};
        if (typeof challenge !== 'string' || !PROOF.test(challenge) || !['google', 'discord'].includes(provider) || !['sign-in', 'link', 'confirm', 'delete'].includes(mode)) return res.status(400).end();
        const flow: Flow = { challenge, provider, mode, returnPath: mode === 'delete' ? '/account?confirm=delete' : mode === 'link' || mode === 'confirm' ? '/account?settings=logins' : accountReturnPath(typeof returnPath === 'string' ? returnPath.slice(0, 2048) : '/account') };
        if (mode !== 'sign-in') {
          const headers = requestHeaders(req);
          const session = await auth.api.getSession({ headers });
          if (!session) return res.status(401).end();
          flow.owner = session.user.id;
          if (mode === 'link') {
            if (Date.now() - new Date(session.session.createdAt).getTime() >= 5 * 60_000) return res.status(403).json({ code: 'SESSION_NOT_FRESH' });
            flow.token = (await auth.api.generateOneTimeToken({ headers })).token;
          }
        }
        const state = random();
        await save('native-launch:' + state, flow, 60);
        return res.json({ state });
      }
      const state = action === 'redeem' ? req.body?.state : req.query.state;
      if (typeof state !== 'string' || !PROOF.test(state)) return res.status(400).end();
      if (action === 'start') {
        const flow = await take<Flow>('native-launch:' + state);
        if (!flow) return redirect(CALLBACK + '?state=' + state + '&error=expired');
        const headers = new Headers({ origin: ORIGIN });
        if (flow.mode === 'link' && flow.token) {
          const restored = await auth.api.verifyOneTimeToken({ body: { token: flow.token }, asResponse: true });
          if (!restored.ok) throw Error('Session expired');
          collectCookies(restored);
          headers.set('cookie', cookies.map(cookie => cookie.split(';', 1)[0]).join('; '));
        }
        delete flow.token;
        // Only Better Auth's successful OAuth callback reveals this extra ticket.
        // Knowing a launch state must not let someone complete with a browser's old cookie.
        const ticket = random();
        const callbackURL = ORIGIN + '/api/native-auth/complete?state=' + state + '&ticket=' + ticket;
        const body = { provider: flow.provider, callbackURL, errorCallbackURL: ORIGIN + '/api/native-auth/complete?state=' + state + '&failed=1', disableRedirect: true };
        const response = flow.mode === 'link'
          ? await auth.api.linkSocialAccount({ body, headers, asResponse: true })
          : await auth.api.signInSocial({ body, headers, asResponse: true });
        const result = await response.json() as { url?: string };
        if (!response.ok || !result.url || new URL(result.url).protocol !== 'https:') throw Error('Provider unavailable');
        collectCookies(response);
        await save('native-complete:' + state + ':' + ticket, flow, 600);
        return redirect(result.url);
      }
      if (action === 'complete') {
        const ticket = req.query.ticket;
        if (req.query.failed || typeof ticket !== 'string' || !PROOF.test(ticket)) return redirect(CALLBACK + '?state=' + state + '&error=failed');
        const flow = await take<Flow>('native-complete:' + state + ':' + ticket);
        if (!flow) return redirect(CALLBACK + '?state=' + state + '&error=failed');
        const headers = requestHeaders(req);
        const session = await auth.api.getSession({ headers });
        if (!session || (flow.owner && session.user.id !== flow.owner)) return redirect(CALLBACK + '?state=' + state + '&error=account');
        const { token } = await auth.api.generateOneTimeToken({ headers });
        await save('native-handoff:' + state + ':' + flow.challenge, { token, returnPath: flow.returnPath }, 60);
        return redirect(CALLBACK + '?state=' + state);
      }
      const verifier = req.body?.verifier;
      if (typeof verifier !== 'string' || !PROOF.test(verifier)) return res.status(400).end();
      // Wrong proofs cannot consume the real handoff. Both this record and Better Auth's
      // token are consumed atomically, so a callback cannot be replayed on another device.
      const handoff = await take<{ token: string; returnPath: string }>('native-handoff:' + state + ':' + await nativeAuthChallenge(verifier));
      if (!handoff) return res.status(401).json({ error: 'Sign-in expired. Please try again.' });
      const response = await auth.api.verifyOneTimeToken({ body: { token: handoff.token }, asResponse: true });
      if (!response.ok) return res.status(401).end();
      collectCookies(response);
      res.setHeader('Set-Cookie', cookies);
      return res.json({ returnPath: handoff.returnPath });
    } catch {
      // Never include provider errors, credentials, cookies or verifier values in logs.
      const state = req.query.state;
      if (!post && typeof state === 'string' && PROOF.test(state)) return redirect(CALLBACK + '?state=' + state + '&error=failed');
      return res.status(503).json({ error: 'Sign-in could not finish. Please try again.' });
    }
  };
}
