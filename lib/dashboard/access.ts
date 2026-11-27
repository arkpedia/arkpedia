import type { IncomingHttpHeaders } from 'node:http';
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { NextApiRequest, NextApiResponse } from 'next';

interface DashboardEnv {
  ARKPEDIA_ACCOUNTS_DB?: D1Database;
  ARKPEDIA_DEPLOYMENT_ROLE?: string;
  ARKPEDIA_AUTH_URL?: string;
  NEXT_INC_CACHE_R2_BUCKET?: R2Bucket;
  ARKPEDIA_DASHBOARD_ORIGIN?: string;
  ARKPEDIA_DASHBOARD_ACCESS_ISSUER?: string;
  ARKPEDIA_DASHBOARD_ACCESS_AUD?: string;
  ARKPEDIA_RELEASE_QUEUE_GITHUB_TOKEN?: string;
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

export async function dashboardRequest(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  const env = dashboardEnv();
  const actor = await dashboardActor(env, req.headers);
  if (!actor) {
    res.status(403).end();
    return null;
  }
  return { env, actor };
}

export function acceptDashboardWrite(env: DashboardEnv, req: NextApiRequest, res: NextApiResponse): boolean {
  if (req.headers.origin !== dashboardOrigin(env)?.origin) {
    res.status(403).end();
    return false;
  }
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') {
    res.status(415).end();
    return false;
  }
  return true;
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
