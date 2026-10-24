import type { NextApiRequest, NextApiResponse } from 'next';
import { toNodeHandler } from 'better-auth/node';
import { accountAuth, accountsEnv } from '@/lib/cloud-account/server';

export const config = { api: { bodyParser: false } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const env = accountsEnv();
  if (!env) return res.status(503).json({ error: 'Arkpedia sign-in is not configured on this deployment.' });
  try { await toNodeHandler(accountAuth(env).handler)(req, res); }
  catch { if (!res.headersSent) res.status(503).json({ error: 'Sign-in is temporarily unavailable. Please try again.' }); }
}
