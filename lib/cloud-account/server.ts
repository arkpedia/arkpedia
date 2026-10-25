import { betterAuth } from 'better-auth';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { D1Database } from '@cloudflare/workers-types';

export interface AccountsEnv {
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
