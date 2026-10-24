import type { NextApiRequest, NextApiResponse } from 'next';
import type { Operator } from '@/lib/operators/operatorTypes';
import { contentRoute } from '@/lib/content/types';
import { readPublishedContentPageProps } from '@/lib/content/release';
import { buildGachaOperatorPreview } from '@/lib/gacha/operatorPreviewData';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const name = req.query.name;
  if (typeof name !== 'string' || !name || name.length > 120 || /[/\\\x00-\x1f\x7f]/.test(name)) {
    return res.status(400).json({ error: 'Invalid operator name' });
  }

  let operator: Operator | undefined;
  try {
    const route = contentRoute('/operators/[name]', { name });
    const published = await readPublishedContentPageProps<{ operator?: Operator }>(route);
    operator = published?.operator;
  } catch (error) {
    if (process.env.VERCEL === '1' || process.env.ARKPEDIA_WORKER === '1') {
      console.error('[gacha operator preview] Published content unavailable:', error);
      return res.status(503).json({ error: 'Operator details temporarily unavailable' });
    }
  }

  // Local development and tests still have the source catalogue on disk.
  if (process.env.ARKPEDIA_WORKER !== '1' && !operator && process.env.VERCEL !== '1') {
    const { getOperatorByName } = await import('@/lib/operators/operators');
    operator = getOperatorByName(name);
  }
  if (!operator) return res.status(404).json({ error: 'Operator not found' });

  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
  return res.status(200).json(buildGachaOperatorPreview(operator));
}
