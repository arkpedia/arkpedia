import type { NextApiRequest, NextApiResponse } from 'next';
import type { OperatorVoiceData } from '@/lib/operators/operatorVoices';
import { contentRoute } from '@/lib/content/types';
import { readPublishedContentPageProps } from '@/lib/content/server';
import { clipUrl, hasRecording } from '@/lib/operators/voiceRecording.mjs';

/** Only the outfit's CN recordings: its controller's choreography is timed to those lines. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).end(); }
  const { operator, skinId } = req.query;
  if (typeof operator !== 'string' || !operator || operator.length > 120 || /[/\\\x00-\x1f\x7f]/.test(operator)
    || typeof skinId !== 'string' || !/^char_[A-Za-z0-9_]+(?:@[A-Za-z0-9_]+)?#\d+$/.test(skinId)) return res.status(400).end();
  let data: OperatorVoiceData | null | undefined;
  try { data = (await readPublishedContentPageProps<{ voiceData?: OperatorVoiceData }>(contentRoute('/operators/[name]', { name: operator })))?.voiceData; }
  catch { if (process.env.VERCEL === '1') return res.status(503).end(); }
  if (!data && process.env.VERCEL !== '1') {
    const { getOperatorByName } = await import('@/lib/operators/operators');
    const { getOperatorVoiceData } = await import('@/lib/operators/operatorVoices');
    data = getOperatorVoiceData(getOperatorByName(operator)?.internalName);
  }
  const set = data?.skinVoices?.find(s => s.skinIds.includes(skinId));
  const pack = set?.packs.find(p => p.id === 'cn' && p.status === 'current');
  const voices = pack ? set!.lines.filter(l => hasRecording(l, pack)).map(l => ({ id: l.id, title: `${l.title} (CN)`, url: clipUrl(pack.audioTemplate, l.id)! })) : [];
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
  return res.status(200).json(voices);
}
