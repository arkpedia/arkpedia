import type { NextApiRequest, NextApiResponse } from 'next';
import type { Operator } from '@/lib/operators/operatorTypes';
import { contentRoute } from '@/lib/content/types';
import { readPublishedContentPageProps } from '@/lib/content/release';
import type { OperatorBuildData } from '@/lib/ccb/types';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Method not allowed' }); }
  const name = req.query.name;
  if (typeof name !== 'string' || !name || name.length > 120 || /[/\\\x00-\x1f\x7f]/.test(name)) return res.status(400).json({ error: 'Invalid operator name' });
  let operator: Operator | undefined;
  try { operator = (await readPublishedContentPageProps<{ operator: Operator }>(contentRoute('/operators/[name]', { name })))?.operator; }
  catch { if (process.env.ARKPEDIA_WORKER === '1' || process.env.VERCEL === '1') return res.status(503).json({ error: 'Operator data temporarily unavailable' }); }
  // Local next start uses production mode too; its pinned browser build reads
  // the on-disk catalogue. Keep the deployment guards inline so webpack can
  // exclude this import; hosted Workers only read verified published content.
  if (process.env.ARKPEDIA_WORKER !== '1' && process.env.VERCEL !== '1' && !operator) {
    const { getOperatorByName } = await import('@/lib/operators/operators');
    operator = getOperatorByName(name);
  }
  if (!operator) return res.status(404).json({ error: 'Operator not found' });
  const data: OperatorBuildData = { name, rarity: operator.rarity, className: operator.class, position: operator.position, stats: operator.stats ?? null, potential: operator.potential, modules: operator.modules ?? [] };
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
  return res.status(200).json(data);
}
