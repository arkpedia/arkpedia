import type { NextApiRequest, NextApiResponse } from 'next';
import { loadRelease, readPageProps } from '@/lib/content/release';
import { contentRoute } from '@/lib/content/types';
import { contentUrl } from '@/lib/content/urls';
import type { OperatorVoiceData } from '@/lib/operators/operatorVoices';
import { clipUrl, hasRecording } from '@/lib/operators/voiceRecording.mjs';

/** A public recorded title line, never an account lookup or a Yostar request. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).end(); }
  const operator = req.query.operator;
  if (typeof operator !== 'string' || !operator || operator.length > 120 || /[/\\\x00-\x1f\x7f]/.test(operator)) return res.status(400).end();
  try {
    const release = await loadRelease();
    let data = release ? (await readPageProps(release, contentRoute('/operators/[name]', { name: operator })))?.voiceData as OperatorVoiceData | undefined : undefined;
    if (!data && process.env.NODE_ENV === 'development') {
      const { getOperatorByName } = await import('@/lib/operators/operators');
      const { getOperatorVoiceData } = await import('@/lib/operators/operatorVoices');
      data = getOperatorVoiceData(getOperatorByName(operator)?.internalName) ?? undefined;
    }
    const line = data?.lines.find(line => line.title === 'Title' && line.status === 'current');
    const pack = ['jp', 'en', 'cn', 'kr'].flatMap(id => data?.packs.filter(pack => pack.id === id && pack.status === 'current' && line && hasRecording(line, pack)) ?? [])[0];
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    if (!line || !pack) return res.status(200).json(null);
    return res.status(200).json({ name: operator, language: pack.label, url: contentUrl(clipUrl(pack.audioTemplate, line.id)!, release?.context) });
  } catch { return res.status(503).json({ error: 'Greeting unavailable' }); }
}
