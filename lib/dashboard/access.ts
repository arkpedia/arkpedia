import type { IncomingHttpHeaders } from 'node:http';
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { PatreonEnv } from '@/lib/patreon/sync.mjs';

interface DashboardEnv extends Partial<PatreonEnv> {
  NEXT_INC_CACHE_R2_BUCKET?: R2Bucket;
  ARKPEDIA_DASHBOARD_ORIGIN?: string;
  ARKPEDIA_DASHBOARD_ACCESS_ISSUER?: string;
  ARKPEDIA_DASHBOARD_ACCESS_AUD?: string;
}

export function dashboardEnv(): DashboardEnv {
  try {
    return getCloudflareContext().env as DashboardEnv;
  } catch {
    return {};
  }
}

export function dashboardOrigin(env: DashboardEnv): URL | null {
  try {
    const origin = new URL(env.ARKPEDIA_DASHBOARD_ORIGIN ?? '');
    const loopback = origin.hostname === 'localhost' || origin.hostname === '127.0.0.1';
    if (origin.protocol !== 'https:' && !(loopback && origin.protocol === 'http:')) return null;
    return origin.origin === env.ARKPEDIA_DASHBOARD_ORIGIN ? origin : null;
  } catch {
    return null;
  }
}

export function dashboardDatabase(env: DashboardEnv): D1Database | null {
  return dashboardOrigin(env) && env.ARKPEDIA_ACCOUNTS_DB || null;
}

const signingKeys = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function dashboardActor(env: DashboardEnv, headers: IncomingHttpHeaders): Promise<string | null> {
  const origin = dashboardOrigin(env);
  const issuer = env.ARKPEDIA_DASHBOARD_ACCESS_ISSUER;
  const audience = env.ARKPEDIA_DASHBOARD_ACCESS_AUD;
  const token = headers['cf-access-jwt-assertion'];
  if (!origin || headers.host !== origin.host || !issuer || !audience ||
      !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer) ||
      typeof token !== 'string' || token.length > 8192) return null;

  try {
    let keys = signingKeys.get(issuer);
    if (!keys) {
      keys = createRemoteJWKSet(new URL('/cdn-cgi/access/certs', issuer), { timeoutDuration: 3000 });
      signingKeys.set(issuer, keys);
    }
    const { payload } = await jwtVerify(token, keys, {
      algorithms: ['RS256'],
      issuer,
      audience,
      requiredClaims: ['exp', 'iat', 'sub', 'email'],
    });
    const email = payload.email;
    return typeof email === 'string' && email.length <= 254 && /^[^@\s]+@[^@\s]+$/.test(email) ? email : null;
  } catch {
    return null;
  }
}
