import type { NextApiRequest, NextApiResponse } from 'next';
import type { OperatorVoiceData } from '@/lib/operators/operatorVoices';
import { contentRoute } from '@/lib/content/types';
import { readPublishedContentPageProps } from '@/lib/content/release';
import { artworkVoicePacks } from '@/lib/skins/artworkVoices';

/** Voice metadata only; audio is fetched when the reader plays a line. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).end(); }
  const { operator, skinId } = req.query;
  if (typeof operator !== 'string' || !operator || operator.length > 120 || /[/\\\x00-\x1f\x7f]/.test(operator)
    || typeof skinId !== 'string' || !/^char_[A-Za-z0-9_]+(?:@[A-Za-z0-9_]+)?#\d+$/.test(skinId)) return res.status(400).end();
  let data: OperatorVoiceData | null | undefined;
  try { data = (await readPublishedContentPageProps<{ voiceData?: OperatorVoiceData }>(contentRoute('/operators/[name]', { name: operator })))?.voiceData; }
  catch { if (process.env.NODE_ENV !== 'development') return res.status(503).end(); }
  if (process.env.NODE_ENV === 'development' && !data) {
    const { getOperatorByName } = await import('@/lib/operators/operators');
    const { getOperatorVoiceData } = await import('@/lib/operators/operatorVoices');
    data = getOperatorVoiceData(getOperatorByName(operator)?.internalName);
  }
  const packs = artworkVoicePacks(data, skinId);
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
  // Keep the original response for already-open clients from before the language selector.
  return res.status(200).json(req.query.languages === 'all' ? packs
    : (packs.find(pack => pack.id === 'cn')?.voices ?? []).map(voice => ({ ...voice, title: `${voice.title} (CN)` })));
}
