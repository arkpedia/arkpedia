import { betterAuth } from 'better-auth';
import { oneTimeToken } from 'better-auth/plugins/one-time-token';
import { APIError, createAuthMiddleware, getAuthoritativeSessionFromCtx } from 'better-auth/api';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { D1Database } from '@cloudflare/workers-types';

export interface AccountsEnv {
  ARKPEDIA_DEPLOYMENT_ROLE?: string;
  ARKPEDIA_ACCOUNTS_ENABLED?: string;
  ARKPEDIA_ACCOUNTS_DB: D1Database;
  ARKPEDIA_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
}

export function accountsEnv(): AccountsEnv | null {
  try {
    const env = getCloudflareContext().env as unknown as AccountsEnv;
    // Production needs explicit enablement and the canonical auth origin. Preview
    // retains its own bindings, cookies and database. Unknown roles fail closed.
    const production = env.ARKPEDIA_DEPLOYMENT_ROLE === 'production'
      && env.ARKPEDIA_ACCOUNTS_ENABLED === '1'
      && env.ARKPEDIA_AUTH_URL === 'https://www.arkpedia.net';
    if (env.ARKPEDIA_DEPLOYMENT_ROLE !== 'staging' && !production) return null;
    if (!env.ARKPEDIA_ACCOUNTS_DB || !env.ARKPEDIA_AUTH_URL || !env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) return null;
    const url = new URL(env.ARKPEDIA_AUTH_URL);
    if (url.origin !== env.ARKPEDIA_AUTH_URL || (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname))) return null;
    return env;
  } catch { return null; }
}

// Construct inside the request: D1 bindings belong to this Worker invocation.
export function accountAuth(env: AccountsEnv) {
  return betterAuth({
    appName: 'Arkpedia',
    plugins: [oneTimeToken({ storeToken: 'hashed', expiresIn: 1, disableClientRequest: true })],
    hooks: { before: createAuthMiddleware(async ctx => {
      if (!['/link-social', '/revoke-other-sessions'].includes(ctx.path)) return;
      const session = await getAuthoritativeSessionFromCtx(ctx);
      if (!session) throw new APIError('UNAUTHORIZED', { code: 'UNAUTHORIZED', message: 'Sign in first.' });
      if (Date.now() - new Date(session.session.createdAt).getTime() >= 5 * 60_000) {
        throw new APIError('FORBIDDEN', { code: 'SESSION_NOT_FRESH', message: 'Confirm with an existing login before changing account access.' });
      }
    }) },
    baseURL: env.ARKPEDIA_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: env.ARKPEDIA_ACCOUNTS_DB,
    trustedOrigins: [env.ARKPEDIA_AUTH_URL],
    emailAndPassword: { enabled: false },
    databaseHooks: { user: { create: { before: async user => ({ data: { ...user, name: 'Arkpedia user', image: null } }) } } },
    socialProviders: {
      ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? { google: {
        clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET,
        accessType: 'online' as const, prompt: 'select_account' as const,
      } } : {}),
      ...(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET ? { discord: {
        clientId: env.DISCORD_CLIENT_ID, clientSecret: env.DISCORD_CLIENT_SECRET,
      } } : {}),
    },
    account: {
      accountLinking: { enabled: true, disableImplicitLinking: true, allowDifferentEmails: true, allowUnlinkingAll: false, updateUserInfoOnLink: false },
      encryptOAuthTokens: true,
    },
    session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24, freshAge: 60 * 5 },
    user: { deleteUser: { enabled: true } },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 60 },
    advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] }, cookiePrefix: 'arkpedia' },
    // Do not log callback payloads, provider tokens, or request headers.
    logger: { disabled: true },
  });
}
